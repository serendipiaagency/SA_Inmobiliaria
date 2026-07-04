import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)
  const type = String(q.type || '')
  const stage = String(q.stage || '')
  const search = String(q.search || '').trim()

  const where: string[] = []
  const binds: any[] = []
  if (type && type !== 'all') { where.push('type = ?'); binds.push(type) }
  if (stage && stage !== 'all') { where.push('stage = ?'); binds.push(stage) }
  if (search) { where.push('(name LIKE ? OR email LIKE ? OR location LIKE ?)'); binds.push(`%${search}%`, `%${search}%`, `%${search}%`) }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const rows = (
    await raw
      .prepare(
        `SELECT id, name, email, phone, type, stage, lifetime_value AS lifetimeValue, deals_count AS dealsCount,
                agent_name AS agentName, location, created_at AS createdAt
         FROM clients ${clause} ORDER BY lifetime_value DESC LIMIT 200`,
      )
      .bind(...binds)
      .all<any>()
  ).results

  const agg = await raw
    .prepare("SELECT count(*) AS total, coalesce(sum(lifetime_value),0) AS ltv, coalesce(sum(deals_count),0) AS deals, sum(CASE WHEN stage='active' THEN 1 ELSE 0 END) AS active FROM clients")
    .first<any>()

  return { rows, stats: agg }
})
