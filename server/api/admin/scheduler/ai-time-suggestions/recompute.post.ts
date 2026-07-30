import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { computeAiTimeSuggestions } from '../../../../utils/publication/aiTime'

/** POST /api/admin/scheduler/ai-time-suggestions/recompute — recomputes from this org's real execution history. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const written = await computeAiTimeSuggestions(db, orgId)
  return { ok: true, written }
})
