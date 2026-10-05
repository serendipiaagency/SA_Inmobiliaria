import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { listAppointments } from '../../../utils/appointments/query'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const positiveInt = (v: unknown) => {
  const n = parseInt(String(v ?? ''), 10)
  return n > 0 ? n : null
}

/**
 * Datos de Calendar (FASE 20): un rango de fechas de `visits`, con los
 * filtros del megaprompt — comercial (`agentId`), oficina como entidad
 * (`officeId`: la de la cita o, si no tiene, la de su comercial), tipo,
 * propiedad (`propertyId` + `propertyKind`), cliente (`contactId`: el
 * contacto de la cita o el de su lead; o `leadId`) y estado. `office` (texto
 * libre del comercial) se mantiene por compatibilidad.
 *
 * Calendar no es una segunda agenda — esto sólo lee `visits`, la misma
 * fuente de verdad que la Lista (server/utils/appointments/query.ts); lo que
 * cambia es la forma de la consulta (por rango, no las últimas 200).
 *
 * `status` filtra por `visits.status` (ciclo de vida real: scheduled |
 * completed | cancelled | no_show) — nunca por `confirmationStatus`, que es
 * un concepto distinto (confirmación del cliente).
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const q = getQuery(event)

  const from = String(q.from || '')
  const to = String(q.to || '')
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw createError({ statusCode: 422, statusMessage: 'from/to deben ser YYYY-MM-DD' })

  const rows = await listAppointments(useDb(event), orgId, {
    from,
    to,
    agentId: positiveInt(q.agentId),
    officeId: positiveInt(q.officeId),
    office: q.office ? String(q.office) : null,
    type: q.type ? String(q.type) : null,
    status: q.status ? String(q.status) : null,
    propertyId: positiveInt(q.propertyId),
    propertyKind: q.propertyKind ? String(q.propertyKind) : null,
    contactId: positiveInt(q.contactId),
    leadId: positiveInt(q.leadId),
    order: 'asc',
    limit: 1000,
  })
  return { rows }
})
