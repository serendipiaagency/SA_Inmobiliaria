import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const catalog = (await db.select().from(schema.assetExportCatalogs).where(eq(schema.assetExportCatalogs.id, id)).limit(1))[0]
  if (!catalog || catalog.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Catalog not found' })

  const items = await db
    .select({
      id: schema.assetExportCatalogItems.id,
      position: schema.assetExportCatalogItems.position,
      assetId: schema.assetExportCatalogItems.assetId,
      assetName: schema.developerProperties.name,
      status: schema.assetExportCatalogItems.status,
      pageCount: schema.assetExportCatalogItems.pageCount,
      errorMessage: schema.assetExportCatalogItems.errorMessage,
    })
    .from(schema.assetExportCatalogItems)
    .leftJoin(schema.developerProperties, eq(schema.developerProperties.id, schema.assetExportCatalogItems.assetId))
    .where(eq(schema.assetExportCatalogItems.catalogId, id))
    .orderBy(schema.assetExportCatalogItems.position)
    .limit(200)

  return { ...catalog, items }
})
