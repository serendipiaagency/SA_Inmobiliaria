import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { appointmentStatusCounts, getAppointment, listAppointments, trashedAppointmentCount } from '../../../utils/appointments/query'

const positiveInt = (v: unknown) => {
  const n = parseInt(String(v ?? ''), 10)
  return n > 0 ? n : null
}

/**
 * GET /api/admin/saas/visits — la Lista de /admin/visitas: las últimas 200
 * citas (filtrables por estado, cliente/contacto, lead, comercial, oficina y
 * tipo) con todos sus campos, el resultado estructurado y las ofertas
 * relacionadas, más los contadores por estado.
 *
 * `?id=<cita>` devuelve la ficha de UNA cita (`{ row }`) — mismo endpoint,
 * modo lectura (entonces el margen de rutas de Nitro era 0; ese límite ya no
 * existe, ver P1-14 en docs/production-hardening-audit.md). 404 si no es de esta agencia
 * o si está en la papelera.
 *
 * Cierre D3a: `?trashed=1` lista SÓLO la papelera (lo último eliminado
 * primero, con quién creó cada cita y el estado que tenía), combinable con
 * comercial, oficina, contacto, lead y tipo. `trashedCount` es el contador
 * del botón «Papelera».
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const q = getQuery(event)

  if (q.id !== undefined) {
    const id = positiveInt(q.id)
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
    const row = await getAppointment(db, orgId, id)
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Visita no encontrada' })
    return { row }
  }

  const rows = await listAppointments(db, orgId, {
    status: q.status ? String(q.status) : null,
    type: q.type ? String(q.type) : null,
    agentId: positiveInt(q.agentId),
    officeId: positiveInt(q.officeId),
    contactId: positiveInt(q.contactId),
    leadId: positiveInt(q.leadId),
    trashed: q.trashed === '1' || q.trashed === 'true',
    order: 'desc',
    limit: 200,
  })
  const counts = await appointmentStatusCounts(db, orgId)
  const trashedCount = await trashedAppointmentCount(db, orgId)
  return { rows, counts, trashedCount }
})
