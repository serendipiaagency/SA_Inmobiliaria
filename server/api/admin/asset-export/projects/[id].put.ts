import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema, now } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'
import { validateStructure } from '../../../../utils/assetExport/types'

const VALID_STATUSES = ['draft', 'in_review', 'changes_requested', 'approved', 'exported', 'archived'] as const

interface UpdateProjectBody {
  name?: string
  status?: (typeof VALID_STATUSES)[number]
  structure?: unknown
  /** "Actualizar automáticamente" — re-freeze priceAtCreation to the asset's live price. */
  refreshPriceSnapshot?: boolean
}

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const project = (await db.select().from(schema.assetExportProjects).where(eq(schema.assetExportProjects.id, id)).limit(1))[0]
  if (!project || project.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const body = await readBody<UpdateProjectBody>(event)
  const patch: Record<string, unknown> = {}

  if (body.name !== undefined) patch.name = String(body.name).slice(0, 200)
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) throw createError({ statusCode: 422, statusMessage: 'Invalid status' })
    patch.status = body.status
    if (body.status === 'approved') patch.approvedBy = user.id
  }
  if (body.structure !== undefined) {
    const result = validateStructure(body.structure)
    if (!result.ok) throw createError({ statusCode: 422, statusMessage: result.error })
    patch.structureJson = JSON.stringify(result.structure)
  }
  if (body.refreshPriceSnapshot && project.assetKind === 'developer_property') {
    const asset = (await db.select({ price: schema.developerProperties.price }).from(schema.developerProperties).where(eq(schema.developerProperties.id, project.assetId)).limit(1))[0]
    if (asset) patch.priceAtCreation = asset.price
  }

  const nowTs = now()
  await db
    .update(schema.assetExportProjects)
    .set({ ...patch, updatedAt: nowTs })
    .where(eq(schema.assetExportProjects.id, id))

  if (patch.structureJson || patch.status) {
    await db.insert(schema.assetExportProjectVersions).values({
      projectId: id,
      structureJson: (patch.structureJson as string) || project.structureJson,
      status: (patch.status as string) || project.status,
      editedBy: user.id,
      createdAt: nowTs,
    })
  }

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'asset-export-project', resourceId: id })
  return (await db.select().from(schema.assetExportProjects).where(eq(schema.assetExportProjects.id, id)).limit(1))[0]
})
