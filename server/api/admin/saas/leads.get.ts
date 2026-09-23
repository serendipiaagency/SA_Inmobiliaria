import { requireOrgScope } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)
  const status = String(q.status || '')
  const source = String(q.source || '')
  const search = String(q.search || '').trim()

  const where: string[] = ['organization_id = ?']
  const binds: any[] = [orgId]
  if (status && status !== 'all') { where.push('status = ?'); binds.push(status) }
  if (source && source !== 'all') { where.push('source = ?'); binds.push(source) }
  if (search) { where.push('(name LIKE ? OR email LIKE ? OR property_name LIKE ?)'); binds.push(`%${search}%`, `%${search}%`, `%${search}%`) }
  const clause = `WHERE ${where.join(' AND ')}`

  const rows = (
    await raw
      .prepare(
        `SELECT id, name, email, phone, source, source_detail AS sourceDetail, status, stage, lost_reason AS lostReason,
                priority, score, budget, property_name AS propertyName,
                agent_name AS agentName, last_contact_at AS lastContactAt, created_at AS createdAt
         FROM leads ${clause} ORDER BY created_at DESC LIMIT 200`,
      )
      .bind(...binds)
      .all<any>()
  ).results

  // El Kanban agrupa por stage (FASE 13) — status se queda para la tabla y
  // para quien todavía filtre por él, pero ya no es la dimensión de posición.
  const byStage = (
    await raw
      .prepare('SELECT stage, count(*) AS n FROM leads WHERE organization_id = ? AND status != ? GROUP BY stage')
      .bind(orgId, 'lost')
      .all<{ stage: string; n: number }>()
  ).results
  const counts: Record<string, number> = {}
  for (const r of byStage) counts[r.stage] = r.n
  counts.lost = (
    await raw.prepare("SELECT count(*) AS n FROM leads WHERE organization_id = ? AND status = 'lost'").bind(orgId).first<{ n: number }>()
  )?.n || 0

  return { rows, counts, total: rows.length }
})
