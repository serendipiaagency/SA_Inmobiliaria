import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/** Reads this org's AI-time auto-apply rule, seeding the default row (off, 60% confidence, 5 samples) on first read. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)

  const rows = await db.select().from(schema.publicationAiTimeRules).where(eq(schema.publicationAiTimeRules.organizationId, orgId)).limit(1)
  if (rows[0]) return { data: rows[0] }

  const nowTs = now()
  const inserted = await db
    .insert(schema.publicationAiTimeRules)
    .values({ organizationId: orgId, autoApply: 0, minConfidence: 0.6, minSampleSize: 5, createdAt: nowTs, updatedAt: nowTs })
    .returning()
  return { data: inserted[0] }
})
