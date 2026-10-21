import { requireOrgScope } from '../../../../../utils/auth'
import { logAdminAction } from '../../../../../utils/audit'
import { renderPosterProject } from '../../../../../utils/posters/render'

/**
 * POST /api/admin/carteles/projects/:id/render — renderiza la pieza a PDF y la
 * guarda en R2; devuelve el enlace de descarga. Nunca marca «completado» sin
 * que los bytes lleguen a R2 (ver server/utils/posters/render.ts).
 */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(projectId) || projectId <= 0) throw createError({ statusCode: 422, statusMessage: 'Cartel no válido' })
  const result = await renderPosterProject(event, { orgId, userId: user.id, projectId })
  await logAdminAction(event, { user, orgId, action: 'run', resource: 'poster-renders', resourceId: result.id, detail: 'pdf' })
  return result
})
