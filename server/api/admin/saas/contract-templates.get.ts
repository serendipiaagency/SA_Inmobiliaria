import { desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  return db.select().from(schema.contractTemplates).where(eq(schema.contractTemplates.organizationId, orgId)).orderBy(desc(schema.contractTemplates.id))
})
