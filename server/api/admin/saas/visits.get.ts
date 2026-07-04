import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)
  const status = String(q.status || '')
  const where = status && status !== 'all' ? 'WHERE status = ?' : ''
  const binds = status && status !== 'all' ? [status] : []

  const rows = (
    await raw
      .prepare(
        `SELECT id, client_name AS clientName, property_name AS propertyName, agent_name AS agentName,
                scheduled_at AS scheduledAt, status, channel
         FROM visits ${where} ORDER BY scheduled_at DESC LIMIT 200`,
      )
      .bind(...binds)
      .all<any>()
  ).results

  const byStatus = (
    await raw.prepare('SELECT status, count(*) AS n FROM visits GROUP BY status').all<{ status: string; n: number }>()
  ).results
  const counts: Record<string, number> = {}
  for (const r of byStatus) counts[r.status] = r.n
  return { rows, counts }
})
