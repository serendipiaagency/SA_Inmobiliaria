import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'

/** Resets failed items back to pending so the next process-next call retries them. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const batchId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(batchId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const batch = (await db.select().from(schema.exportBatches).where(eq(schema.exportBatches.id, batchId)).limit(1))[0]
  if (!batch || batch.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Batch not found' })

  await db
    .update(schema.exportBatchItems)
    .set({ status: 'pending', errorMessage: null, completedAt: null })
    .where(and(eq(schema.exportBatchItems.batchId, batchId), eq(schema.exportBatchItems.status, 'failed')))
  await db.update(schema.exportBatches).set({ status: 'running', failedCount: 0 }).where(eq(schema.exportBatches.id, batchId))

  await logAdminAction(event, { user, orgId, action: 'retry', resource: 'asset-export-batch', resourceId: batchId })
  return { ok: true }
})
