import { asc, and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { buildJobRows, type TemplateStep } from '../../../utils/publication/scheduling'
import { ensureChannelConfigs } from '../../../utils/publication/defaults'

/** POST /api/admin/scheduler/duplicate — Fase 4/10 ("duplicar programación"). Copies a schedule's channel sequence (same relative offsets) onto a new base time. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ scheduleId?: number; baseScheduledAt?: string; developerPropertyId?: number }>(event)
  const scheduleId = Number(body?.scheduleId)
  if (!scheduleId) throw createError({ statusCode: 422, statusMessage: 'scheduleId es obligatorio' })

  const db = useDb(event)
  const rows = await db.select().from(schema.publicationSchedules).where(and(eq(schema.publicationSchedules.id, scheduleId), eq(schema.publicationSchedules.organizationId, orgId))).limit(1)
  const source = rows[0]
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Programación no encontrada' })

  const jobs = await db.select().from(schema.publicationJobs).where(eq(schema.publicationJobs.scheduleId, scheduleId)).orderBy(asc(schema.publicationJobs.offsetMinutes))
  const newBase = body?.baseScheduledAt || now()

  // Uses the immutable `offsetMinutes` captured at creation, not the current
  // `runAt` — a retry backoff or manual reschedule may have shifted runAt
  // away from the original staged-launch design, and a duplicate should
  // reproduce that design, not whatever state the source happens to be in.
  const keyByJobId = new Map(jobs.map((j: any) => [j.id, j.channelKey]))
  const steps: TemplateStep[] = jobs.map((j: any) => ({
    channelKey: j.channelKey,
    offsetMinutes: j.offsetMinutes,
    priority: j.priority,
    action: j.action,
    dependsOnChannelKey: j.dependsOnJobId ? keyByJobId.get(j.dependsOnJobId) : undefined,
    condition: j.conditionJson ? JSON.parse(j.conditionJson) : null,
  }))

  await ensureChannelConfigs(db, orgId)
  const configRows = await db.select().from(schema.publicationChannelConfigs).where(eq(schema.publicationChannelConfigs.organizationId, orgId))
  const channelConfigByKey = Object.fromEntries(configRows.map((c: any) => [c.channelKey, c]))

  const nowTs = now()
  const developerPropertyId = body?.developerPropertyId || source.developerPropertyId
  const scheduleInsert = await db
    .insert(schema.publicationSchedules)
    .values({
      organizationId: orgId,
      developerPropertyId,
      templateId: source.templateId,
      name: source.name ? `${source.name} (copia)` : null,
      baseScheduledAt: newBase,
      timezone: source.timezone,
      status: 'scheduled',
      createdBy: user.id,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning({ id: schema.publicationSchedules.id })
  const newScheduleId = scheduleInsert[0].id

  const { rows: jobRows, jobsByChannel } = buildJobRows({ organizationId: orgId, scheduleId: newScheduleId, baseScheduledAt: newBase, steps, channelConfigByKey })
  const insertedIds: number[] = []
  for (const row of jobRows) {
    const { dependsOnChannelKeyRef, ...values } = row as any
    const inserted = await db.insert(schema.publicationJobs).values(values).returning({ id: schema.publicationJobs.id })
    insertedIds.push(inserted[0].id)
  }
  for (let i = 0; i < jobRows.length; i++) {
    const dep = (jobRows[i] as any).dependsOnChannelKeyRef as string | null
    if (dep && jobsByChannel[dep] !== undefined) {
      await db.update(schema.publicationJobs).set({ dependsOnJobId: insertedIds[jobsByChannel[dep]] }).where(eq(schema.publicationJobs.id, insertedIds[i]))
    }
  }

  await db.insert(schema.publicationHistory).values({ organizationId: orgId, scheduleId: newScheduleId, jobId: null, event: 'schedule_created', message: `Duplicada desde la programación #${scheduleId}.`, createdAt: nowTs })

  return { ok: true, id: newScheduleId }
})
