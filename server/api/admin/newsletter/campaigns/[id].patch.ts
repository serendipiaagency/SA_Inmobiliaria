import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { updateCampaign } from '../../../../utils/newsletter/campaigns'

/** PATCH /api/admin/newsletter/campaigns/:id — guarda cambios (nombre, asunto, bloques, estado draft/ready). */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Campaña no válida' })
  const body = (await readBody<{ name?: unknown; subject?: unknown; blocks?: unknown; status?: unknown }>(event)) || {}
  const campaign = await updateCampaign(useDb(event), orgId, id, body)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'newsletter-campaigns', resourceId: id })
  return campaign
})
