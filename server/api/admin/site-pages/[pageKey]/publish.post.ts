import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { publishPage, requireValidPageKey } from '../../../../utils/sitePages'

export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event)
  const pageKey = requireValidPageKey(getRouterParam(event, 'pageKey'))
  const db = useDb(event)

  const version = await publishPage(db, orgId, pageKey, user.id)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'site-pages', resourceId: pageKey, detail: `publish v${version}` })

  return { ok: true, version }
})
