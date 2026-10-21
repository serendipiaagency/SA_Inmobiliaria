import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { getPosterTemplate } from '../../../../utils/posters/service'

/** GET /api/admin/carteles/templates/:id — una plantilla con su estructura. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Plantilla no válida' })
  return await getPosterTemplate(useDb(event), orgId, id)
})
