import { and, eq, inArray } from 'drizzle-orm'
import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/** POST /api/admin/scheduler/pause — Fase 7/16. Body: {jobId} or {scheduleId}. Pausing a job just moves it out of the dispatcher's 'pending' pool — nothing extra to build, resume flips it right back. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const body = await readBody<{ jobId?: number; scheduleId?: number }>(event)
  const db = useDb(event)
  const nowTs = now()

  if (body?.jobId) {
    const rows = await db.select().from(schema.publicationJobs).where(and(eq(schema.publicationJobs.id, body.jobId), eq(schema.publicationJobs.organizationId, orgId))).limit(1)
    const job = rows[0]
    if (!job) throw createError({ statusCode: 404, statusMessage: 'Job no encontrado' })
    if (!['pending', 'retrying'].includes(job.status)) throw createError({ statusCode: 422, statusMessage: `No se puede pausar un job en estado "${job.status}"` })
    await db.update(schema.publicationJobs).set({ status: 'paused', updatedAt: nowTs }).where(eq(schema.publicationJobs.id, job.id))
    await db.insert(schema.publicationHistory).values({ organizationId: orgId, scheduleId: job.scheduleId, jobId: job.id, event: 'job_paused', message: 'Job pausado manualmente.', createdAt: nowTs })
    return { ok: true, count: 1 }
  }

  if (body?.scheduleId) {
    const jobs = await db
      .select({ id: schema.publicationJobs.id })
      .from(schema.publicationJobs)
      .where(and(eq(schema.publicationJobs.scheduleId, body.scheduleId), eq(schema.publicationJobs.organizationId, orgId), inArray(schema.publicationJobs.status, ['pending', 'retrying'])))
    if (jobs.length) {
      await db
        .update(schema.publicationJobs)
        .set({ status: 'paused', updatedAt: nowTs })
        .where(inArray(schema.publicationJobs.id, jobs.map((j: any) => j.id)))
    }
    await db.insert(schema.publicationHistory).values({ organizationId: orgId, scheduleId: body.scheduleId, jobId: null, event: 'schedule_paused', message: `Programación pausada (${jobs.length} job(s)).`, createdAt: nowTs })
    return { ok: true, count: jobs.length }
  }

  throw createError({ statusCode: 422, statusMessage: 'jobId o scheduleId es obligatorio' })
})
