import { desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)

  const kit = (await db.select({ id: schema.brandKits.id }).from(schema.brandKits).where(eq(schema.brandKits.organizationId, orgId)).limit(1))[0]
  if (!kit) return []

  return db
    .select({ id: schema.brandKitVersions.id, editedBy: schema.brandKitVersions.editedBy, createdAt: schema.brandKitVersions.createdAt })
    .from(schema.brandKitVersions)
    .where(eq(schema.brandKitVersions.brandKitId, kit.id))
    .orderBy(desc(schema.brandKitVersions.createdAt))
    .limit(50)
})
