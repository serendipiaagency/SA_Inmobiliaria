import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { htmlToText, renderEmailLayout, type EmailLocale } from './layout'
import { TEMPLATES, type TemplateKey } from './templates'
import { callResendApi } from './resendClient'
import { SYSTEM_SENDER_TEMPLATES, resolveEffectiveOrgSender } from './orgSender'
import { platformEmailConfig } from './platformConfig'
import { DEMO_BLOCKED_MESSAGE, isDemoOrg } from '../demo/tenant'

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

/**
 * Remitente y marca con los que sale un email de esta empresa. El remitente
 * lo decide effectiveOrgSender() (server/utils/email/orgSender.ts): su propia
 * dirección sólo cuando su dominio está verificado en Resend; si no,
 * «Empresa <remitente de la plataforma>» con Responder-a el correo de la
 * empresa (el que configuró o, si no, el de su administrador).
 * Antes caía en `notificaciones@sa-inmobiliaria.com`, un dominio que no existe,
 * y usaba la dirección de la empresa aunque nadie la hubiera verificado:
 * Resend habría rechazado todos esos envíos.
 */
async function resolveOrgEmailIdentity(db: any, env: Record<string, any>, organizationId: number): Promise<OrgEmailIdentity> {
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1)
  const companyName = org?.companyName || org?.name || platformEmailConfig(env).fromName
  const sender = await resolveEffectiveOrgSender(db, env, org)
  let internalRecipients: string[]
  try {
    internalRecipients = JSON.parse(org?.emailInternalRecipientsJson || '[]')
  } catch {
    internalRecipients = []
  }
  return {
    fromHeader: sender.fromHeader,
    replyTo: sender.replyTo,
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
  /**
   * Responder-a de ESTE envío en lugar del de la empresa (FASE 29, email
   * entrante: la dirección firmada de un hilo web, server/utils/comms/inboundAddress.ts).
   * Sólo cambia el Reply-To — el remitente sigue siendo el de la empresa o el
   * de la plataforma. Sin él (o vacío), todo queda exactamente como antes.
   */
  replyTo?: string | null
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
  const identity = await resolveOrgEmailIdentity(db, env, opts.organizationId)
  // Cuenta y avisos del sistema (bienvenida, recuperar contraseña…): siempre
  // desde el remitente de la plataforma, con la marca de la empresa en el cuerpo.
  if (SYSTEM_SENDER_TEMPLATES.has(opts.template)) {
    const platform = platformEmailConfig(env)
    identity.fromHeader = platform.fromHeader
    identity.replyTo = platform.replyTo
  }
  if (opts.replyTo) identity.replyTo = opts.replyTo
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
  const identity = await resolveOrgEmailIdentity(db, env, organizationId)
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

  // Cuenta demo: el email queda registrado como NO enviado, con el motivo, y
  // sin reintentos. Ni se llama a Resend ni se finge el envío.
  if (await isDemoOrg(db, row.organizationId)) {
    await db
      .update(schema.emailLog)
      // provider 'none': nunca se le entregó a Resend, así que tampoco cuenta
      // en la salud del correo de la plataforma (Sistema → Estado).
      .set({ status: 'failed', provider: 'none', attempts, errorMessage: DEMO_BLOCKED_MESSAGE, nextRetryAt: null })
      .where(eq(schema.emailLog.id, logId))
    return { status: 'failed', ok: false, connected: true, message: DEMO_BLOCKED_MESSAGE }
  }

  const result = await callResendApi(env, { from: row.fromHeader, replyTo: row.replyTo, to: row.recipient, subject: row.subject, html: row.html, text: htmlToText(row.html) })

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
