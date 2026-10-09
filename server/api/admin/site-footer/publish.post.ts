import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { logAdminAction } from '../../../utils/audit'
import { publishFooter } from '../../../utils/siteFooter'

/** POST /api/admin/site-footer/publish — el borrador del pie pasa a la web (y al historial). */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const version = await publishFooter(useDb(event), orgId, user.id)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'site-pages', resourceId: 'footer', detail: `publish v${version}` })
  return { ok: true, version }
})
