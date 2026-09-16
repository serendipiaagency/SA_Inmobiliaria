import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { listPageVersions, requireValidPageKey, VERSION_HISTORY_LIMIT } from '../../../../utils/sitePages'

/**
 * The published history of a page. Read-only: nothing here changes what the
 * public site serves — that's restore.post.ts, and then only the draft.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const pageKey = requireValidPageKey(getRouterParam(event, 'pageKey'))
  const db = useDb(event)

  const versions = await listPageVersions(db, orgId, pageKey)
  return { pageKey, versions, limit: VERSION_HISTORY_LIMIT }
})
