import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { rowsToCsv } from '../../../utils/properties/searchService'
import { getLeadScoreDetail } from '../../../utils/leads/score'
import { d1Runner, exportLeadRows, listLeadsPage } from '../../../utils/leads/list'
import { withTags } from '../../../utils/tags/service'
import { ownCommercialScope } from '../../../utils/dashboard/commercial'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)

  // Un comercial vinculado a su ficha sólo ve SUS leads: el servidor fuerza su
  // comercial en el listado, el CSV, los contadores y el detalle del score,
  // pida lo que pida el navegador (el resto de la agencia ve todos).
  const ownCommercial = await ownCommercialScope(useDb(event), orgId, user)
  if (ownCommercial !== null) q.agentId = String(ownCommercial)

  // FASE 32 — «¿Por qué tiene este score?»: desglose vigente + historial de
  // un lead, como rama de lectura de este listado (entonces el margen de
  // claves de ruta era 0; ese límite ya no existe, ver P1-14 en
  // docs/production-hardening-audit.md). Acotado por organización como todo
  // lo demás aquí.
  if (q.scoreFor !== undefined) {
    const leadId = parseInt(String(q.scoreFor), 10)
    if (!leadId) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
    // Un comercial sólo ve el score de SUS leads (si no, 404 como uno inexistente).
    if (ownCommercial !== null) {
      const owner = await raw.prepare('SELECT agent_id AS agentId FROM leads WHERE id = ? AND organization_id = ?').bind(leadId, orgId).first<{ agentId: number | null }>()
      if (!owner || owner.agentId !== ownCommercial) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })
    }
    const detail = await getLeadScoreDetail(useDb(event), orgId, leadId)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })
    return detail
  }

  // El filtro, la paginación y la exportación viven en server/utils/leads/list.ts
  // (bloque N7b): la Tabla pagina con el total real, y el CSV recorre TODO el
  // resultado filtrado por lotes — antes, el listado y por tanto lo que se
  // podía exportar desde la pantalla se cortaban en 200 filas.
  const run = d1Runner(raw)

  if (String(q.format || '') === 'csv') {
    const csvRows = await exportLeadRows(run, orgId, q)
    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', 'attachment; filename="leads.csv"')
    return rowsToCsv(csvRows)
  }

  const { rows, total, page, perPage } = await listLeadsPage(run, orgId, q)

  // El Kanban agrupa por stage (FASE 13) — status se queda para la tabla y
  // para quien todavía filtre por él, pero ya no es la dimensión de posición.
  // Un comercial ve los contadores sólo de SUS leads (mismo `agent_id` forzado).
  const agentClause = ownCommercial !== null ? ' AND agent_id = ?' : ''
  const agentBind = ownCommercial !== null ? [ownCommercial] : []
  const byStage = (
    await raw
      .prepare(`SELECT stage, count(*) AS n FROM leads WHERE organization_id = ? AND deleted_at IS NULL AND status != ?${agentClause} GROUP BY stage`)
      .bind(orgId, 'lost', ...agentBind)
      .all<{ stage: string; n: number }>()
  ).results
  const counts: Record<string, number> = {}
  for (const r of byStage) counts[r.stage] = r.n
  counts.lost = (
    await raw.prepare(`SELECT count(*) AS n FROM leads WHERE organization_id = ? AND deleted_at IS NULL AND status = 'lost'${agentClause}`).bind(orgId, ...agentBind).first<{ n: number }>()
  )?.n || 0

  // Etiquetas de cada fila (FASE 0): se ven en la Tabla y en el Pipeline.
  return { rows: await withTags(useDb(event), orgId, 'lead', rows), counts, total, page, perPage }
})
