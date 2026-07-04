import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)
  const status = String(q.status || '')
  const source = String(q.source || '')
  const search = String(q.search || '').trim()

  const where: string[] = []
  const binds: any[] = []
  if (status && status !== 'all') { where.push('status = ?'); binds.push(status) }
  if (source && source !== 'all') { where.push('source = ?'); binds.push(source) }
  if (search) { where.push('(name LIKE ? OR email LIKE ? OR property_name LIKE ?)'); binds.push(`%${search}%`, `%${search}%`, `%${search}%`) }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const rows = (
    await raw
      .prepare(
        `SELECT id, name, email, phone, source, status, score, budget, property_name AS propertyName,
                agent_name AS agentName, last_contact_at AS lastContactAt, created_at AS createdAt
         FROM leads ${clause} ORDER BY created_at DESC LIMIT 200`,
      )
      .bind(...binds)
      .all<any>()
  ).results

  const byStatus = (
    await raw.prepare('SELECT status, count(*) AS n FROM leads GROUP BY status').all<{ status: string; n: number }>()
  ).results
  const counts: Record<string, number> = {}
  for (const r of byStatus) counts[r.status] = r.n

  return { rows, counts, total: rows.length }
})
