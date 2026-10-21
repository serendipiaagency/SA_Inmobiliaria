import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { deletePosterTemplate } from '../../../../utils/posters/service'

/** DELETE /api/admin/carteles/templates/:id — borra una plantilla propia. */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Plantilla no válida' })
  await deletePosterTemplate(useDb(event), orgId, id)
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'poster-templates', resourceId: id })
  return { ok: true }
})
