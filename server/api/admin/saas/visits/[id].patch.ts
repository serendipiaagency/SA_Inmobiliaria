import { useDb, cfEnv } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { getRequestId } from '../../../../utils/requestId'
import { updateAppointment, type UpdateAppointmentInput } from '../../../../utils/appointments/update'

/**
 * Editar una cita: confirmar (confirmación interna), cancelar (con motivo
 * obligatorio), marcar realizada o no presentada, reprogramar con inicio y
 * fin libres, reasignar y editar todos sus campos (tipo, canal, inmueble de
 * los dos catálogos, lead, contacto, oficina, zona horaria, punto de
 * encuentro, notas, notas internas y datos del cliente) — con la
 * comprobación real de solapes. La lógica vive en
 * `server/utils/appointments/update.ts` (FASE 31), compartida con las
 * Domain Tools; esta ruta sólo autoriza, delega y deja la auditoría.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const visitId = Number(getRouterParam(event, 'id'))
  const body = (await readBody<UpdateAppointmentInput>(event)) || {}
  const { patch } = await updateAppointment(useDb(event), orgId, visitId, body, {
    userId: user.id,
    env: cfEnv(event),
    requestId: getRequestId(event),
    publicOrigin: getRequestURL(event).origin,
  })
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'visit', resourceId: visitId, detail: Object.keys(patch).filter((k) => k !== 'updatedAt').join(', ') })
  return { ok: true }
})
