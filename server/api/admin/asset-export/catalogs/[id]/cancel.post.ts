import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, now } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'

/** Stops the client polling loop and marks remaining pending items as cancelled — the catalog is never assembled once cancelled. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const catalogId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(catalogId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const catalog = (await db.select().from(schema.assetExportCatalogs).where(eq(schema.assetExportCatalogs.id, catalogId)).limit(1))[0]
  if (!catalog || catalog.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Catalog not found' })

  const nowTs = now()
  await db.update(schema.assetExportCatalogItems).set({ status: 'cancelled', completedAt: nowTs }).where(and(eq(schema.assetExportCatalogItems.catalogId, catalogId), eq(schema.assetExportCatalogItems.status, 'pending')))
  await db.update(schema.assetExportCatalogs).set({ status: 'cancelled', completedAt: nowTs }).where(eq(schema.assetExportCatalogs.id, catalogId))

  await logAdminAction(event, { user, orgId, action: 'pause', resource: 'asset-export-catalog', resourceId: catalogId })
  return { ok: true }
})
