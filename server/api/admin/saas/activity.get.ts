import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { ACTIVITY_EVENT_TYPES, listActivity, type ListActivityFilter } from '../../../utils/activity/service'
import { userNames } from '../../../utils/crm/labels'
import { PROPERTY_KINDS, type PropertyKind } from '../../../utils/matching/service'

/**
 * Actividad de una entidad concreta (FASE 21) — Contact, Lead, Property,
 * Appointment o (bloque N6) operación (`dealId`). Exige un filtro de
 * entidad: sin eso se estaría pidiendo toda la actividad de la organización
 * de golpe. `eventTypes` (lista separada por comas) acota a esos tipos; uno
 * que no exista es 422. Cada fila trae `actorName` cuando la hizo un usuario
 * del panel de esta organización.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const q = getQuery(event)

  const filter: ListActivityFilter = {}
  if (q.contactId) filter.contactId = Number(q.contactId)
  if (q.leadId) filter.leadId = Number(q.leadId)
  if (q.appointmentId) filter.appointmentId = Number(q.appointmentId)
  if (q.dealId) filter.dealId = Number(q.dealId)
  if (q.propertyId) {
    filter.propertyId = Number(q.propertyId)
    filter.propertyKind = (PROPERTY_KINDS as string[]).includes(String(q.propertyKind)) ? (q.propertyKind as PropertyKind) : 'developer'
  }
  if (!Object.keys(filter).length) throw createError({ statusCode: 422, statusMessage: 'Falta un filtro (contactId, leadId, propertyId, appointmentId o dealId)' })
  for (const [k, v] of Object.entries(filter)) {
    if (typeof v === 'number' && !(Number.isInteger(v) && v > 0)) throw createError({ statusCode: 422, statusMessage: `Filtro ${k} no válido` })
  }
  if (q.eventTypes) {
    const types = String(q.eventTypes)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const unknown = types.filter((t) => !(ACTIVITY_EVENT_TYPES as readonly string[]).includes(t))
    if (unknown.length) throw createError({ statusCode: 422, statusMessage: `Tipo de evento desconocido: ${unknown.join(', ')}` })
    if (types.length) filter.eventTypes = types
  }

  const before = q.before ? Number(q.before) : undefined
  const limit = q.limit ? Number(q.limit) : undefined
  const page = await listActivity(db, orgId, filter, { before, limit })
  const users = await userNames(
    db,
    orgId,
    page.rows.filter((r) => r.actorType === 'user').map((r) => r.actorId),
  )
  return { rows: page.rows.map((r) => ({ ...r, actorName: r.actorType === 'user' && r.actorId ? (users.get(r.actorId) ?? null) : null })), nextBefore: page.nextBefore }
})
