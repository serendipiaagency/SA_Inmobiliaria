import { and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { CHANNEL_BY_KEY } from '../../../utils/publication/channels'

/** POST /api/admin/scheduler/retry — Fase 7/12/16. Manually resets a failed job for another attempt, resetting its retry budget so it gets a fresh set of automatic retries too. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const body = await readBody<{ jobId?: number }>(event)
  const jobId = Number(body?.jobId)
  if (!jobId) throw createError({ statusCode: 422, statusMessage: 'jobId es obligatorio' })

  const db = useDb(event)
  const rows = await db.select().from(schema.publicationJobs).where(and(eq(schema.publicationJobs.id, jobId), eq(schema.publicationJobs.organizationId, orgId))).limit(1)
  const job = rows[0]
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job no encontrado' })
  if (job.status !== 'failed') throw createError({ statusCode: 422, statusMessage: 'Solo se pueden reintentar jobs en estado "failed"' })

  const nowTs = now()
  await db.update(schema.publicationJobs).set({ status: 'pending', runAt: nowTs, retryCount: 0, lastError: null, updatedAt: nowTs }).where(eq(schema.publicationJobs.id, jobId))
  await db.insert(schema.publicationHistory).values({
    organizationId: orgId,
    scheduleId: job.scheduleId,
    jobId,
    event: 'job_manual_retry',
    message: `Reintento manual solicitado para ${CHANNEL_BY_KEY[job.channelKey]?.label || job.channelKey}.`,
    createdAt: nowTs,
  })

  return { ok: true }
})
