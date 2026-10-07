import { requireOrgScope } from '../../../utils/auth'
import { now } from '../../../utils/db'
import { handleOrgSenderWrite } from '../../../utils/email/orgSenderHttp'
import { handleEmailPreviewSend } from '../../../utils/email/previewHttp'
import { normalizeCurrency } from '../../../../utils/currency'

const ALLOWED = ['company_name', 'currency', 'locale', 'timezone', 'brand_color', 'notify_email', 'weekly_report']

/**
 * Persist settings (upsert into the shared key/value table). Since `settings.key`
 * is the table's primary key and D1/SQLite can't cheaply widen it to a
 * composite (org_id, key) key, each organization's rows are namespaced by
 * key prefix (`org:<id>:<key>`) instead — same isolation, no schema migration.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  // Remitente de los emails de la empresa (Sistema → Emails): no es un ajuste
  // clave/valor, va a sus columnas de `organizations` y a Resend.
  if (body?.section === 'email-sender') return handleOrgSenderWrite(event, body)
  // Envío de prueba de una plantilla de Portal INMO al correo del propio super admin.
  if (body?.section === 'email-preview') return handleEmailPreviewSend(event, body)
  const { orgId } = await requireOrgScope(event)
  // La moneda es la de los importes de toda la agencia (utils/currency.ts):
  // sólo un código que la plataforma sabe pintar y convertir, normalizado.
  if (body && 'currency' in body) {
    const currency = normalizeCurrency(body.currency)
    if (!currency) throw createError({ statusCode: 422, statusMessage: 'Moneda no válida' })
    body.currency = currency
  }
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const ts = now()
  const stmts: D1PreparedStatement[] = []
  for (const key of ALLOWED) {
    if (body && key in body) {
      const nsKey = `org:${orgId}:${key}`
      stmts.push(
        raw
          .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3')
          .bind(nsKey, String(body[key] ?? ''), ts),
      )
    }
  }
  if (stmts.length) await raw.batch(stmts)
  return { ok: true, updated: stmts.length }
})
