import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { renderEmailLayout, type EmailLocale } from './layout'
import { TEMPLATES, type TemplateKey } from './templates'
import { callResendApi } from './resendClient'

const PLATFORM_DEFAULT_FROM_NAME = 'SA Inmobiliaria'
const PLATFORM_DEFAULT_FROM_ADDRESS = 'notificaciones@sa-inmobiliaria.com'

/** Retry backoff schedule in minutes — 5 attempts total, then permanently 'failed' ("reintentos limitados"). */
export const MAX_EMAIL_ATTEMPTS = 5
const RETRY_DELAYS_MINUTES = [2, 10, 30, 120, 360]

function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function addMinutesIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString().replace('T', ' ').slice(0, 19)
}

interface OrgEmailIdentity {
  fromHeader: string
  replyTo: string | null
  locale: EmailLocale
  branding: { companyName: string; logo: string | null; brandColor: string | null }
  internalRecipients: string[]
}

async function resolveOrgEmailIdentity(db: any, organizationId: number): Promise<OrgEmailIdentity> {
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1)
  const companyName = org?.companyName || org?.name || PLATFORM_DEFAULT_FROM_NAME
  const senderName = org?.emailSenderName || companyName
  const senderAddress = org?.emailSenderAddress || PLATFORM_DEFAULT_FROM_ADDRESS
  let internalRecipients: string[]
  try {
    internalRecipients = JSON.parse(org?.emailInternalRecipientsJson || '[]')
  } catch {
    internalRecipients = []
  }
  return {
    fromHeader: `${senderName} <${senderAddress}>`,
    replyTo: org?.emailReplyTo || null,
    locale: (org?.emailLocale as EmailLocale) || 'es',
    branding: { companyName, logo: org?.logo || null, brandColor: org?.brandColor || null },
    internalRecipients: internalRecipients.filter((r) => typeof r === 'string' && r.includes('@')),
  }
}

export interface SendTransactionalEmailOpts {
  organizationId: number
  template: TemplateKey
  /** One or more recipients — one email_log row and one Resend call per recipient, so delivery/bounce status is unambiguous per address. */
  to: string | string[]
  data: Record<string, any>
  locale?: EmailLocale
  unsubscribeUrl?: string | null
  /** Correlation id (server/utils/requestId.ts) of the request that triggered this send, when there is one — see email_log.requestId. */
  requestId?: string | null
}

export interface SendTransactionalEmailResult {
  logId: number
  recipient: string
  status: 'sent' | 'queued' | 'failed'
  ok: boolean
  connected: boolean
  message: string
}

/**
 * Sends one transactional/commercial email and records the real outcome in
 * email_log — never marks it 'delivered' (that only happens when
 * server/api/resend/webhook.post.ts confirms it). A failed attempt is
 * recorded as 'queued' with a retry scheduled
 * (server/tasks/notifications/retry-email-queue.ts picks it up), never
 * silently dropped — this is what "no marques como entregada si Resend no
 * confirma" and "cola de fallos" both require at once: an accepted call is
 * 'sent', a failed one is retried, and only the webhook ever writes
 * 'delivered'/'bounced'/'complained'.
 */
export async function sendTransactionalEmail(db: any, env: Record<string, any>, opts: SendTransactionalEmailOpts): Promise<SendTransactionalEmailResult[]> {
  const identity = await resolveOrgEmailIdentity(db, opts.organizationId)
  const template = TEMPLATES[opts.template]
  const locale = opts.locale || identity.locale
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(Boolean)

  const subject = template.subject(opts.data, locale)
  const bodyHtml = template.body(opts.data, locale)
  const html = renderEmailLayout({
    branding: identity.branding,
    locale,
    title: subject,
    bodyHtml,
    kind: template.kind,
    unsubscribeUrl: template.kind === 'commercial' ? opts.unsubscribeUrl : null,
  })

  const results: SendTransactionalEmailResult[] = []
  for (const recipient of recipients) {
    const createdAt = nowIso()
    const [logRow] = await db
      .insert(schema.emailLog)
      .values({
        organizationId: opts.organizationId,
        template: opts.template,
        kind: template.kind,
        recipient,
        fromHeader: identity.fromHeader,
        replyTo: identity.replyTo,
        subject,
        html,
        locale,
        provider: 'resend',
        status: 'queued',
        attempts: 0,
        createdAt,
        requestId: opts.requestId || null,
      })
      .returning({ id: schema.emailLog.id })

    const result = await attemptSend(db, env, logRow.id)
    results.push({ logId: logRow.id, recipient, ...result })
  }
  return results
}

/** Internal notifications (new lead, contact form, complaint, contract accepted) go to the org's own configured staff inbox, not a client. */
export async function sendInternalNotification(
  db: any,
  env: Record<string, any>,
  organizationId: number,
  template: TemplateKey,
  data: Record<string, any>,
  requestId?: string | null,
): Promise<SendTransactionalEmailResult[]> {
  const identity = await resolveOrgEmailIdentity(db, organizationId)
  if (!identity.internalRecipients.length) return []
  return sendTransactionalEmail(db, env, { organizationId, template, to: identity.internalRecipients, data, requestId })
}

/**
 * One real send attempt against Resend + the email_log bookkeeping around
 * it — reads everything it needs (recipient/from/subject/html) straight off
 * the row, so it's equally usable for the initial synchronous attempt and
 * for the retry task (server/tasks/notifications/retry-email-queue.ts)
 * picking the same row back up later; no caller needs to re-render or
 * re-resolve org branding to retry a send.
 */
export async function attemptSend(db: any, env: Record<string, any>, logId: number): Promise<{ status: 'sent' | 'queued' | 'failed'; ok: boolean; connected: boolean; message: string }> {
  const [row] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.id, logId)).limit(1)
  if (!row) return { status: 'failed', ok: false, connected: false, message: 'email_log row not found' }
  const attempts = (row.attempts ?? 0) + 1

  const result = await callResendApi(env, { from: row.fromHeader, replyTo: row.replyTo, to: row.recipient, subject: row.subject, html: row.html })

  if (result.ok) {
    await db
      .update(schema.emailLog)
      .set({ status: 'sent', externalId: result.id || null, attempts, sentAt: nowIso(), errorMessage: null, nextRetryAt: null })
      .where(eq(schema.emailLog.id, logId))
    return { status: 'sent', ok: true, connected: true, message: result.message }
  }

  const exhausted = attempts >= MAX_EMAIL_ATTEMPTS
  await db
    .update(schema.emailLog)
    .set({
      status: exhausted ? 'failed' : 'queued',
      attempts,
      errorMessage: result.message,
      nextRetryAt: exhausted ? null : addMinutesIso(RETRY_DELAYS_MINUTES[Math.min(attempts - 1, RETRY_DELAYS_MINUTES.length - 1)]),
    })
    .where(eq(schema.emailLog.id, logId))

  return { status: exhausted ? 'failed' : 'queued', ok: false, connected: result.connected, message: result.message }
}
