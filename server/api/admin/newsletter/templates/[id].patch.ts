import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { updateTemplate } from '../../../../utils/newsletter/campaigns'

/** PATCH /api/admin/newsletter/templates/:id — guarda cambios de una plantilla. */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Plantilla no válida' })
  const body = (await readBody<{ name?: unknown; subject?: unknown; blocks?: unknown }>(event)) || {}
  const template = await updateTemplate(useDb(event), orgId, id, body)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'newsletter-templates', resourceId: id })
  return template
})
