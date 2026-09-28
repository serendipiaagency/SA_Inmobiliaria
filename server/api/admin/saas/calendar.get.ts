import { requireOrgScope } from '../../../utils/auth'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Datos de Calendar (FASE 20): un rango de fechas de `visits`, con los
 * filtros del megaprompt (Comercial/Office/Tipo/Propiedad/Contacto/Estado).
 * Calendar no es una segunda agenda — esto sólo lee `visits`, la misma
 * fuente de verdad que /admin/visitas usa en su pestaña Lista; lo que cambia
 * es la forma de la consulta (por rango, no los últimos 200) y los filtros
 * disponibles.
 *
 * `status` filtra por `visits.status` (ciclo de vida real: scheduled |
 * completed | cancelled | no_show) — nunca por `confirmationStatus`, que es
 * un concepto distinto (confirmación del cliente).
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)

  const from = String(q.from || '')
  const to = String(q.to || '')
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw createError({ statusCode: 422, statusMessage: 'from/to deben ser YYYY-MM-DD' })

  const where: string[] = ['v.organization_id = ?', 'v.scheduled_at >= ?', 'v.scheduled_at < ?']
  const binds: any[] = [orgId, `${from} 00:00:00`, `${to} 23:59:59`]

  if (q.agentId) {
    where.push('v.agent_id = ?')
    binds.push(Number(q.agentId))
  }
  if (q.office) {
    where.push('a.office_name = ?')
    binds.push(String(q.office))
  }
  if (q.type && q.type !== 'all') {
    where.push('v.type = ?')
    binds.push(String(q.type))
  }
  if (q.status && q.status !== 'all') {
    where.push('v.status = ?')
    binds.push(String(q.status))
  }
  if (q.propertyId) {
    where.push('v.property_id = ?')
    binds.push(Number(q.propertyId))
    if (q.propertyKind) {
      where.push('v.property_kind = ?')
      binds.push(String(q.propertyKind))
    }
  }
  if (q.contactId) {
    where.push('l.contact_id = ?')
    binds.push(Number(q.contactId))
  }

  const rows = (
    await raw
      .prepare(
        `SELECT v.id, v.client_name AS clientName, v.property_id AS propertyId, v.property_kind AS propertyKind, v.property_name AS propertyName,
                v.agent_id AS agentId, v.agent_name AS agentName, a.office_name AS office,
                v.scheduled_at AS scheduledAt, v.ends_at AS endsAt, v.status, v.channel, v.type,
                v.confirmation_status AS confirmationStatus, v.lead_id AS leadId, l.contact_id AS contactId,
                v.tour_id AS tourId, v.tour_stop_order AS tourStopOrder, v.outcome
         FROM visits v
         LEFT JOIN team_members a ON a.id = v.agent_id AND a.organization_id = v.organization_id
         LEFT JOIN leads l ON l.id = v.lead_id AND l.organization_id = v.organization_id
         WHERE ${where.join(' AND ')}
         ORDER BY v.scheduled_at ASC LIMIT 1000`,
      )
      .bind(...binds)
      .all<any>()
  ).results

  return { rows }
})
