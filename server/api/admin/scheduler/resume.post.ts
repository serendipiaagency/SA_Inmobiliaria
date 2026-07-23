import { and, eq, inArray } from 'drizzle-orm'
import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/** POST /api/admin/scheduler/resume — Fase 7/16. Body: {jobId} or {scheduleId}. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const body = await readBody<{ jobId?: number; scheduleId?: number }>(event)
  const db = useDb(event)
  const nowTs = now()

  if (body?.jobId) {
    const rows = await db.select().from(schema.publicationJobs).where(and(eq(schema.publicationJobs.id, body.jobId), eq(schema.publicationJobs.organizationId, orgId))).limit(1)
    const job = rows[0]
    if (!job) throw createError({ statusCode: 404, statusMessage: 'Job no encontrado' })
    if (job.status !== 'paused') throw createError({ statusCode: 422, statusMessage: 'Solo se pueden reanudar jobs pausados' })
    await db.update(schema.publicationJobs).set({ status: 'pending', updatedAt: nowTs }).where(eq(schema.publicationJobs.id, job.id))
    await db.insert(schema.publicationHistory).values({ organizationId: orgId, scheduleId: job.scheduleId, jobId: job.id, event: 'job_resumed', message: 'Job reanudado manualmente.', createdAt: nowTs })
    return { ok: true, count: 1 }
  }

  if (body?.scheduleId) {
    const jobs = await db
      .select({ id: schema.publicationJobs.id })
      .from(schema.publicationJobs)
      .where(and(eq(schema.publicationJobs.scheduleId, body.scheduleId), eq(schema.publicationJobs.organizationId, orgId), eq(schema.publicationJobs.status, 'paused')))
    if (jobs.length) {
      await db
        .update(schema.publicationJobs)
        .set({ status: 'pending', updatedAt: nowTs })
        .where(inArray(schema.publicationJobs.id, jobs.map((j: any) => j.id)))
    }
    await db.insert(schema.publicationHistory).values({ organizationId: orgId, scheduleId: body.scheduleId, jobId: null, event: 'schedule_resumed', message: `Programación reanudada (${jobs.length} job(s)).`, createdAt: nowTs })
    return { ok: true, count: jobs.length }
  }

  throw createError({ statusCode: 422, statusMessage: 'jobId o scheduleId es obligatorio' })
})
