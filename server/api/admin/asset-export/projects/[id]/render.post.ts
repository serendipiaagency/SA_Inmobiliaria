import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, now, cfEnv } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'
import { resolveAssetBindings } from '../../../../../utils/assetExport/bindings'
import { renderPdf } from '../../../../../utils/assetExport/pdfRenderer'
import { validateRenderedPdf } from '../../../../../utils/assetExport/renderValidation'
import { FORMAT_BY_KEY } from '../../../../../utils/assetExport/formats'
import type { TemplateStructure } from '../../../../../utils/assetExport/types'
import { buildStructuredKey } from '../../../../../utils/media'
import { registerGeneratedFile } from '../../../../../utils/mediaAssets'
import { assertQuotaAvailable } from '../../../../../utils/mediaQuota'

/**
 * Renders one project to a real file and stores it in R2 — never marks a
 * render "completed" unless the bytes actually made it to R2. A failure
 * anywhere in resolution/rendering/upload writes a failed render row with
 * the real error instead of a fabricated success.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(projectId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const project = (await db.select().from(schema.assetExportProjects).where(eq(schema.assetExportProjects.id, projectId)).limit(1))[0]
  if (!project || project.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const format = FORMAT_BY_KEY[project.formatKey]
  if (!format) throw createError({ statusCode: 400, statusMessage: `Unknown formatKey: ${project.formatKey}` })
  if (!format.renderReady) {
    throw createError({ statusCode: 422, statusMessage: `El formato "${format.label}" todavía no tiene renderizador (pendiente: pipeline de imagen para redes).` })
  }

  const nowTs = now()
  const renderRow = (
    await db
      .insert(schema.assetExportRenders)
      .values({ organizationId: orgId, projectId, outputType: 'pdf', formatKey: project.formatKey, status: 'rendering', requestedBy: user.id, createdAt: nowTs })
      .returning()
  )[0]

  try {
    const bindings = await resolveAssetBindings(event, { orgId, assetKind: project.assetKind, assetId: project.assetId })
    const structure = JSON.parse(project.structureJson) as TemplateStructure
    const pdfBytes = await renderPdf(event, structure, project.formatKey, bindings)

    const validation = await validateRenderedPdf(pdfBytes, structure, bindings)
    if (!validation.ok) {
      const message = `Validación fallida: ${validation.errors.join('; ')}`
      await db
        .update(schema.assetExportRenders)
        .set({ status: 'failed', errorMessage: message.slice(0, 500), validationJson: JSON.stringify(validation), completedAt: now() })
        .where(eq(schema.assetExportRenders.id, renderRow.id))
      throw createError({ statusCode: 422, statusMessage: message })
    }

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
      entityType: 'asset_export_renders',
      entityId: renderRow.id,
      createdBy: user.id,
    })

    const completedAt = now()
    await db
      .update(schema.assetExportRenders)
      .set({ status: 'completed', r2Key, fileSizeBytes: pdfBytes.byteLength, validationJson: JSON.stringify(validation), completedAt })
      .where(eq(schema.assetExportRenders.id, renderRow.id))
    await db.update(schema.assetExportProjects).set({ status: 'exported', updatedAt: completedAt }).where(eq(schema.assetExportProjects.id, projectId))
    await db.insert(schema.assetExportProjectVersions).values({ projectId, structureJson: project.structureJson, status: 'exported', editedBy: user.id, createdAt: completedAt })

    await logAdminAction(event, { user, orgId, action: 'run', resource: 'asset-export-render', resourceId: renderRow.id })
    return {
      id: renderRow.id,
      status: 'completed',
      downloadUrl: `/api/admin/asset-export/renders/${renderRow.id}/download`,
      fileSizeBytes: pdfBytes.byteLength,
      validationWarnings: validation.warnings,
    }
  } catch (err: any) {
    const message = err?.statusMessage || err?.message || 'Render failed'
    await db.update(schema.assetExportRenders).set({ status: 'failed', errorMessage: String(message).slice(0, 500), completedAt: now() }).where(eq(schema.assetExportRenders.id, renderRow.id))
    throw createError({ statusCode: err?.statusCode || 500, statusMessage: message })
  }
})
