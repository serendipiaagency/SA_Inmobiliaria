import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { saveSlaConfig } from '../../../../utils/leads/slaService'

/** Guarda los plazos de atención de la organización. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ enabled?: boolean; firstResponseMinutes?: number; staleDays?: number; businessHoursOnly?: boolean }>(event)

  const config = await saveSlaConfig(event, orgId, {
    enabled: body?.enabled ? 1 : 0,
    firstResponseMinutes: body?.firstResponseMinutes,
    staleDays: body?.staleDays,
    businessHoursOnly: body?.businessHoursOnly ? 1 : 0,
  })

  await logAdminAction(event, {
    user,
    orgId,
    action: 'update',
    resource: 'sla_settings',
    detail: config.enabled ? `activo, ${config.firstResponseMinutes} min` : 'desactivado',
  })
  return config
})
