import { desc, eq, isNull, or } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

/** System templates (organizationId IS NULL) + the org's own templates. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  return db
    .select()
    .from(schema.assetExportTemplates)
    .where(or(isNull(schema.assetExportTemplates.organizationId), eq(schema.assetExportTemplates.organizationId, orgId)))
    .orderBy(desc(schema.assetExportTemplates.isSystem), desc(schema.assetExportTemplates.updatedAt))
})
