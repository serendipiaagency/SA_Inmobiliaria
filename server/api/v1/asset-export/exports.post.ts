import { and, eq, isNull, or } from 'drizzle-orm'
import { useDb, schema, now } from '../../../utils/db'
import { requireApiKey } from '../../../utils/apiAuth'
import { rateLimit } from '../../../utils/rateLimit'
import { resolveAssetBindings } from '../../../utils/assetExport/bindings'
import { renderPdf } from '../../../utils/assetExport/pdfRenderer'
import { FORMAT_BY_KEY } from '../../../utils/assetExport/formats'
import type { TemplateStructure } from '../../../utils/assetExport/types'
import { cfEnv } from '../../../utils/db'

interface CreateExportBody {
  assetId?: number
  assetKind?: string
  templateId?: number
}

/**
 * POST /api/v1/asset-export/exports — Fase 16-17 (public API). Requires the
 * "write" scope. Creates a project from a template and renders it
 * synchronously in the same request, mirroring the admin UI's
 * create-then-render flow (server/api/admin/asset-export/projects.post.ts +
 * .../[id]/render.post.ts) so external integrations get one call instead of
 * two round trips.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'write')
  await rateLimit(event, 'public-api-write', { limit: 30, windowSeconds: 60 })

  const body = await readBody<CreateExportBody>(event)
  if (!body?.assetId || !body.templateId) throw createError({ statusCode: 422, statusMessage: 'assetId and templateId are required' })
  const assetKind = body.assetKind || 'developer_property'
  if (assetKind !== 'developer_property') throw createError({ statusCode: 422, statusMessage: `Unsupported assetKind: ${assetKind}` })

  const db = useDb(event)
  const template = (
    await db
      .select()
      .from(schema.assetExportTemplates)
      .where(and(or(isNull(schema.assetExportTemplates.organizationId), eq(schema.assetExportTemplates.organizationId, orgId)), eq(schema.assetExportTemplates.id, body.templateId)))
      .limit(1)
  )[0]
  if (!template) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

  const format = FORMAT_BY_KEY[template.formatKey]
  if (!format?.renderReady) throw createError({ statusCode: 422, statusMessage: `El formato "${template.formatKey}" todavía no tiene renderizador` })

  const asset = (
    await db
      .select({ id: schema.developerProperties.id, name: schema.developerProperties.name, price: schema.developerProperties.price })
      .from(schema.developerProperties)
      .where(and(eq(schema.developerProperties.id, body.assetId), eq(schema.developerProperties.organizationId, orgId)))
      .limit(1)
  )[0]
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })

  const nowTs = now()
  const project = (
    await db
      .insert(schema.assetExportProjects)
      .values({
        organizationId: orgId,
        templateId: template.id,
        assetKind,
        assetId: body.assetId,
        name: `${template.name} — ${asset.name} (API)`,
        formatKey: template.formatKey,
        structureJson: template.structureJson,
        priceAtCreation: asset.price,
        createdAt: nowTs,
        updatedAt: nowTs,
      })
      .returning()
  )[0]

  const renderRow = (
    await db
      .insert(schema.assetExportRenders)
      .values({ organizationId: orgId, projectId: project.id, outputType: 'pdf', formatKey: project.formatKey, status: 'rendering', createdAt: nowTs })
      .returning()
  )[0]

  try {
    const bindings = await resolveAssetBindings(event, { orgId, assetKind, assetId: body.assetId })
    const structure = JSON.parse(project.structureJson) as TemplateStructure
    const pdfBytes = await renderPdf(event, structure, project.formatKey, bindings)

    const r2Key = `asset-export-renders/${orgId}/${project.id}/${renderRow.id}.pdf`
    await cfEnv(event).MEDIA.put(r2Key, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } })

    const completedAt = now()
    await db.update(schema.assetExportRenders).set({ status: 'completed', r2Key, fileSizeBytes: pdfBytes.byteLength, completedAt }).where(eq(schema.assetExportRenders.id, renderRow.id))
    await db.update(schema.assetExportProjects).set({ status: 'exported', updatedAt: completedAt }).where(eq(schema.assetExportProjects.id, project.id))

    return {
      id: renderRow.id,
      projectId: project.id,
      status: 'completed',
      downloadUrl: `/api/v1/asset-export/exports/${renderRow.id}/download`,
      fileSizeBytes: pdfBytes.byteLength,
    }
  } catch (err: any) {
    const message = err?.statusMessage || err?.message || 'Render failed'
    await db.update(schema.assetExportRenders).set({ status: 'failed', errorMessage: String(message).slice(0, 500), completedAt: now() }).where(eq(schema.assetExportRenders.id, renderRow.id))
    throw createError({ statusCode: err?.statusCode || 500, statusMessage: message })
  }
})
