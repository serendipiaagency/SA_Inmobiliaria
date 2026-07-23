import { and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { PRIORITIES, priorityWeight } from '../../../utils/publication/channels'

/** POST /api/admin/scheduler/priority — Fase 7/10. Body: {jobId, priority}. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const body = await readBody<{ jobId?: number; priority?: string }>(event)
  const jobId = Number(body?.jobId)
  if (!jobId || !PRIORITIES.includes(body?.priority as any)) throw createError({ statusCode: 422, statusMessage: `jobId y priority (${PRIORITIES.join('|')}) son obligatorios` })

  const db = useDb(event)
  const rows = await db.select({ id: schema.publicationJobs.id, scheduleId: schema.publicationJobs.scheduleId }).from(schema.publicationJobs).where(and(eq(schema.publicationJobs.id, jobId), eq(schema.publicationJobs.organizationId, orgId))).limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Job no encontrado' })

  const nowTs = now()
  await db.update(schema.publicationJobs).set({ priority: body!.priority, priorityWeight: priorityWeight(body!.priority), updatedAt: nowTs }).where(eq(schema.publicationJobs.id, jobId))
  await db.insert(schema.publicationHistory).values({ organizationId: orgId, scheduleId: rows[0].scheduleId, jobId, event: 'job_priority_changed', message: `Prioridad cambiada a "${body!.priority}".`, createdAt: nowTs })

  return { ok: true }
})
