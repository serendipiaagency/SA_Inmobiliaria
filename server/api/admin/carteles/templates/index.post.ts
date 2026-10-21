import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { createPosterTemplate } from '../../../../utils/posters/service'

/** POST /api/admin/carteles/templates — crea una plantilla de cartel propia. */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const body = (await readBody<Record<string, unknown>>(event)) || {}
  const template = await createPosterTemplate(useDb(event), orgId, body, user.id)
  await logAdminAction(event, { user, orgId, action: 'create', resource: 'poster-templates', resourceId: template.id })
  return template
})
