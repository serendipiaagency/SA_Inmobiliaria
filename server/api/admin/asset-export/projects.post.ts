import { and, eq, isNull, or } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'

interface CreateProjectBody {
  templateId?: number
  assetKind?: string
  assetId?: number
  name?: string
}

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<CreateProjectBody>(event)

  if (!body?.templateId || !body.assetKind || !body.assetId) {
    throw createError({ statusCode: 422, statusMessage: 'templateId, assetKind and assetId are required' })
  }
  if (body.assetKind !== 'developer_property') {
    throw createError({ statusCode: 422, statusMessage: `Unsupported assetKind: ${body.assetKind}` })
  }

  const db = useDb(event)
  const template = (
    await db
      .select()
      .from(schema.assetExportTemplates)
      .where(or(isNull(schema.assetExportTemplates.organizationId), eq(schema.assetExportTemplates.organizationId, orgId)))
      .limit(500)
  ).find((t) => t.id === body.templateId)
  if (!template) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

  const asset = (
    await db
      .select({ id: schema.developerProperties.id, name: schema.developerProperties.name, price: schema.developerProperties.price, organizationId: schema.developerProperties.organizationId })
      .from(schema.developerProperties)
      .where(and(eq(schema.developerProperties.id, body.assetId), eq(schema.developerProperties.organizationId, orgId)))
      .limit(1)
  )[0]
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })

  const nowTs = now()
  const inserted = await db
    .insert(schema.assetExportProjects)
    .values({
      organizationId: orgId,
      templateId: template.id,
      assetKind: body.assetKind,
      assetId: body.assetId,
      name: body.name?.trim() || `${template.name} — ${asset.name}`,
      formatKey: template.formatKey,
      structureJson: template.structureJson,
      priceAtCreation: asset.price,
      createdBy: user.id,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'asset-export-project', resourceId: inserted[0].id })
  return inserted[0]
})
