import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema, now } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'
import { validateStructure } from '../../../../utils/assetExport/types'

interface UpdateTemplateBody {
  name?: string
  description?: string
  category?: string
  assetTypeScope?: string
  status?: 'draft' | 'published' | 'archived'
  structure?: unknown
}

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const existing = (await db.select().from(schema.assetExportTemplates).where(eq(schema.assetExportTemplates.id, id)).limit(1))[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  if (existing.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  // System templates (organizationId NULL) never reach this branch since the
  // check above already 404s them for every real tenant — kept explicit so
  // the invariant is visible here too, not just implied by the org check.
  if (existing.isSystem) throw createError({ statusCode: 403, statusMessage: 'Las plantillas del sistema no se pueden editar directamente. Duplícala primero.' })

  const body = await readBody<UpdateTemplateBody>(event)
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = String(body.name).slice(0, 200)
  if (body.description !== undefined) patch.description = body.description ? String(body.description).slice(0, 1000) : null
  if (body.category !== undefined) patch.category = String(body.category).slice(0, 60)
  if (body.assetTypeScope !== undefined) patch.assetTypeScope = body.assetTypeScope ? String(body.assetTypeScope).slice(0, 60) : null
  if (body.status !== undefined) {
    if (!['draft', 'published', 'archived'].includes(body.status)) throw createError({ statusCode: 422, statusMessage: 'Invalid status' })
    patch.status = body.status
  }
  if (body.structure !== undefined) {
    const result = validateStructure(body.structure)
    if (!result.ok) throw createError({ statusCode: 422, statusMessage: result.error })
    patch.structureJson = JSON.stringify(result.structure)
  }

  const nowTs = now()
  await db
    .update(schema.assetExportTemplates)
    .set({ ...patch, updatedAt: nowTs })
    .where(eq(schema.assetExportTemplates.id, id))

  if (patch.structureJson) {
    await db.insert(schema.assetExportTemplateVersions).values({ templateId: id, structureJson: patch.structureJson as string, editedBy: user.id, createdAt: nowTs })
  }

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'asset-export-template', resourceId: id })
  return (await db.select().from(schema.assetExportTemplates).where(eq(schema.assetExportTemplates.id, id)).limit(1))[0]
})
