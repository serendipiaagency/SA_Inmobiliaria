import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

/**
 * Returns the active org's Brand Kit, or null if none has been created yet —
 * the editor shows a real "Sin Brand Kit" empty state for that case (section
 * 27 of the spec) instead of fabricating default colors/fonts as if a real
 * kit existed.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const rows = await db.select().from(schema.brandKits).where(eq(schema.brandKits.organizationId, orgId)).limit(1)
  return rows[0] || null
})
