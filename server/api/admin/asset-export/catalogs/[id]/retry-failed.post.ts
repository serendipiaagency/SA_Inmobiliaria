import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, now } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'

/**
 * Resets failed items back to pending so the next process-next call retries
 * them, then clears the stale final PDF (it's missing the retried section)
 * so the client's polling loop naturally re-triggers reassembly once every
 * item succeeds. Mirrors batches/retry-failed.post.ts.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const catalogId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(catalogId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const catalog = (await db.select().from(schema.assetExportCatalogs).where(eq(schema.assetExportCatalogs.id, catalogId)).limit(1))[0]
  if (!catalog || catalog.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Catalog not found' })
  if (catalog.failedCount === 0) throw createError({ statusCode: 422, statusMessage: 'Este catálogo no tiene items fallidos que reintentar' })

  await db
    .update(schema.assetExportCatalogItems)
    .set({ status: 'pending', errorMessage: null, completedAt: null })
    .where(and(eq(schema.assetExportCatalogItems.catalogId, catalogId), eq(schema.assetExportCatalogItems.status, 'failed')))

  await db
    .update(schema.assetExportCatalogs)
    .set({ status: 'running', failedCount: 0, r2Key: null, fileSizeBytes: null, errorMessage: null, completedAt: null })
    .where(eq(schema.assetExportCatalogs.id, catalogId))

  await logAdminAction(event, { user, orgId, action: 'retry', resource: 'asset-export-catalog', resourceId: catalogId })
  return { ok: true }
})
