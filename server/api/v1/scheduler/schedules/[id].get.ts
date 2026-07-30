import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'
import { requireApiKey } from '../../../../utils/apiAuth'
import { rateLimit } from '../../../../utils/rateLimit'

/** GET /api/v1/scheduler/schedules/:id — the schedule + every job's current status. Fase 16. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'read')
  await rateLimit(event, 'public-api', { limit: 120, windowSeconds: 60 })

  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const scheduleRows = await db.select().from(schema.publicationSchedules).where(and(eq(schema.publicationSchedules.id, id), eq(schema.publicationSchedules.organizationId, orgId))).limit(1)
  const schedule = scheduleRows[0]
  if (!schedule) throw createError({ statusCode: 404, statusMessage: 'Schedule not found' })

  const jobs = await db
    .select({
      id: schema.publicationJobs.id,
      channelKey: schema.publicationJobs.channelKey,
      runAt: schema.publicationJobs.runAt,
      status: schema.publicationJobs.status,
      action: schema.publicationJobs.action,
      retryCount: schema.publicationJobs.retryCount,
      lastError: schema.publicationJobs.lastError,
    })
    .from(schema.publicationJobs)
    .where(eq(schema.publicationJobs.scheduleId, id))

  return { data: { schedule, jobs } }
})
