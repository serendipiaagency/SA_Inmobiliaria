import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'

/**
 * Returns one project plus a real priceChanged flag — compares the asset's
 * live price against project.priceAtCreation (frozen at creation time),
 * instead of a UI-only check the client could get wrong or skip.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const project = (await db.select().from(schema.assetExportProjects).where(eq(schema.assetExportProjects.id, id)).limit(1))[0]
  if (!project || project.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  let currentPrice: number | null = null
  if (project.assetKind === 'developer_property') {
    const asset = (await db.select({ price: schema.developerProperties.price }).from(schema.developerProperties).where(eq(schema.developerProperties.id, project.assetId)).limit(1))[0]
    currentPrice = asset?.price ?? null
  }

  const priceChanged = project.priceAtCreation != null && currentPrice != null && currentPrice !== project.priceAtCreation

  const renders = await db.select().from(schema.assetExportRenders).where(eq(schema.assetExportRenders.projectId, id)).limit(50)

  return { ...project, currentPrice, priceChanged, renders }
})
