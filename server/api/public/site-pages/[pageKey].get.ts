import { useDb, resolvePublicOrgId } from '../../../utils/db'
import { getPublishedPage, requireValidPageKey } from '../../../utils/sitePages'

/**
 * The only read path the public site uses for page layout — always the
 * published document, resolved for the visiting tenant exactly like every
 * other /api/public/* route. A page with no publish yet (a brand-new org)
 * returns an empty block list; the page component renders nothing rather
 * than guessing at a default layout.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const pageKey = requireValidPageKey(getRouterParam(event, 'pageKey'))

  return getPublishedPage(db, orgId, pageKey)
})
