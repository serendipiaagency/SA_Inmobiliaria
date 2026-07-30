import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const batch = (await db.select().from(schema.exportBatches).where(eq(schema.exportBatches.id, id)).limit(1))[0]
  if (!batch || batch.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Batch not found' })

  const items = await db
    .select({
      id: schema.exportBatchItems.id,
      assetId: schema.exportBatchItems.assetId,
      assetName: schema.developerProperties.name,
      status: schema.exportBatchItems.status,
      renderId: schema.exportBatchItems.renderId,
      errorMessage: schema.exportBatchItems.errorMessage,
    })
    .from(schema.exportBatchItems)
    .leftJoin(schema.developerProperties, eq(schema.developerProperties.id, schema.exportBatchItems.assetId))
    .where(eq(schema.exportBatchItems.batchId, id))
    .limit(200)

  return { ...batch, items }
})
