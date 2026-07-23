import { desc, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const rows = await db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.organizationId, resolvePublicOrgId(event)))
    .orderBy(desc(schema.locations.id))
  return { rows }
})
