import { parseTagIds } from '../tags/service'

/**
 * El listado de leads (Leads → Pipeline / Tabla) y todo lo que reutiliza su
 * filtro: la paginación de la Tabla, la exportación CSV completa y «seleccionar
 * todos los filtrados» de las acciones masivas (FASE 28, bloque N7b).
 *
 * Antes vivía dentro de `server/api/admin/saas/leads.get.ts` con un tope de
 * 200 filas sin paginar, así que exportar «los filtrados» nunca pasaba de esas
 * 200. Ahora el filtro se escribe UNA vez (`buildLeadListWhere`) y:
 *  - la Tabla pagina (`page`, `perPage` ≤ 200) con el total real;
 *  - la exportación recorre TODO el resultado por lotes de 500 (sin tope);
 *  - las acciones masivas resuelven la selección filtrada en el servidor.
 *
 * SQL crudo (D1 `prepare`), como antes, detrás de un `SqlRunner` para que los
 * tests lo ejerciten contra SQLite real. Ninguna consulta pasa de ~30
 * parámetros: las listas variables (ids) viajan como UN parámetro JSON
 * (`json_each`), nunca un `?` por elemento — D1 admite como máximo 100.
 */

export type SqlRunner = (sql: string, binds: unknown[]) => Promise<any[]>

/** El ejecutor real: D1 del Worker. */
export function d1Runner(d1: D1Database): SqlRunner {
  return async (sql, binds) => ((await d1.prepare(sql).bind(...binds).all<any>()).results as any[]) || []
}

export const LEAD_LIST_MAX_PER_PAGE = 200
export const LEAD_EXPORT_BATCH = 500

const LIST_COLUMNS = `id, name, email, phone, source, source_detail AS sourceDetail, status, stage, lost_reason AS lostReason,
  priority, score, budget, property_name AS propertyName,
  agent_id AS agentId, agent_name AS agentName, last_contact_at AS lastContactAt, created_at AS createdAt,
  next_action_type AS nextActionType, next_action_at AS nextActionAt, contact_id AS contactId, first_response_at AS firstResponseAt,
  score_computed_at AS scoreComputedAt, office_id AS officeId, team_id AS teamId, language,
  first_contact_at AS firstContactAt`

const CSV_COLUMNS = `id, name, email, phone, source, status, stage, lost_reason AS lostReason,
  priority, score, budget, property_name AS propertyName, agent_name AS agentName,
  last_contact_at AS lastContactAt, created_at AS createdAt`

const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const posInt = (v: unknown) => {
  const n = parseInt(String(v ?? ''), 10)
  return n > 0 ? n : null
}

/**
 * WHERE + ORDER BY del listado, siempre acotado a la organización y sin los
 * leads borrados. Mismos parámetros de siempre (búsqueda, origen, estado,
 * oficina, prioridad, el detalle de un KPI del dashboard, puntuación, ids) y
 * `tags` (etiquetas, todas las indicadas).
 */
export function buildLeadListWhere(orgId: number, q: Record<string, any>): { clause: string; binds: unknown[]; orderBy: string } {
  const where: string[] = ['organization_id = ?', 'deleted_at IS NULL']
  const binds: unknown[] = [orgId]
  const status = String(q.status || '')
  const source = String(q.source || '')
  const search = String(q.search || '').trim()
  if (status && status !== 'all') { where.push('status = ?'); binds.push(status) }
  if (source && source !== 'all') { where.push('source = ?'); binds.push(source) }
  if (search) { where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR property_name LIKE ?)'); binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) }
  // FASE 33 §101 — el detalle de cada KPI del dashboard comercial abre este
  // listado con el mismo scope: periodo de alta o de cualificación, comercial,
  // oficina, portal, campaña, inmueble y «sin atender» (alerta SLA abierta).
  const createdFrom = day(q.createdFrom)
  const createdTo = day(q.createdTo)
  if (createdFrom) { where.push('created_at >= ?'); binds.push(`${createdFrom} 00:00:00`) }
  if (createdTo) { where.push('created_at <= ?'); binds.push(`${createdTo} 23:59:59`) }
  const qualifiedFrom = day(q.qualifiedFrom)
  const qualifiedTo = day(q.qualifiedTo)
  if (qualifiedFrom) { where.push('qualified_at >= ?'); binds.push(`${qualifiedFrom} 00:00:00`) }
  if (qualifiedTo) { where.push('qualified_at <= ?'); binds.push(`${qualifiedTo} 23:59:59`) }
  const agentId = posInt(q.agentId)
  if (agentId) { where.push('agent_id = ?'); binds.push(agentId) }
  if (q.office) { where.push('agent_id IN (SELECT id FROM team_members WHERE organization_id = ? AND office_name = ?)'); binds.push(orgId, String(q.office)) }
  // Oficina y equipo como entidades (migración 0086): los del propio lead.
  const officeId = posInt(q.officeId)
  if (officeId) { where.push('office_id = ?'); binds.push(officeId) }
  // Núcleo N8a — el detalle del dashboard comercial por oficina usa su misma
  // regla: la oficina del lead o, si no tiene, la de su comercial.
  const officeScope = posInt(q.officeScope)
  if (officeScope) { where.push('(office_id = ? OR (office_id IS NULL AND agent_id IN (SELECT id FROM team_members WHERE organization_id = ? AND office_id = ?)))'); binds.push(officeScope, orgId, officeScope) }
  const teamId = posInt(q.teamId)
  if (teamId) { where.push('team_id = ?'); binds.push(teamId) }
  if (q.priority) { where.push('priority = ?'); binds.push(String(q.priority)) }
  if (q.portal) { where.push('portal = ?'); binds.push(String(q.portal)) }
  if (q.campaign) { where.push('(campaign = ? OR utm_campaign = ?)'); binds.push(String(q.campaign), String(q.campaign)) }
  const propertyId = posInt(q.propertyId)
  if (propertyId) { where.push('property_id = ?'); binds.push(propertyId) }
  // Con su catálogo (migración 0089): los de ese catálogo y los antiguos sin catálogo (NULL), como hasta ahora.
  if (propertyId && (q.propertyKind === 'agent' || q.propertyKind === 'developer')) { where.push('(property_kind = ? OR property_kind IS NULL)'); binds.push(q.propertyKind) }
  if (q.unattended === '1' || q.unattended === 1) { where.push("id IN (SELECT lead_id FROM lead_sla_alerts WHERE organization_id = ? AND type = 'unattended' AND status = 'open')"); binds.push(orgId) }
  // FASE 32 §74 — filtrar por Lead Score.
  const scoreMin = q.scoreMin !== undefined && q.scoreMin !== null && q.scoreMin !== '' ? Number(q.scoreMin) : null
  if (scoreMin !== null && Number.isFinite(scoreMin)) { where.push('score >= ?'); binds.push(scoreMin) }
  // Etiquetas (FASE 0): el lead tiene TODAS las indicadas. Una etiqueta de
  // otra agencia no coincide con nada (el enlace se acota por organización).
  for (const tagId of parseTagIds(q.tags ?? q.tagId)) {
    where.push("id IN (SELECT entity_id FROM tag_links WHERE organization_id = ? AND entity_type = 'lead' AND tag_id = ?)")
    binds.push(orgId, tagId)
  }
  // Selección concreta («Exportar seleccionados», INMO): un solo parámetro
  // JSON en vez de un `?` por id — una selección puede tener 200 leads.
  const idsParam = Array.isArray(q.ids) ? q.ids.join(',') : String(q.ids || '').trim()
  if (idsParam) {
    const idList = idsParam
      .split(',')
      .map((s: string) => parseInt(s.trim(), 10))
      .filter((n: number) => Number.isInteger(n) && n > 0)
    if (idList.length) { where.push('id IN (SELECT value FROM json_each(?))'); binds.push(JSON.stringify(idList)) }
  }
  // `id DESC` desempata: con OFFSET, un orden no determinista podría repetir
  // o saltarse filas entre una página (o un lote de exportación) y la siguiente.
  const orderBy = q.sort === 'score' ? 'score DESC, created_at DESC, id DESC' : 'created_at DESC, id DESC'
  return { clause: `WHERE ${where.join(' AND ')}`, binds, orderBy }
}

/** Una página del listado (la Tabla), con el total real del filtro. Sin `page`/`perPage`, las 200 primeras (lo de siempre). */
export async function listLeadsPage(run: SqlRunner, orgId: number, q: Record<string, any>) {
  const { clause, binds, orderBy } = buildLeadListWhere(orgId, q)
  const perPage = Math.min(LEAD_LIST_MAX_PER_PAGE, Math.max(1, parseInt(String(q.perPage || LEAD_LIST_MAX_PER_PAGE), 10) || LEAD_LIST_MAX_PER_PAGE))
  const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1)
  const [countRow] = await run(`SELECT count(*) AS n FROM leads ${clause}`, binds)
  const rows = await run(`SELECT ${LIST_COLUMNS} FROM leads ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...binds, perPage, (page - 1) * perPage])
  return { rows, total: Number(countRow?.n) || 0, page, perPage }
}

/** Nombres de las etiquetas de un lote de leads, en UNA consulta (ids como un único parámetro JSON). */
export async function leadTagNames(run: SqlRunner, orgId: number, leadIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>()
  if (!leadIds.length) return out
  const rows = await run(
    `SELECT tl.entity_id AS leadId, t.name AS name FROM tag_links tl
     JOIN tags t ON t.id = tl.tag_id AND t.organization_id = tl.organization_id
     WHERE tl.organization_id = ? AND tl.entity_type = 'lead' AND tl.entity_id IN (SELECT value FROM json_each(?))
     ORDER BY t.name`,
    [orgId, JSON.stringify(leadIds)],
  )
  for (const r of rows) out.set(Number(r.leadId), [...(out.get(Number(r.leadId)) || []), String(r.name)])
  return out
}

/**
 * TODAS las filas del filtro para el CSV, por lotes de `batchSize` — sin el
 * tope de 200 (ni de 2.000) de antes. Cada lote es una consulta pequeña y del
 * mismo tamaño, así que crecer en leads no hace crecer ninguna consulta.
 */
export async function exportLeadRows(run: SqlRunner, orgId: number, q: Record<string, any>, batchSize = LEAD_EXPORT_BATCH) {
  const { clause, binds, orderBy } = buildLeadListWhere(orgId, q)
  const out: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += batchSize) {
    const batch = await run(`SELECT ${CSV_COLUMNS} FROM leads ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...binds, batchSize, offset])
    const tags = await leadTagNames(run, orgId, batch.map((r) => Number(r.id)))
    for (const r of batch) out.push({ ...r, tags: (tags.get(Number(r.id)) || []).join(' | ') })
    if (batch.length < batchSize) break
  }
  return out
}

/** «Seleccionar todos los filtrados» de las acciones masivas: los ids del filtro, hasta `max + 1` (para poder decir «te pasas»). */
export async function resolveFilteredLeadIds(run: SqlRunner, orgId: number, filters: Record<string, any>, max: number): Promise<number[]> {
  const { clause, binds, orderBy } = buildLeadListWhere(orgId, filters)
  const rows = await run(`SELECT id FROM leads ${clause} ORDER BY ${orderBy} LIMIT ?`, [...binds, max + 1])
  return rows.map((r) => Number(r.id))
}
