import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { createTemplate } from '../../../../utils/newsletter/campaigns'

/** POST /api/admin/newsletter/templates — crea una plantilla reutilizable. */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const body = (await readBody<{ name?: unknown; subject?: unknown; blocks?: unknown }>(event)) || {}
  const template = await createTemplate(useDb(event), orgId, body, user.id)
  await logAdminAction(event, { user, orgId, action: 'create', resource: 'newsletter-templates', resourceId: template.id })
  return template
})
