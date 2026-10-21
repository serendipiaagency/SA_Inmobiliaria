import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { updatePosterTemplate } from '../../../../utils/posters/service'

/** PATCH /api/admin/carteles/templates/:id — guarda cambios de una plantilla propia. */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Plantilla no válida' })
  const body = (await readBody<Record<string, unknown>>(event)) || {}
  const template = await updatePosterTemplate(useDb(event), orgId, id, body)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'poster-templates', resourceId: id })
  return template
})
