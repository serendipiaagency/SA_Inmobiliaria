import { requireOrgScope } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)
  const status = String(q.status || '')
  const where: string[] = ['organization_id = ?']
  const binds: any[] = [orgId]
  if (status && status !== 'all') { where.push('status = ?'); binds.push(status) }
  const clause = `WHERE ${where.join(' AND ')}`

  const rows = (
    await raw
      .prepare(
        `SELECT id, reference, client_name AS clientName, property_name AS propertyName, amount, deposit,
                status, reserved_at AS reservedAt
         FROM reservations ${clause} ORDER BY reserved_at DESC LIMIT 200`,
      )
      .bind(...binds)
      .all<any>()
  ).results

  const agg = await raw
    .prepare(
      `SELECT count(*) AS total,
              coalesce(sum(CASE WHEN status IN ('confirmed','completed') THEN amount ELSE 0 END),0) AS securedValue,
              coalesce(sum(CASE WHEN status='pending' THEN amount ELSE 0 END),0) AS pendingValue,
              sum(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
              sum(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
              sum(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
              sum(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled
       FROM reservations WHERE organization_id = ?1`,
    )
    .bind(orgId)
    .first<any>()

  return { rows, stats: agg }
})
