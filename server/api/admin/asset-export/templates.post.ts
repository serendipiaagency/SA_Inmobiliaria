import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'
import { isValidFormatKey } from '../../../utils/assetExport/formats'
import { validateStructure } from '../../../utils/assetExport/types'

interface CreateTemplateBody {
  name?: string
  description?: string
  category?: string
  formatKey?: string
  assetTypeScope?: string
  structure?: unknown
}

// Tenants can only create their own private templates here (organizationId
// always set to the caller's org, isSystem always 0) — system templates are
// seeded separately and are never created through this endpoint.
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<CreateTemplateBody>(event)

  if (!body?.name) throw createError({ statusCode: 422, statusMessage: 'name is required' })
  if (!body.formatKey || !isValidFormatKey(body.formatKey)) throw createError({ statusCode: 422, statusMessage: 'Invalid formatKey' })

  const structureResult = validateStructure(body.structure ?? { pages: [] })
  if (!structureResult.ok) throw createError({ statusCode: 422, statusMessage: structureResult.error })

  const db = useDb(event)
  const nowTs = now()
  const inserted = await db
    .insert(schema.assetExportTemplates)
    .values({
      organizationId: orgId,
      name: String(body.name).slice(0, 200),
      description: body.description ? String(body.description).slice(0, 1000) : null,
      category: body.category ? String(body.category).slice(0, 60) : 'modern',
      formatKey: body.formatKey,
      assetTypeScope: body.assetTypeScope ? String(body.assetTypeScope).slice(0, 60) : null,
      isSystem: 0,
      status: 'draft',
      structureJson: JSON.stringify(structureResult.structure),
      createdBy: user.id,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'asset-export-template', resourceId: inserted[0].id })
  return inserted[0]
})
