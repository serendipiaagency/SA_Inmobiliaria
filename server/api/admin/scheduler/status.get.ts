import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/** GET /api/admin/scheduler/status?scheduleId= — Fase 16. Full status snapshot: the schedule + every job's current state. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const scheduleId = Number(getQuery(event).scheduleId)
  if (!scheduleId) throw createError({ statusCode: 422, statusMessage: 'scheduleId es obligatorio' })

  const db = useDb(event)
  const scheduleRows = await db.select().from(schema.publicationSchedules).where(and(eq(schema.publicationSchedules.id, scheduleId), eq(schema.publicationSchedules.organizationId, orgId))).limit(1)
  const schedule = scheduleRows[0]
  if (!schedule) throw createError({ statusCode: 404, statusMessage: 'Programación no encontrada' })

  const jobs = await db.select().from(schema.publicationJobs).where(eq(schema.publicationJobs.scheduleId, scheduleId))
  return { schedule, jobs }
})
