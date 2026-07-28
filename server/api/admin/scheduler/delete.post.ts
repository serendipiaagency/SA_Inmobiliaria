import { and, eq, inArray } from 'drizzle-orm'
import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/** POST /api/admin/scheduler/delete — Fase 4/16 ("cancelar programación"). Cancels the schedule and every non-terminal job in it; keeps history/executions for audit rather than hard-deleting. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const body = await readBody<{ scheduleId?: number }>(event)
  const scheduleId = Number(body?.scheduleId)
  if (!scheduleId) throw createError({ statusCode: 422, statusMessage: 'scheduleId es obligatorio' })

  const db = useDb(event)
  const rows = await db.select().from(schema.publicationSchedules).where(and(eq(schema.publicationSchedules.id, scheduleId), eq(schema.publicationSchedules.organizationId, orgId))).limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Programación no encontrada' })
  if (['completed', 'cancelled'].includes(rows[0].status)) throw createError({ statusCode: 422, statusMessage: `Ya está en estado "${rows[0].status}"` })

  const nowTs = now()
  const openJobs = await db
    .select({ id: schema.publicationJobs.id })
    .from(schema.publicationJobs)
    .where(and(eq(schema.publicationJobs.scheduleId, scheduleId), inArray(schema.publicationJobs.status, ['pending', 'paused', 'retrying', 'running'])))
  if (openJobs.length) {
    await db
      .update(schema.publicationJobs)
      .set({ status: 'cancelled', updatedAt: nowTs })
      .where(inArray(schema.publicationJobs.id, openJobs.map((j: any) => j.id)))
  }
  await db.update(schema.publicationSchedules).set({ status: 'cancelled', updatedAt: nowTs }).where(eq(schema.publicationSchedules.id, scheduleId))
  await db.insert(schema.publicationHistory).values({ organizationId: orgId, scheduleId, jobId: null, event: 'schedule_cancelled', message: `Programación cancelada (${openJobs.length} job(s) cancelados).`, createdAt: nowTs })

  return { ok: true, cancelledJobs: openJobs.length }
})
