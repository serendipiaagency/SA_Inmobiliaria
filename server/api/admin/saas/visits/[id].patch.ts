import { useDb, cfEnv } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { getRequestId } from '../../../../utils/requestId'
import { updateAppointment, type UpdateAppointmentInput } from '../../../../utils/appointments/update'
import { restoreAppointment, trashAppointment } from '../../../../utils/appointments/trash'

/**
 * Editar una cita: confirmar (confirmación interna), cancelar (con motivo
 * obligatorio), marcar realizada o no presentada, reprogramar con inicio y
 * fin libres, reasignar y editar todos sus campos (tipo, canal, inmueble de
 * los dos catálogos, lead, contacto, oficina, zona horaria, punto de
 * encuentro, notas, notas internas y datos del cliente) — con la
 * comprobación real de solapes. La lógica vive en
 * `server/utils/appointments/update.ts` (FASE 31), compartida con las
 * Domain Tools; esta ruta sólo autoriza, delega y deja la auditoría.
 *
 * Cierre D3a: `{ deleted: true }` manda una cita creada por error a la
 * papelera (409 con el motivo si no se puede: parada de tour, ya realizada,
 * con resultado, que el cliente ya conoce o con ofertas) y
 * `{ deleted: false }` la restaura — `server/utils/appointments/trash.ts`.
 * No hay ruta DELETE ni /restore propias: el presupuesto de rutas de Nitro
 * está agotado.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const visitId = Number(getRouterParam(event, 'id'))
  const body = (await readBody<UpdateAppointmentInput & { deleted?: boolean }>(event)) || {}

  if (body.deleted === true) {
    const visit = await trashAppointment(useDb(event), orgId, visitId, { actorId: user.id })
    await logAdminAction(event, { user, orgId, action: 'delete', resource: 'visit', resourceId: visitId, detail: 'papelera' })
    return { ok: true, id: visit.id, deletedAt: visit.deletedAt }
  }
  if (body.deleted === false) {
    const visit = await restoreAppointment(useDb(event), orgId, visitId, { actorId: user.id })
    await logAdminAction(event, { user, orgId, action: 'restore', resource: 'visit', resourceId: visitId })
    return { ok: true, id: visit.id, status: visit.status }
  }

  const { patch } = await updateAppointment(useDb(event), orgId, visitId, body, {
    userId: user.id,
    env: cfEnv(event),
    requestId: getRequestId(event),
    publicOrigin: getRequestURL(event).origin,
  })
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'visit', resourceId: visitId, detail: Object.keys(patch).filter((k) => k !== 'updatedAt').join(', ') })
  return { ok: true }
})
