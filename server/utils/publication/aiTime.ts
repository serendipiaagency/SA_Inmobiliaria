import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'

/**
 * Computes, per (org, channel, property type), the hour-of-day that
 * historically has the highest successful-publication rate — from real
 * publication_executions joined through jobs → schedules → properties.
 * Not a guess or a fixed "10am is best" rule: with the sparse data this
 * project has today it will honestly report low confidence/small samples,
 * which is exactly what those two columns exist to say (Fase 12,
 * "hora recomendada por IA" — the schema already had confidence/sample_size,
 * nothing before this computed them).
 */
export async function computeAiTimeSuggestions(db: any, orgId: number): Promise<number> {
  const rows = await db
    .select({
      channelKey: schema.publicationJobs.channelKey,
      propertyType: schema.developerProperties.propertyType,
      startedAt: schema.publicationExecutions.startedAt,
      result: schema.publicationExecutions.result,
    })
    .from(schema.publicationExecutions)
    .innerJoin(schema.publicationJobs, eq(schema.publicationJobs.id, schema.publicationExecutions.jobId))
    .innerJoin(schema.publicationSchedules, eq(schema.publicationSchedules.id, schema.publicationJobs.scheduleId))
    .innerJoin(schema.developerProperties, eq(schema.developerProperties.id, schema.publicationSchedules.developerPropertyId))
    .where(eq(schema.publicationJobs.organizationId, orgId))

  // Group by (channel, propertyType) -> hour -> {success, total}
  const groups = new Map<string, Map<number, { success: number; total: number }>>()
  for (const r of rows) {
    if (!r.propertyType) continue
    const key = `${r.channelKey}::${r.propertyType}`
    const hour = new Date(String(r.startedAt).replace(' ', 'T') + 'Z').getUTCHours()
    if (!groups.has(key)) groups.set(key, new Map())
    const hours = groups.get(key)!
    if (!hours.has(hour)) hours.set(hour, { success: 0, total: 0 })
    const bucket = hours.get(hour)!
    bucket.total++
    if (r.result === 'success') bucket.success++
  }

  const nowTs = now()
  let written = 0
  for (const [key, hours] of groups) {
    const [channelKey, propertyType] = key.split('::')
    let bestHour = -1
    let bestRate = -1
    let bestSample = 0
    for (const [hour, { success, total }] of hours) {
      const rate = success / total
      if (rate > bestRate || (rate === bestRate && total > bestSample)) {
        bestHour = hour
        bestRate = rate
        bestSample = total
      }
    }
    if (bestHour < 0) continue

    const existing = await db
      .select({ id: schema.publicationAiTimeSuggestions.id })
      .from(schema.publicationAiTimeSuggestions)
      .where(
        and(
          eq(schema.publicationAiTimeSuggestions.organizationId, orgId),
          eq(schema.publicationAiTimeSuggestions.channelKey, channelKey),
          eq(schema.publicationAiTimeSuggestions.propertyType, propertyType),
        ),
      )
      .limit(1)

    const values = { suggestedHour: bestHour, confidence: Math.round(bestRate * 100) / 100, sampleSize: bestSample, computedAt: nowTs }
    if (existing[0]) {
      await db.update(schema.publicationAiTimeSuggestions).set(values).where(eq(schema.publicationAiTimeSuggestions.id, existing[0].id))
    } else {
      await db.insert(schema.publicationAiTimeSuggestions).values({ organizationId: orgId, channelKey, propertyType, ...values })
    }
    written++
  }
  return written
}
