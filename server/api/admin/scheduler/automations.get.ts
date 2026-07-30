import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const rows = await db.select().from(schema.publicationAutomationRules).where(eq(schema.publicationAutomationRules.organizationId, orgId))
  return { rows }
})
