import { desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  return await db.select().from(schema.gdprRequests).where(eq(schema.gdprRequests.organizationId, orgId)).orderBy(desc(schema.gdprRequests.createdAt)).limit(100)
})
