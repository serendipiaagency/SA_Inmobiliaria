import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { updatePosterProject } from '../../../../utils/posters/service'

/** PATCH /api/admin/carteles/projects/:id — guarda cambios de una pieza (nombre, estructura, estado). */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Cartel no válido' })
  const body = (await readBody<Record<string, unknown>>(event)) || {}
  const project = await updatePosterProject(useDb(event), orgId, id, body)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'poster-projects', resourceId: id })
  return project
})
