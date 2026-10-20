import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { deleteTemplate } from '../../../../utils/newsletter/campaigns'

/** DELETE /api/admin/newsletter/templates/:id — borra una plantilla. */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Plantilla no válida' })
  await deleteTemplate(useDb(event), orgId, id)
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'newsletter-templates', resourceId: id })
  return { ok: true }
})
