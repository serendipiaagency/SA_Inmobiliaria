import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { deletePosterProject } from '../../../../utils/posters/service'

/** DELETE /api/admin/carteles/projects/:id — borra una pieza. */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Cartel no válido' })
  await deletePosterProject(useDb(event), orgId, id)
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'poster-projects', resourceId: id })
  return { ok: true }
})
