import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { isValidChannelKey } from '../../../utils/publication/channels'
import { buildJobRows, type TemplateStep } from '../../../utils/publication/scheduling'
import { ensureChannelConfigs } from '../../../utils/publication/defaults'

/**
 * POST /api/admin/scheduler/create — Fase 4/5/16.
 * Body: { developerPropertyId, baseScheduledAt, timezone?, name?, templateId? }
 * plus either `templateId` (steps come from the template) or an explicit
 * `steps` array (drag&drop staged-launch editor): [{channelKey, offsetMinutes, priority?, action?, dependsOnChannelKey?, condition?}]
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const body = await readBody<Record<string, any>>(event)

  const developerPropertyId = Number(body?.developerPropertyId)
  if (!developerPropertyId) throw createError({ statusCode: 422, statusMessage: 'developerPropertyId es obligatorio' })
  const propertyRows = await db
    .select({ id: schema.developerProperties.id })
    .from(schema.developerProperties)
    .where(eq(schema.developerProperties.id, developerPropertyId))
    .limit(1)
  if (!propertyRows[0]) throw createError({ statusCode: 404, statusMessage: 'Propiedad no encontrada' })

  const baseScheduledAt = String(body?.baseScheduledAt || now())

  let steps: TemplateStep[] = []
  let templateId: number | null = null
  if (body?.templateId) {
    const tRows = await db.select().from(schema.publicationTemplates).where(eq(schema.publicationTemplates.id, Number(body.templateId))).limit(1)
    if (!tRows[0] || tRows[0].organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Plantilla no encontrada' })
    templateId = tRows[0].id
    try {
      steps = JSON.parse(tRows[0].stepsJson || '[]')
    } catch {
      steps = []
    }
  } else if (Array.isArray(body?.steps)) {
    steps = body.steps
  }

  steps = steps.filter((s) => isValidChannelKey(s.channelKey))
  if (!steps.length) throw createError({ statusCode: 422, statusMessage: 'Debes indicar al menos un canal (steps o templateId)' })

  await ensureChannelConfigs(db, orgId)
  const configRows = await db.select().from(schema.publicationChannelConfigs).where(eq(schema.publicationChannelConfigs.organizationId, orgId))
  const channelConfigByKey = Object.fromEntries(configRows.map((c: any) => [c.channelKey, c]))

  const nowTs = now()
  const scheduleInsert = await db
    .insert(schema.publicationSchedules)
    .values({
      organizationId: orgId,
      developerPropertyId,
      templateId,
      name: body?.name || null,
      baseScheduledAt,
      timezone: body?.timezone || 'Asia/Dubai',
      status: 'scheduled',
      createdBy: user.id,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning({ id: schema.publicationSchedules.id })
  const scheduleId = scheduleInsert[0].id

  const { rows, jobsByChannel } = buildJobRows({ organizationId: orgId, scheduleId, baseScheduledAt, steps, channelConfigByKey })

  // Insert without the not-yet-resolvable dependsOnChannelKeyRef, then link
  // dependencies by real job id in a second pass (SQLite has no "insert and
  // reference a sibling row's id" in one statement).
  const insertedIds: number[] = []
  for (const row of rows) {
    const { dependsOnChannelKeyRef, ...values } = row as any
    const inserted = await db.insert(schema.publicationJobs).values(values).returning({ id: schema.publicationJobs.id })
    insertedIds.push(inserted[0].id)
  }
  for (let i = 0; i < rows.length; i++) {
    const dep = (rows[i] as any).dependsOnChannelKeyRef as string | null
    if (dep && jobsByChannel[dep] !== undefined) {
      await db.update(schema.publicationJobs).set({ dependsOnJobId: insertedIds[jobsByChannel[dep]] }).where(eq(schema.publicationJobs.id, insertedIds[i]))
    }
  }

  await db.insert(schema.publicationHistory).values({
    organizationId: orgId,
    scheduleId,
    jobId: null,
    event: 'schedule_created',
    message: `Programación creada con ${steps.length} canal(es).`,
    createdAt: nowTs,
  })

  return { ok: true, id: scheduleId, jobIds: insertedIds }
})
