import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { listActivity, type ListActivityFilter } from '../../../utils/activity/service'
import { PROPERTY_KINDS, type PropertyKind } from '../../../utils/matching/service'

/**
 * Actividad de una entidad concreta (FASE 21) — Contact, Lead, Property o
 * Appointment. Exige exactamente un filtro de entidad: sin eso se estaría
 * pidiendo toda la actividad de la organización de golpe.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const q = getQuery(event)

  const filter: ListActivityFilter = {}
  if (q.contactId) filter.contactId = Number(q.contactId)
  if (q.leadId) filter.leadId = Number(q.leadId)
  if (q.appointmentId) filter.appointmentId = Number(q.appointmentId)
  if (q.propertyId) {
    filter.propertyId = Number(q.propertyId)
    filter.propertyKind = (PROPERTY_KINDS as string[]).includes(String(q.propertyKind)) ? (q.propertyKind as PropertyKind) : 'developer'
  }
  if (!Object.keys(filter).length) throw createError({ statusCode: 422, statusMessage: 'Falta un filtro (contactId, leadId, propertyId o appointmentId)' })

  const before = q.before ? Number(q.before) : undefined
  const limit = q.limit ? Number(q.limit) : undefined
  return listActivity(db, orgId, filter, { before, limit })
})
