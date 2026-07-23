import { requireOrgScope } from '../../../utils/auth'

/**
 * Per-org rows are namespaced `org:<id>:<key>` (see settings.post.ts for why).
 * Org 1 additionally falls back to the old un-namespaced keys — this is the
 * pre-existing tenant, and its settings may already have real values saved
 * before this namespacing existed; those must keep showing up, not vanish.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const out: Record<string, string> = {}

  if (orgId === 1) {
    const legacyRows = (await raw.prepare('SELECT key, value FROM settings WHERE key NOT LIKE ?1').bind('org:%').all<{ key: string; value: string }>()).results
    for (const r of legacyRows) out[r.key] = r.value
  }

  const prefix = `org:${orgId}:`
  const rows = (await raw.prepare('SELECT key, value FROM settings WHERE key LIKE ?1').bind(`${prefix}%`).all<{ key: string; value: string }>()).results
  for (const r of rows) out[r.key.slice(prefix.length)] = r.value // namespaced values win over legacy fallback

  return out
})
