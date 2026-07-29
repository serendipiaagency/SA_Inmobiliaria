import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/** GET /api/admin/scheduler/ai-time-suggestions — Fase 12 ("hora recomendada por IA"). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const rows = await db.select().from(schema.publicationAiTimeSuggestions).where(eq(schema.publicationAiTimeSuggestions.organizationId, orgId))
  return { rows }
})
