import { desc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { requireApiKey } from '../../utils/apiAuth'
import { rateLimit } from '../../utils/rateLimit'

/**
 * GET /api/v1/agents — documented since before this existed (same gap as
 * /communities and /leads). Requires an API key with the "read" scope.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'read')
  await rateLimit(event, 'public-api', { limit: 120, windowSeconds: 60 })

  const db = useDb(event)
  const rows = await db
    .select({
      id: schema.teamMembers.id,
      name: schema.teamMembers.name,
      slug: schema.teamMembers.slug,
      position: schema.teamMembers.position,
      email: schema.teamMembers.email,
      phone: schema.teamMembers.phone,
      description: schema.teamMembers.description,
      image: schema.teamMembers.image,
    })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.organizationId, orgId))
    .orderBy(desc(schema.teamMembers.id))
    .limit(200)

  return { data: rows }
})
