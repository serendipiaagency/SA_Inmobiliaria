import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/** Agent directory for the admin panel — team_members has no admin CRUD yet, this is a read-only list for the availability editor. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const rows = await db
    .select({
      id: schema.teamMembers.id,
      name: schema.teamMembers.name,
      slug: schema.teamMembers.slug,
      position: schema.teamMembers.position,
      image: schema.teamMembers.image,
      slotDurationMinutes: schema.teamMembers.slotDurationMinutes,
    })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.organizationId, orgId))
    .orderBy(schema.teamMembers.name)
  return { rows }
})
