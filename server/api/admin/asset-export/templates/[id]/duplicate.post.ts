import { eq, isNull, or } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, now } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'

// The only way to get an editable copy of a system template — required
// before a tenant can customize one (system templates are read-only, see
// [id].put.ts). Also works on the tenant's own templates ("save a variant").
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const source = (
    await db
      .select()
      .from(schema.assetExportTemplates)
      .where(or(isNull(schema.assetExportTemplates.organizationId), eq(schema.assetExportTemplates.organizationId, orgId)))
      .limit(200)
  ).find((t) => t.id === id)
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

  const nowTs = now()
  const inserted = await db
    .insert(schema.assetExportTemplates)
    .values({
      organizationId: orgId,
      name: `${source.name} (copia)`,
      description: source.description,
      category: source.category,
      formatKey: source.formatKey,
      assetTypeScope: source.assetTypeScope,
      isSystem: 0,
      status: 'draft',
      structureJson: source.structureJson,
      duplicatedFromId: source.id,
      createdBy: user.id,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  await logAdminAction(event, { user, orgId, action: 'duplicate', resource: 'asset-export-template', resourceId: inserted[0].id, detail: `from ${source.id}` })
  return inserted[0]
})
