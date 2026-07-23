import { requireOrgScope } from '../../../utils/auth'
import { now } from '../../../utils/db'

const ALLOWED = ['company_name', 'currency', 'locale', 'timezone', 'brand_color', 'notify_email', 'weekly_report']

/**
 * Persist settings (upsert into the shared key/value table). Since `settings.key`
 * is the table's primary key and D1/SQLite can't cheaply widen it to a
 * composite (org_id, key) key, each organization's rows are namespaced by
 * key prefix (`org:<id>:<key>`) instead — same isolation, no schema migration.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const body = await readBody(event)
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
