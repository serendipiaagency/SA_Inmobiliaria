import { useDb } from '../../../../../utils/db'
import { requireOrgScope } from '../../../../../utils/auth'
import { logAdminAction } from '../../../../../utils/audit'
import { duplicatePosterTemplate } from '../../../../../utils/posters/service'

/** POST /api/admin/carteles/templates/:id/duplicate — copia una plantilla (de sistema o propia) a una propia editable. */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Plantilla no válida' })
  const template = await duplicatePosterTemplate(useDb(event), orgId, id, user.id)
  await logAdminAction(event, { user, orgId, action: 'duplicate', resource: 'poster-templates', resourceId: template.id })
  return template
})
