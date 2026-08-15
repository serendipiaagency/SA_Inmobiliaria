import { and, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)
  // Confined to the tenant that owns this hostname — the row carries an
  // agent's direct contact details, and the sibling availability endpoint
  // already scoped its own lookup the same way.
  const rows = await db
    .select()
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.slug, slug), eq(schema.teamMembers.organizationId, resolvePublicOrgId(event))))
    .limit(1)
  const member = rows[0]
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Team member not found' })
  return { member }
})
