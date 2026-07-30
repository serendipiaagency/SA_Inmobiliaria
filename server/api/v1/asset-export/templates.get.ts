import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireApiKey } from '../../../utils/apiAuth'
import { rateLimit } from '../../../utils/rateLimit'

/**
 * GET /api/v1/asset-export/templates — Fase 16 (public API). Requires
 * `Authorization: Bearer <api key>` with the "read" scope. Lists system
 * templates plus the caller's own, published only — drafts and archived
 * templates aren't meant for external consumption.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'read')
  await rateLimit(event, 'public-api', { limit: 120, windowSeconds: 60 })

  const db = useDb(event)
  const rows = await db
    .select({
      id: schema.assetExportTemplates.id,
      name: schema.assetExportTemplates.name,
      category: schema.assetExportTemplates.category,
      formatKey: schema.assetExportTemplates.formatKey,
      assetTypeScope: schema.assetExportTemplates.assetTypeScope,
      isSystem: schema.assetExportTemplates.isSystem,
    })
    .from(schema.assetExportTemplates)
    .where(
      and(
        or(isNull(schema.assetExportTemplates.organizationId), eq(schema.assetExportTemplates.organizationId, orgId)),
        eq(schema.assetExportTemplates.status, 'published'),
      ),
    )
    .orderBy(desc(schema.assetExportTemplates.isSystem))
    .limit(200)

  return { data: rows }
})
