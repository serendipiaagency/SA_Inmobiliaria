import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'
import { ensureChannelConfigs } from './defaults'
import { buildJobRows, type TemplateStep } from './scheduling'

export type AutomationTrigger = 'price_drop' | 'status_change'
export type AutomationAction = 'update_all' | 'update_images' | 'update_text' | 'unpublish'

/**
 * Fires every enabled rule matching `trigger` for this org: for each one,
 * creates a small schedule (base = now) with one job per enabled channel,
 * using `action` — a real re-sync ripple across whatever channels are
 * configured, not a stub. Called from the developer-properties PUT handler
 * right after a price/status change is persisted (Fase 11).
 */
export async function fireAutomationRules(db: any, orgId: number, developerPropertyId: number, trigger: AutomationTrigger, context: string): Promise<number> {
  const rules = await db
    .select()
    .from(schema.publicationAutomationRules)
    .where(and(eq(schema.publicationAutomationRules.organizationId, orgId), eq(schema.publicationAutomationRules.triggerType, trigger), eq(schema.publicationAutomationRules.enabled, 1)))
  if (!rules.length) return 0

  await ensureChannelConfigs(db, orgId)
  const configRows = await db.select().from(schema.publicationChannelConfigs).where(and(eq(schema.publicationChannelConfigs.organizationId, orgId), eq(schema.publicationChannelConfigs.enabled, 1)))
  if (!configRows.length) return 0
  const channelConfigByKey = Object.fromEntries(configRows.map((c: any) => [c.channelKey, c]))

  const nowTs = now()
  let created = 0
  for (const rule of rules) {
    const steps: TemplateStep[] = configRows.map((c: any) => ({ channelKey: c.channelKey, offsetMinutes: 0, priority: 'high', action: rule.actionType }))
    const scheduleInsert = await db
      .insert(schema.publicationSchedules)
      .values({
        organizationId: orgId,
        developerPropertyId,
        templateId: null,
        name: `Automatización: ${rule.name}`,
        baseScheduledAt: nowTs,
        timezone: 'UTC',
        status: 'scheduled',
        createdBy: null,
        createdAt: nowTs,
        updatedAt: nowTs,
      })
      .returning({ id: schema.publicationSchedules.id })
    const scheduleId = scheduleInsert[0].id

    const { rows } = buildJobRows({ organizationId: orgId, scheduleId, baseScheduledAt: nowTs, steps, channelConfigByKey })
    for (const row of rows) {
      const { dependsOnChannelKeyRef, ...values } = row as any
      await db.insert(schema.publicationJobs).values(values)
    }
    await db.insert(schema.publicationHistory).values({
      organizationId: orgId,
      scheduleId,
      jobId: null,
      event: 'schedule_created',
      message: `Creada automáticamente por la regla "${rule.name}" (${context}).`,
      createdAt: nowTs,
    })
    created++
  }
  return created
}
