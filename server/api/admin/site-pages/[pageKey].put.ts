import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { saveDraft, validatePageDocument, requireValidPageKey } from '../../../utils/sitePages'

/**
 * Autosave. Only ever writes draftJson — the published site is untouched
 * until an explicit Publish call. Called often (debounced client-side), so
 * it does not write an audit-log row per save; Publish does.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const pageKey = requireValidPageKey(getRouterParam(event, 'pageKey'))
  const db = useDb(event)

  const body = await readBody(event)
  const doc = validatePageDocument(body)
  await saveDraft(db, orgId, pageKey, doc)

  return { ok: true }
})
