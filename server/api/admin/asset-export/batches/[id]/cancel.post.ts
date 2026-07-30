import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, now } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'

/** Stops the client polling loop from processing further items and marks remaining pending items as cancelled. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const batchId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(batchId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const batch = (await db.select().from(schema.exportBatches).where(eq(schema.exportBatches.id, batchId)).limit(1))[0]
  if (!batch || batch.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Batch not found' })

  const nowTs = now()
  await db.update(schema.exportBatchItems).set({ status: 'cancelled', completedAt: nowTs }).where(and(eq(schema.exportBatchItems.batchId, batchId), eq(schema.exportBatchItems.status, 'pending')))
  await db.update(schema.exportBatches).set({ status: 'cancelled', completedAt: nowTs }).where(eq(schema.exportBatches.id, batchId))

  await logAdminAction(event, { user, orgId, action: 'pause', resource: 'asset-export-batch', resourceId: batchId })
  return { ok: true }
})
