import { requireOrgScope } from '../../../utils/auth'
import { rowsToCsv } from '../../../utils/properties/searchService'

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
  // "Exportar seleccionadas" (FASE 28 incremento 3) — mismo criterio de coste
  // cero que `[resource]/index.get.ts` para properties (docs/bulk-actions.md):
  // opt-in, sólo se activa si `ids` llega, el listado normal no lo usa nunca.
  const idsParam = String(q.ids || '').trim()
  if (idsParam) {
    const idList = idsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0)
    if (idList.length) { where.push(`id IN (${idList.map(() => '?').join(',')})`); binds.push(...idList) }
  }
  const clause = `WHERE ${where.join(' AND ')}`

  const wantsCsv = String(q.format || '') === 'csv'
  if (wantsCsv) {
    const csvRows = (
      await raw
        .prepare(
          `SELECT id, name, email, phone, source, status, stage, lost_reason AS lostReason,
                  priority, score, budget, property_name AS propertyName, agent_name AS agentName,
                  last_contact_at AS lastContactAt, created_at AS createdAt
           FROM leads ${clause} ORDER BY created_at DESC LIMIT 2000`,
        )
        .bind(...binds)
        .all<any>()
    ).results
    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', 'attachment; filename="leads.csv"')
    return rowsToCsv(csvRows)
  }

  const rows = (
    await raw
      .prepare(
        `SELECT id, name, email, phone, source, source_detail AS sourceDetail, status, stage, lost_reason AS lostReason,
                priority, score, budget, property_name AS propertyName,
                agent_id AS agentId, agent_name AS agentName, last_contact_at AS lastContactAt, created_at AS createdAt,
                next_action_type AS nextActionType, next_action_at AS nextActionAt, contact_id AS contactId
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
