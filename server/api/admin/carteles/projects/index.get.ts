import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { listPosterProjects } from '../../../../utils/posters/service'

/** GET /api/admin/carteles/projects — las piezas (carteles) de la empresa. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  return { items: await listPosterProjects(useDb(event), orgId) }
})
