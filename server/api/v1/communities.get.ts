import { desc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { requireApiKey } from '../../utils/apiAuth'
import { rateLimit } from '../../utils/rateLimit'

/**
 * GET /api/v1/communities — documented since before this existed (same gap
 * as /leads and /agents, found while auditing /admin/api's endpoint list).
 * Requires an API key with the "read" scope.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'read')
  await rateLimit(event, 'public-api', { limit: 120, windowSeconds: 60 })

  const db = useDb(event)
  const rows = await db
    .select()
    .from(schema.communities)
    .where(eq(schema.communities.organizationId, orgId))
    .orderBy(desc(schema.communities.id))
    .limit(200)

  return { data: rows }
})
