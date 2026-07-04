import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const rows = (await raw.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()).results
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
})
