import { useDb, cfEnv } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { getRequestId } from '../../../../utils/requestId'
import { updateAppointment, type UpdateAppointmentInput } from '../../../../utils/appointments/update'

/**
 * Confirm/cancel/mark-completed/mark-no-show, reschedule, and/or reassign to
 * a different agent — all with a real double-booking check. La lógica vive
 * en `server/utils/appointments/update.ts` (FASE 31), compartida con las
 * Domain Tools; esta ruta sólo autoriza, delega y deja la auditoría.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const visitId = Number(getRouterParam(event, 'id'))
  const body = (await readBody<UpdateAppointmentInput>(event)) || {}
  await updateAppointment(useDb(event), orgId, visitId, body, {
    userId: user.id,
    env: cfEnv(event),
    requestId: getRequestId(event),
    publicOrigin: getRequestURL(event).origin,
  })
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'visit', resourceId: visitId })
  return { ok: true }
})
