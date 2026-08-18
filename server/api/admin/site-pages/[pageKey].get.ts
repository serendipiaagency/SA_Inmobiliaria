import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { getOrCreateSitePage, parsePageJson, requireValidPageKey } from '../../../utils/sitePages'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const pageKey = requireValidPageKey(getRouterParam(event, 'pageKey'))
  const db = useDb(event)

  const page = await getOrCreateSitePage(db, orgId, pageKey)
  const draft = parsePageJson(page.draftJson)
  const published = page.publishedJson ? parsePageJson(page.publishedJson) : null

  return {
    pageKey,
    blocks: draft.blocks,
    seo: draft.seo,
    version: page.version,
    publishedAt: page.publishedAt,
    // The builder shows a "cambios sin publicar" indicator from this, never
    // by diffing on the client — draft and published are compared here,
    // once, from the same read.
    hasUnpublishedChanges: JSON.stringify(draft) !== JSON.stringify(published),
  }
})
