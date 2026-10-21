import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { getPosterProject } from '../../../../utils/posters/service'

/** GET /api/admin/carteles/projects/:id — una pieza con su estructura. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Cartel no válido' })
  return await getPosterProject(useDb(event), orgId, id)
})
