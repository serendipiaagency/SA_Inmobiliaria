import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import type { EmailLocale } from './layout'
import type { TemplateKey } from './templates'
import { recipientNames, renderTemplateEmail } from './render'
import { attemptSend } from './send'
import { EMAIL_RE, clean, platformEmailConfig } from './platformConfig'

export { PLATFORM_EMAIL_DEFAULTS, platformEmailConfig, type PlatformEmailConfig } from './platformConfig'

/**
 * Email de PLATAFORMA: lo que Portal INMO envía a las empresas y al
 * super admin sobre el alta y el estado de las empresas. Es distinto del
 * email de cada empresa (server/utils/email/send.ts → resolveOrgEmailIdentity),
 * que sale con la identidad que cada inmobiliaria configura para sus clientes.
 *
 * Remitente corporativo CENTRAL — ningún template lo lleva escrito:
 *
 *   PLATFORM_EMAIL_FROM_NAME     (por defecto "Portal INMO")
 *   PLATFORM_EMAIL_FROM_ADDRESS  (por defecto "info@serendipiaagency.com")
 *   PLATFORM_EMAIL_REPLY_TO      (por defecto, la misma dirección; independiente del FROM)
 *   PLATFORM_EMAIL_CONTACT       (el correo del bloque «¿Hablamos?»; por defecto info@serendipiaagency.com)
 *   PLATFORM_ADMIN_NOTIFY_EMAILS (destinatarios del super admin, separados por comas;
 *                                 si no se define, los usuarios con rol super_admin)
 *
 * Mismo proveedor, mismo email_log y misma cola de reintentos que el resto
 * (Resend vía attemptSend). Resend sólo acepta el envío si el dominio del
 * remitente (serendipiaagency.com) está verificado en esa cuenta: si no lo
 * está, la llamada falla, queda registrada y se reintenta — nunca se cambia
 * el remitente por otro ni se finge el envío.
 */

/** Templates que SÓLO salen con la identidad de plataforma. */
export const PLATFORM_TEMPLATES = [
  'company_registration_welcome',
  'admin_company_registered',
  'company_status_changed',
  'company_deactivated',
  'admin_company_status_changed',
  'company_approved',
  'company_pending',
  'company_admin_invite',
] as const satisfies readonly TemplateKey[]
export type PlatformTemplateKey = (typeof PLATFORM_TEMPLATES)[number]

/**
 * A quién avisar como super admin. Configuración explícita primero; si no
 * hay, las cuentas con rol super_admin — nunca los admins de las empresas.
 */
export async function platformAdminRecipients(db: any, env: Record<string, any> = {}): Promise<string[]> {
  const configured = clean(env.PLATFORM_ADMIN_NOTIFY_EMAILS)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => EMAIL_RE.test(s))
  if (configured.length) return [...new Set(configured)]
  const rows = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.role, 'super_admin'))
  return [...new Set(rows.map((r: { email: string }) => r.email.toLowerCase()).filter((e: string) => EMAIL_RE.test(e)))] as string[]
}

export type PlatformEmailStatus = 'sent' | 'queued' | 'failed' | 'skipped'

export interface PlatformEmailResult {
  recipient: string
  status: PlatformEmailStatus
  logId: number | null
  /** false cuando el proveedor no está configurado (falta RESEND_API_KEY). */
  connected: boolean
}

export interface SendPlatformEmailOpts {
  /** La empresa de la que trata el email: así queda trazado en su email_log. */
  organizationId: number
  template: PlatformTemplateKey
  to: string | string[]
  data: Record<string, any>
  locale?: EmailLocale
  /**
   * Idempotencia: si ya existe un envío de este template a este destinatario
   * para esta empresa, no se repite (un reintento de la petición no manda
   * dos bienvenidas). Desactivar sólo para avisos que pueden repetirse
   * legítimamente (cambios de estado).
   */
  once?: boolean
  requestId?: string | null
}

export async function sendPlatformEmail(db: any, env: Record<string, any>, opts: SendPlatformEmailOpts): Promise<PlatformEmailResult[]> {
  const config = platformEmailConfig(env)
  const locale = opts.locale || 'es'
  const recipients = [...new Set((Array.isArray(opts.to) ? opts.to : [opts.to]).map((r) => clean(r).toLowerCase()).filter((r) => EMAIL_RE.test(r)))]
  const names = await recipientNames(db, recipients)

  const results: PlatformEmailResult[] = []
  for (const recipient of recipients) {
    // Plantilla maestra de Portal INMO; el saludo lleva el nombre de la cuenta si la hay.
    const { subject, html } = renderTemplateEmail(opts.template, opts.data, locale, {
      branding: { companyName: config.fromName },
      contactEmail: config.contactAddress,
      recipientName: names.get(recipient) ?? null,
    })
    if (opts.once) {
      const [prev] = await db
        .select({ id: schema.emailLog.id })
        .from(schema.emailLog)
        .where(and(eq(schema.emailLog.organizationId, opts.organizationId), eq(schema.emailLog.template, opts.template), eq(schema.emailLog.recipient, recipient)))
        .limit(1)
      if (prev) {
        results.push({ recipient, status: 'skipped', logId: prev.id, connected: true })
        continue
      }
    }
    const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const [row] = await db
      .insert(schema.emailLog)
      .values({
        organizationId: opts.organizationId,
        template: opts.template,
        kind: 'transactional',
        recipient,
        fromHeader: config.fromHeader,
        replyTo: config.replyTo,
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
    const sent = await attemptSend(db, env, row.id)
    results.push({ recipient, status: sent.status, logId: row.id, connected: sent.connected })
  }
  return results
}

/** Resumen de varios resultados para quien tiene que decir la verdad en pantalla. */
export function summarizeEmailResults(results: PlatformEmailResult[]): 'sent' | 'queued' | 'failed' | 'not_configured' | 'none' {
  if (!results.length) return 'none'
  if (results.every((r) => r.status === 'sent' || r.status === 'skipped')) return 'sent'
  if (results.some((r) => !r.connected)) return 'not_configured'
  if (results.some((r) => r.status === 'queued')) return 'queued'
  return 'failed'
}
