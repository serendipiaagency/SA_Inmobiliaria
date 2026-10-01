import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { rowsToCsv } from '../../../utils/properties/searchService'
import { getLeadScoreDetail } from '../../../utils/leads/score'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)

  // FASE 32 — «¿Por qué tiene este score?»: desglose vigente + historial de
  // un lead, como rama de lectura de este listado (margen de claves de ruta
  // = 0). Acotado por organización como todo lo demás aquí.
  if (q.scoreFor !== undefined) {
    const leadId = parseInt(String(q.scoreFor), 10)
    if (!leadId) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
    const detail = await getLeadScoreDetail(useDb(event), orgId, leadId)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })
    return detail
  }

  const status = String(q.status || '')
  const source = String(q.source || '')
  const search = String(q.search || '').trim()

  const where: string[] = ['organization_id = ?']
  const binds: any[] = [orgId]
  if (status && status !== 'all') { where.push('status = ?'); binds.push(status) }
  if (source && source !== 'all') { where.push('source = ?'); binds.push(source) }
  if (search) { where.push('(name LIKE ? OR email LIKE ? OR property_name LIKE ?)'); binds.push(`%${search}%`, `%${search}%`, `%${search}%`) }
  // FASE 33 §101 — el detalle de cada KPI del dashboard comercial abre este
  // listado con el mismo scope: periodo de alta o de cualificación, comercial,
  // oficina, portal, campaña, inmueble y «sin atender» (alerta SLA abierta).
  const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const createdFrom = day(q.createdFrom)
  const createdTo = day(q.createdTo)
  if (createdFrom) { where.push('created_at >= ?'); binds.push(`${createdFrom} 00:00:00`) }
  if (createdTo) { where.push('created_at <= ?'); binds.push(`${createdTo} 23:59:59`) }
  const qualifiedFrom = day(q.qualifiedFrom)
  const qualifiedTo = day(q.qualifiedTo)
  if (qualifiedFrom) { where.push('qualified_at >= ?'); binds.push(`${qualifiedFrom} 00:00:00`) }
  if (qualifiedTo) { where.push('qualified_at <= ?'); binds.push(`${qualifiedTo} 23:59:59`) }
  const agentIdFilter = parseInt(String(q.agentId || ''), 10)
  if (agentIdFilter > 0) { where.push('agent_id = ?'); binds.push(agentIdFilter) }
  if (q.office) { where.push('agent_id IN (SELECT id FROM team_members WHERE organization_id = ? AND office_name = ?)'); binds.push(orgId, String(q.office)) }
  if (q.portal) { where.push('portal = ?'); binds.push(String(q.portal)) }
  if (q.campaign) { where.push('(campaign = ? OR utm_campaign = ?)'); binds.push(String(q.campaign), String(q.campaign)) }
  const propertyIdFilter = parseInt(String(q.propertyId || ''), 10)
  if (propertyIdFilter > 0) { where.push('property_id = ?'); binds.push(propertyIdFilter) }
  if (q.unattended === '1') { where.push("id IN (SELECT lead_id FROM lead_sla_alerts WHERE organization_id = ? AND type = 'unattended' AND status = 'open')"); binds.push(orgId) }

  // FASE 32 §74 — filtrar y ordenar por Lead Score.
  const scoreMin = q.scoreMin !== undefined && q.scoreMin !== '' ? Number(q.scoreMin) : null
  if (scoreMin !== null && Number.isFinite(scoreMin)) { where.push('score >= ?'); binds.push(scoreMin) }
  const orderBy = q.sort === 'score' ? 'score DESC, created_at DESC' : 'created_at DESC'
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
           FROM leads ${clause} ORDER BY ${orderBy} LIMIT 2000`,
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
                next_action_type AS nextActionType, next_action_at AS nextActionAt, contact_id AS contactId,
                score_computed_at AS scoreComputedAt
         FROM leads ${clause} ORDER BY ${orderBy} LIMIT 200`,
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
