import { desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'
import { catalogPropertyKind } from '../../../utils/assetExport/catalogKind'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const rows = await db.select().from(schema.assetExportCatalogs).where(eq(schema.assetExportCatalogs.organizationId, orgId)).orderBy(desc(schema.assetExportCatalogs.createdAt)).limit(50)
  // Obra nueva o 2ª mano (FASE 28), para que la lista lo diga.
  return rows.map((c) => ({ ...c, propertyKind: catalogPropertyKind(c) }))
})
