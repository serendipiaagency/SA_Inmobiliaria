import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'
import { FORMAT_BY_KEY } from '../../../utils/assetExport/formats'

interface CreateCatalogBody {
  name?: string
  coverTitle?: string
  templateId?: number
  assetIds?: number[]
}

// Assembly (server/utils/assetExport/catalogRenderer.ts) happens in one
// request once every fragment has rendered, so the asset count is capped
// lower than export_batches (200) to keep that final copyPages pass well
// inside a single Workers invocation's CPU/wall-clock budget.
const MAX_CATALOG_ASSETS = 30

/**
 * Creates a catalog + one pending item per asset. Mirrors batches.post.ts:
 * nothing renders here, .../catalogs/:id/process-next does one fragment per
 * call, then assembles the final combined PDF once every item is done.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<CreateCatalogBody>(event)

  if (!body?.templateId) throw createError({ statusCode: 422, statusMessage: 'templateId is required' })
  if (!Array.isArray(body.assetIds) || body.assetIds.length === 0) throw createError({ statusCode: 422, statusMessage: 'assetIds must be a non-empty array' })
  if (body.assetIds.length > MAX_CATALOG_ASSETS) throw createError({ statusCode: 422, statusMessage: `Máximo ${MAX_CATALOG_ASSETS} activos por catálogo` })

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
  const validIds = assetIds.filter((id) => foundAssets.some((a) => a.id === id))
  const skipped = assetIds.filter((id) => !validIds.includes(id))

  if (validIds.length === 0) throw createError({ statusCode: 422, statusMessage: 'Ninguno de los activos indicados pertenece a tu organización' })

  const nowTs = now()
  const catalog = (
    await db
      .insert(schema.assetExportCatalogs)
      .values({
        organizationId: orgId,
        name: body.name?.trim() || `Catálogo ${nowTs}`,
        templateId: template.id,
        formatKey: template.formatKey,
        coverTitle: body.coverTitle?.trim() || body.name?.trim() || 'Catálogo de propiedades',
        status: 'pending',
        totalCount: validIds.length,
        requestedBy: user.id,
        createdAt: nowTs,
      })
      .returning()
  )[0]

  await db.insert(schema.assetExportCatalogItems).values(
    validIds.map((assetId, index) => ({
      catalogId: catalog.id,
      position: index,
      assetId,
      status: 'pending' as const,
      createdAt: nowTs,
    })),
  )

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'asset-export-catalog', resourceId: catalog.id, detail: `${validIds.length} items` })
  return { ...catalog, skipped }
})
