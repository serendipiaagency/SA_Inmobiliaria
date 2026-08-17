import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, now, cfEnv } from '../../../../../utils/db'
import { resolveAssetBindings } from '../../../../../utils/assetExport/bindings'
import { renderPdf } from '../../../../../utils/assetExport/pdfRenderer'
import { validateRenderedPdf } from '../../../../../utils/assetExport/renderValidation'
import type { TemplateStructure } from '../../../../../utils/assetExport/types'
import { buildStructuredKey } from '../../../../../utils/media'
import { registerGeneratedFile } from '../../../../../utils/mediaAssets'
import { assertQuotaAvailable } from '../../../../../utils/mediaQuota'

/**
 * Renders exactly one pending item from the batch, then returns. The
 * client (pages/admin/asset-export/batches/[id].vue) calls this in a loop
 * until done=true — this project has no Queues/Durable Objects binding, so
 * "background" batch processing is driven by the browser polling one item
 * per request instead of a real worker queue. Each call only does one
 * render's worth of work, so a large batch never risks a single request's
 * CPU/wall-clock limit.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const batchId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(batchId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const batch = (await db.select().from(schema.exportBatches).where(eq(schema.exportBatches.id, batchId)).limit(1))[0]
  if (!batch || batch.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Batch not found' })

  if (batch.status === 'cancelled') return { done: true, batch }

  const item = (await db.select().from(schema.exportBatchItems).where(and(eq(schema.exportBatchItems.batchId, batchId), eq(schema.exportBatchItems.status, 'pending'))).limit(1))[0]

  if (!item) {
    const finalStatus = batch.failedCount > 0 ? 'completed_with_errors' : 'completed'
    const [updated] = await db.update(schema.exportBatches).set({ status: finalStatus, completedAt: now() }).where(eq(schema.exportBatches.id, batchId)).returning()
    return { done: true, batch: updated }
  }

  await db.update(schema.exportBatches).set({ status: 'running' }).where(eq(schema.exportBatches.id, batchId))
  await db.update(schema.exportBatchItems).set({ status: 'rendering' }).where(eq(schema.exportBatchItems.id, item.id))

  const nowTs = now()
  let renderRowId: number | null = null

  try {
    const template = (await db.select().from(schema.assetExportTemplates).where(eq(schema.assetExportTemplates.id, item.templateId!)).limit(1))[0]
    if (!template) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

    const asset = (await db.select({ name: schema.developerProperties.name }).from(schema.developerProperties).where(eq(schema.developerProperties.id, item.assetId)).limit(1))[0]

    const project = (
      await db
        .insert(schema.assetExportProjects)
        .values({
          organizationId: orgId,
          templateId: template.id,
          assetKind: item.assetKind,
          assetId: item.assetId,
          name: `${template.name} — ${asset?.name || item.assetId} (lote #${batchId})`,
          formatKey: item.formatKey,
          structureJson: template.structureJson,
          status: 'draft',
          createdAt: nowTs,
          updatedAt: nowTs,
        })
        .returning()
    )[0]
    const renderRow = (
      await db
        .insert(schema.assetExportRenders)
        .values({ organizationId: orgId, projectId: project.id, outputType: 'pdf', formatKey: item.formatKey, status: 'rendering', createdAt: nowTs })
        .returning()
    )[0]
    renderRowId = renderRow.id

    const bindings = await resolveAssetBindings(event, { orgId, assetKind: item.assetKind, assetId: item.assetId })
    const structure = JSON.parse(project.structureJson) as TemplateStructure
    const pdfBytes = await renderPdf(event, structure, project.formatKey, bindings)

    const validation = await validateRenderedPdf(pdfBytes, structure, bindings)
    if (!validation.ok) throw createError({ statusCode: 422, statusMessage: `Validación fallida: ${validation.errors.join('; ')}` })

    await assertQuotaAvailable(db, orgId, pdfBytes.byteLength)
    const r2Key = buildStructuredKey(orgId, 'export', 'pdf')
    await cfEnv(event).MEDIA.put(r2Key, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } })
    await registerGeneratedFile(db, {
      organizationId: orgId,
      r2Key,
      bytes: pdfBytes,
      mimeType: 'application/pdf',
      extension: 'pdf',
      visibility: 'private',
      category: 'export',
      entityType: 'export_batch_items',
      entityId: item.id,
    })

    const completedAt = now()
    await db
      .update(schema.assetExportRenders)
      .set({ status: 'completed', r2Key, fileSizeBytes: pdfBytes.byteLength, validationJson: JSON.stringify(validation), completedAt })
      .where(eq(schema.assetExportRenders.id, renderRow.id))
    await db.update(schema.assetExportProjects).set({ status: 'exported', updatedAt: completedAt }).where(eq(schema.assetExportProjects.id, project.id))
    await db.update(schema.exportBatchItems).set({ status: 'completed', renderId: renderRow.id, completedAt }).where(eq(schema.exportBatchItems.id, item.id))
    await db.update(schema.exportBatches).set({ completedCount: batch.completedCount + 1 }).where(eq(schema.exportBatches.id, batchId))

    return { done: false, item: { id: item.id, status: 'completed', renderId: renderRow.id } }
  } catch (err: any) {
    const message = err?.statusMessage || err?.message || 'Render failed'
    if (renderRowId != null) {
      await db.update(schema.assetExportRenders).set({ status: 'failed', errorMessage: String(message).slice(0, 500), completedAt: now() }).where(eq(schema.assetExportRenders.id, renderRowId))
    }
    await db.update(schema.exportBatchItems).set({ status: 'failed', errorMessage: String(message).slice(0, 500), completedAt: now() }).where(eq(schema.exportBatchItems.id, item.id))
    await db.update(schema.exportBatches).set({ failedCount: batch.failedCount + 1 }).where(eq(schema.exportBatches.id, batchId))

    return { done: false, item: { id: item.id, status: 'failed', errorMessage: message } }
  }
})
