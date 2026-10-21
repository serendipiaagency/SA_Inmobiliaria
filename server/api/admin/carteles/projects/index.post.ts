import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { createPosterProject } from '../../../../utils/posters/service'

/** POST /api/admin/carteles/projects — crea una pieza a partir de una plantilla y una propiedad. */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const body = (await readBody<Record<string, unknown>>(event)) || {}
  const project = await createPosterProject(useDb(event), orgId, body, user.id)
  await logAdminAction(event, { user, orgId, action: 'create', resource: 'poster-projects', resourceId: project.id })
  return project
})
