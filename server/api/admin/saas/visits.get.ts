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
        `SELECT id, client_name AS clientName, property_name AS propertyName, agent_name AS agentName,
                scheduled_at AS scheduledAt, status, channel
         FROM visits ${clause} ORDER BY scheduled_at DESC LIMIT 200`,
      )
      .bind(...binds)
      .all<any>()
  ).results

  const byStatus = (
    await raw.prepare('SELECT status, count(*) AS n FROM visits WHERE organization_id = ?1 GROUP BY status').bind(orgId).all<{ status: string; n: number }>()
  ).results
  const counts: Record<string, number> = {}
  for (const r of byStatus) counts[r.status] = r.n
  return { rows, counts }
})
