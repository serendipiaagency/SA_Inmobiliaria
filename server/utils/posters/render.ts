import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { useDb, schema, now, cfEnv } from '../db'
import { resolveAssetBindings } from '../assetExport/bindings'
import { renderPdf } from '../assetExport/pdfRenderer'
import { validateRenderedPdf } from '../assetExport/renderValidation'
import { FORMAT_BY_KEY } from '../assetExport/formats'
import type { TemplateStructure } from '../assetExport/types'
import { buildStructuredKey } from '../media'
import { registerGeneratedFile } from '../mediaAssets'
import { assertQuotaAvailable } from '../mediaQuota'
import { getPosterProject } from './service'

/**
 * Renderiza una pieza de cartel a un PDF real y lo guarda en R2 — nunca marca
 * un render «completado» si los bytes no llegaron a R2. Cualquier fallo en la
 * resolución/renderizado/subida deja una fila de render «failed» con el error
 * real, en vez de un éxito inventado. Sólo PDF (los formatos de cartel son
 * todos de impresión; la imagen depende de Browser Rendering, decisión del
 * propietario).
 *
 * Reutiliza el renderizador pdf-lib y los bindings de Property Core de Asset
 * Export Studio: `resolveAssetBindings` sirve obra nueva y 2ª mano según
 * `assetKind` ('developer_property' | 'agent_property').
 */
export async function renderPosterProject(event: H3Event, params: { orgId: number; userId: number; projectId: number }): Promise<{ id: number; status: 'completed'; downloadUrl: string; fileSizeBytes: number; validationWarnings: string[] }> {
  const { orgId, userId, projectId } = params
  const db = useDb(event)
  const env = cfEnv(event)

  const project = await getPosterProject(db, orgId, projectId)
  const format = FORMAT_BY_KEY[project.formatKey]
  if (!format) throw createError({ statusCode: 400, statusMessage: `Formato desconocido: ${project.formatKey}` })

  const nowTs = now()
  const renderRow = (
    await db
      .insert(schema.posterRenders)
      .values({ organizationId: orgId, projectId, formatKey: project.formatKey, status: 'rendering', createdAt: nowTs })
      .returning()
  )[0]

  try {
    const bindings = await resolveAssetBindings(event, { orgId, assetKind: project.assetKind, assetId: project.assetId })
    const structure = project.structure as TemplateStructure

    const bytes = await renderPdf(event, structure, project.formatKey, bindings)
    const validation = await validateRenderedPdf(bytes, structure, bindings)
    if (!validation.ok) {
      const message = `Validación fallida: ${validation.errors.join('; ')}`
      await db.update(schema.posterRenders).set({ status: 'failed', errorMessage: message.slice(0, 500), validationJson: JSON.stringify(validation) }).where(eq(schema.posterRenders.id, renderRow.id))
      throw createError({ statusCode: 422, statusMessage: message })
    }

    await assertQuotaAvailable(db, orgId, bytes.byteLength)
    const r2Key = buildStructuredKey(orgId, 'export', 'pdf')
    await env.MEDIA.put(r2Key, bytes, { httpMetadata: { contentType: 'application/pdf' } })
    await registerGeneratedFile(db, {
      organizationId: orgId,
      r2Key,
      bytes,
      mimeType: 'application/pdf',
      extension: 'pdf',
      visibility: 'private',
      category: 'export',
      entityType: 'poster_renders',
      entityId: renderRow.id,
      createdBy: userId,
    })

    const completedAt = now()
    await db.update(schema.posterRenders).set({ status: 'completed', r2Key, fileSizeBytes: bytes.byteLength, validationJson: JSON.stringify(validation) }).where(eq(schema.posterRenders.id, renderRow.id))
    await db.update(schema.posterProjects).set({ status: 'ready', updatedAt: completedAt }).where(eq(schema.posterProjects.id, projectId))

    return { id: renderRow.id, status: 'completed', downloadUrl: `/api/admin/carteles/renders/${renderRow.id}/download`, fileSizeBytes: bytes.byteLength, validationWarnings: validation.warnings }
  } catch (err: any) {
    const message = err?.statusMessage || err?.message || 'Render failed'
    await db.update(schema.posterRenders).set({ status: 'failed', errorMessage: String(message).slice(0, 500) }).where(eq(schema.posterRenders.id, renderRow.id))
    throw createError({ statusCode: err?.statusCode || 500, statusMessage: message })
  }
}
