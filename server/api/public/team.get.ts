import { desc, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const rows = await db
    .select()
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.organizationId, resolvePublicOrgId(event)))
    .orderBy(desc(schema.teamMembers.id))
  return { rows }
})
