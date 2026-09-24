import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { dismissAlert } from '../../../../utils/leads/slaService'

/** Descarta una alerta. No se borra: queda marcada con quién y por qué. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ alertId: number; reason?: string }>(event)
  if (!Number.isInteger(body?.alertId)) throw createError({ statusCode: 422, statusMessage: 'Falta la alerta' })

  const alert = await dismissAlert(event, orgId, body.alertId, body.reason || null, user.id)
  if (!alert) throw createError({ statusCode: 404, statusMessage: 'Alerta no encontrada' })

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'lead_alert', resourceId: body.alertId, detail: body.reason || 'descartada' })
  return alert
})
