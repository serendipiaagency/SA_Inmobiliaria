import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'
import { FORMAT_BY_KEY } from '../../../utils/assetExport/formats'

interface CreateBatchBody {
  name?: string
  templateId?: number
  assetIds?: number[]
}

/**
 * Creates a batch + one pending item per asset. Doesn't render anything —
 * there's no queue/Durable Objects binding in this project (see the audit
 * in earlier commits), so a batch can't fan out into background workers.
 * Rendering happens one item per request via .../batches/:id/process-next,
 * driven by the client polling loop — real progress, without risking a
 * single request's CPU/wall-clock limit on a large batch.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<CreateBatchBody>(event)

  if (!body?.templateId) throw createError({ statusCode: 422, statusMessage: 'templateId is required' })
  if (!Array.isArray(body.assetIds) || body.assetIds.length === 0) throw createError({ statusCode: 422, statusMessage: 'assetIds must be a non-empty array' })
  if (body.assetIds.length > 200) throw createError({ statusCode: 422, statusMessage: 'Máximo 200 activos por lote' })

  const db = useDb(event)
  const template = (
    await db
      .select()
      .from(schema.assetExportTemplates)
      .where(and(or(isNull(schema.assetExportTemplates.organizationId), eq(schema.assetExportTemplates.organizationId, orgId)), eq(schema.assetExportTemplates.id, body.templateId)))
      .limit(1)
  )[0]
  if (!template) throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  if (!FORMAT_BY_KEY[template.formatKey]?.renderReady) {
    throw createError({ statusCode: 422, statusMessage: `El formato de esta plantilla todavía no tiene renderizador` })
  }

  const assetIds = [...new Set(body.assetIds)]
  const foundAssets = await db
    .select({ id: schema.developerProperties.id })
    .from(schema.developerProperties)
    .where(and(inArray(schema.developerProperties.id, assetIds), eq(schema.developerProperties.organizationId, orgId)))
  const validIds = new Set(foundAssets.map((a) => a.id))
  const skipped = assetIds.filter((id) => !validIds.has(id))

  if (validIds.size === 0) throw createError({ statusCode: 422, statusMessage: 'Ninguno de los activos indicados pertenece a tu organización' })

  const nowTs = now()
  const batch = (
    await db
      .insert(schema.exportBatches)
      .values({ organizationId: orgId, name: body.name?.trim() || `Lote ${nowTs}`, status: 'pending', totalCount: validIds.size, requestedBy: user.id, createdAt: nowTs })
      .returning()
  )[0]

  await db.insert(schema.exportBatchItems).values(
    [...validIds].map((assetId) => ({
      batchId: batch.id,
      assetKind: 'developer_property',
      assetId,
      templateId: template.id,
      formatKey: template.formatKey,
      status: 'pending' as const,
      createdAt: nowTs,
    })),
  )

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'asset-export-batch', resourceId: batch.id, detail: `${validIds.size} items` })
  return { ...batch, skipped }
})
