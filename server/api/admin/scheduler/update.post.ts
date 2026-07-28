import { and, eq, inArray } from 'drizzle-orm'
import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/**
 * POST /api/admin/scheduler/update — Fase 4 ("editar programación", "reprogramar").
 * Body: {scheduleId, name?, baseScheduledAt?}. When baseScheduledAt changes,
 * every non-terminal job shifts by the same delta so the staged-launch
 * offsets between channels stay intact.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const body = await readBody<{ scheduleId?: number; name?: string; baseScheduledAt?: string }>(event)
  const scheduleId = Number(body?.scheduleId)
  if (!scheduleId) throw createError({ statusCode: 422, statusMessage: 'scheduleId es obligatorio' })

  const db = useDb(event)
  const rows = await db.select().from(schema.publicationSchedules).where(and(eq(schema.publicationSchedules.id, scheduleId), eq(schema.publicationSchedules.organizationId, orgId))).limit(1)
  const schedule = rows[0]
  if (!schedule) throw createError({ statusCode: 404, statusMessage: 'Programación no encontrada' })
  if (['completed', 'cancelled'].includes(schedule.status)) throw createError({ statusCode: 422, statusMessage: `No se puede editar una programación en estado "${schedule.status}"` })

  const nowTs = now()
  const patch: Record<string, any> = { updatedAt: nowTs }
  if (body?.name !== undefined) patch.name = body.name

  if (body?.baseScheduledAt && body.baseScheduledAt !== schedule.baseScheduledAt) {
    const oldMs = new Date(schedule.baseScheduledAt.replace(' ', 'T') + 'Z').getTime()
    const newMs = new Date(body.baseScheduledAt.replace(' ', 'T') + 'Z').getTime()
    const deltaMs = newMs - oldMs
    patch.baseScheduledAt = body.baseScheduledAt

    const jobs = await db
      .select({ id: schema.publicationJobs.id, runAt: schema.publicationJobs.runAt })
      .from(schema.publicationJobs)
      .where(and(eq(schema.publicationJobs.scheduleId, scheduleId), inArray(schema.publicationJobs.status, ['pending', 'paused'])))
    for (const j of jobs) {
      const shifted = new Date(new Date(j.runAt.replace(' ', 'T') + 'Z').getTime() + deltaMs).toISOString().replace('T', ' ').slice(0, 19)
      await db.update(schema.publicationJobs).set({ runAt: shifted, updatedAt: nowTs }).where(eq(schema.publicationJobs.id, j.id))
    }
    await db.insert(schema.publicationHistory).values({ organizationId: orgId, scheduleId, jobId: null, event: 'schedule_rescheduled', message: `Reprogramada: ${jobs.length} job(s) desplazados.`, createdAt: nowTs })
  }

  await db.update(schema.publicationSchedules).set(patch).where(eq(schema.publicationSchedules.id, scheduleId))
  return { ok: true }
})
