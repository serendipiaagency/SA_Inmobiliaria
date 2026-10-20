import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { deleteCampaign } from '../../../../utils/newsletter/campaigns'

/** DELETE /api/admin/newsletter/campaigns/:id — borra una campaña (borrador). */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Campaña no válida' })
  await deleteCampaign(useDb(event), orgId, id)
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'newsletter-campaigns', resourceId: id })
  return { ok: true }
})
