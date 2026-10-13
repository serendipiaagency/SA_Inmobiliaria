import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { logAdminAction } from '../../../utils/audit'
import { publishConsent } from '../../../utils/siteConsent'

/** POST /api/admin/site-consent/publish — el borrador de los avisos pasa a la web (y al historial). */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const version = await publishConsent(useDb(event), orgId, user.id)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'site-pages', resourceId: 'consent', detail: `publish v${version}` })
  return { ok: true, version }
})
