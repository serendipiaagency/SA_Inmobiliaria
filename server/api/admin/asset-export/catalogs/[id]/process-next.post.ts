import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, now, cfEnv } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'
import { resolveAssetBindings, resolveTenantBindings } from '../../../../../utils/assetExport/bindings'
import { renderPdf } from '../../../../../utils/assetExport/pdfRenderer'
import { assembleCatalogPdf } from '../../../../../utils/assetExport/catalogRenderer'
import { PDFDocument } from 'pdf-lib'
import type { TemplateStructure } from '../../../../../utils/assetExport/types'

/**
 * Renders exactly one pending fragment per call (same one-item-per-request
 * pattern as batches/process-next.ts — no Queues/Durable Objects binding to
 * fan this out for real). Once every item has been attempted, this same
 * endpoint assembles the final combined PDF from the completed fragments and
 * marks the catalog done, so the client's polling loop only has to call one
 * endpoint until { done: true }.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const catalogId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(catalogId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const catalog = (await db.select().from(schema.assetExportCatalogs).where(eq(schema.assetExportCatalogs.id, catalogId)).limit(1))[0]
  if (!catalog || catalog.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Catalog not found' })

  if (['cancelled', 'completed', 'completed_with_errors', 'failed'].includes(catalog.status)) return { done: true, catalog }

  const item = (
    await db
      .select()
      .from(schema.assetExportCatalogItems)
      .where(and(eq(schema.assetExportCatalogItems.catalogId, catalogId), eq(schema.assetExportCatalogItems.status, 'pending')))
      .orderBy(schema.assetExportCatalogItems.position)
      .limit(1)
  )[0]

  if (!item) return finalizeCatalog()

  await db.update(schema.assetExportCatalogs).set({ status: 'running' }).where(eq(schema.assetExportCatalogs.id, catalogId))
  await db.update(schema.assetExportCatalogItems).set({ status: 'rendering' }).where(eq(schema.assetExportCatalogItems.id, item.id))

  try {
    const template = (await db.select().from(schema.assetExportTemplates).where(eq(schema.assetExportTemplates.id, catalog.templateId)).limit(1))[0]
    if (!template) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

    const asset = (await db.select({ name: schema.developerProperties.name }).from(schema.developerProperties).where(eq(schema.developerProperties.id, item.assetId)).limit(1))[0]
    const title = asset?.name || `Activo #${item.assetId}`

    const bindings = await resolveAssetBindings(event, { orgId, assetKind: 'developer_property', assetId: item.assetId })
    const structure = JSON.parse(template.structureJson) as TemplateStructure
    const pdfBytes = await renderPdf(event, structure, catalog.formatKey, bindings)
    const pageCount = (await PDFDocument.load(pdfBytes)).getPageCount()

    const r2Key = `asset-export-catalogs/${orgId}/${catalogId}/fragment-${item.id}.pdf`
    await cfEnv(event).MEDIA.put(r2Key, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } })

    const completedAt = now()
    await db
      .update(schema.assetExportCatalogItems)
      .set({ status: 'completed', title, pageCount, r2Key, completedAt })
      .where(eq(schema.assetExportCatalogItems.id, item.id))
    await db.update(schema.assetExportCatalogs).set({ completedCount: catalog.completedCount + 1 }).where(eq(schema.assetExportCatalogs.id, catalogId))

    return { done: false, item: { id: item.id, status: 'completed' } }
  } catch (err: any) {
    const message = err?.statusMessage || err?.message || 'Render failed'
    await db.update(schema.assetExportCatalogItems).set({ status: 'failed', errorMessage: String(message).slice(0, 500), completedAt: now() }).where(eq(schema.assetExportCatalogItems.id, item.id))
    await db.update(schema.assetExportCatalogs).set({ failedCount: catalog.failedCount + 1 }).where(eq(schema.assetExportCatalogs.id, catalogId))

    return { done: false, item: { id: item.id, status: 'failed', errorMessage: message } }
  }

  async function finalizeCatalog() {
    const completedItems = await db
      .select()
      .from(schema.assetExportCatalogItems)
      .where(and(eq(schema.assetExportCatalogItems.catalogId, catalogId), eq(schema.assetExportCatalogItems.status, 'completed')))
      .orderBy(schema.assetExportCatalogItems.position)

    if (completedItems.length === 0) {
      const [updated] = await db
        .update(schema.assetExportCatalogs)
        .set({ status: 'failed', errorMessage: 'Ningún activo pudo generarse', completedAt: now() })
        .where(eq(schema.assetExportCatalogs.id, catalogId))
        .returning()
      return { done: true, catalog: updated }
    }

    try {
      const tenant = await resolveTenantBindings(event, orgId)
      const fragments = await Promise.all(
        completedItems.map(async (i) => {
          const obj = await cfEnv(event).MEDIA.get(i.r2Key!)
          if (!obj) throw createError({ statusCode: 500, statusMessage: `Fragment missing from storage for item ${i.id}` })
          return { title: i.title || `Activo #${i.assetId}`, pageCount: i.pageCount || 1, bytes: new Uint8Array(await obj.arrayBuffer()) }
        }),
      )

      const finalBytes = await assembleCatalogPdf(event, { formatKey: catalog.formatKey, coverTitle: catalog.coverTitle || catalog.name, tenant, fragments })
      const r2Key = `asset-export-catalogs/${orgId}/${catalogId}/final.pdf`
      await cfEnv(event).MEDIA.put(r2Key, finalBytes, { httpMetadata: { contentType: 'application/pdf' } })

      // Best-effort cleanup of the per-asset fragments — the final combined PDF is the only deliverable from here on.
      await Promise.all(completedItems.map((i) => cfEnv(event).MEDIA.delete(i.r2Key!).catch(() => null)))

      const completedAt = now()
      const finalStatus = catalog.failedCount > 0 ? 'completed_with_errors' : 'completed'
      const [updated] = await db
        .update(schema.assetExportCatalogs)
        .set({ status: finalStatus, r2Key, fileSizeBytes: finalBytes.byteLength, completedAt })
        .where(eq(schema.assetExportCatalogs.id, catalogId))
        .returning()

      await logAdminAction(event, { user, orgId, action: 'run', resource: 'asset-export-catalog', resourceId: catalogId })
      return { done: true, catalog: updated }
    } catch (err: any) {
      const message = err?.statusMessage || err?.message || 'Assembly failed'
      const [updated] = await db
        .update(schema.assetExportCatalogs)
        .set({ status: 'failed', errorMessage: String(message).slice(0, 500), completedAt: now() })
        .where(eq(schema.assetExportCatalogs.id, catalogId))
        .returning()
      return { done: true, catalog: updated }
    }
  }
})
