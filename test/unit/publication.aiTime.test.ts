import { describe, expect, it } from 'vitest'
import { maybeApplyAiTime } from '../../server/utils/publication/aiTime'

/** Fake `db.select().from().where().limit()` chain that returns queued results in call order. */
function fakeDb(results: any[][]) {
  const queue = [...results]
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => queue.shift() || [],
        }),
      }),
    }),
  }
}

function throwingDb() {
  return {
    select: () => {
      throw new Error('should not query the db when a time was given explicitly')
    },
  }
}

describe('maybeApplyAiTime', () => {
  it('never queries the db and leaves the time untouched when the caller gave one explicitly', async () => {
    const result = await maybeApplyAiTime(throwingDb(), 1, 1, 'own_web', '2026-08-01 10:00:00', true)
    expect(result).toEqual({ baseScheduledAt: '2026-08-01 10:00:00', applied: false })
  })

  it('leaves the time untouched when the org has no ai-time rule row', async () => {
    const db = fakeDb([[]])
    const result = await maybeApplyAiTime(db, 1, 1, 'own_web', '2026-08-01 10:00:00', false)
    expect(result).toEqual({ baseScheduledAt: '2026-08-01 10:00:00', applied: false })
  })

  it('leaves the time untouched when auto-apply is off', async () => {
    const db = fakeDb([[{ autoApply: 0, minConfidence: 0.6, minSampleSize: 5 }]])
    const result = await maybeApplyAiTime(db, 1, 1, 'own_web', '2026-08-01 10:00:00', false)
    expect(result.applied).toBe(false)
  })

  it('leaves the time untouched when the property has no propertyType on file', async () => {
    const db = fakeDb([[{ autoApply: 1, minConfidence: 0.6, minSampleSize: 5 }], [{ propertyType: null }]])
    const result = await maybeApplyAiTime(db, 1, 1, 'own_web', '2026-08-01 10:00:00', false)
    expect(result.applied).toBe(false)
  })

  it('leaves the time untouched when there is no suggestion for this channel/type yet', async () => {
    const db = fakeDb([[{ autoApply: 1, minConfidence: 0.6, minSampleSize: 5 }], [{ propertyType: 'apartment' }], []])
    const result = await maybeApplyAiTime(db, 1, 1, 'own_web', '2026-08-01 10:00:00', false)
    expect(result.applied).toBe(false)
  })

  it("does not apply a suggestion below the org's confidence bar", async () => {
    const db = fakeDb([
      [{ autoApply: 1, minConfidence: 0.6, minSampleSize: 5 }],
      [{ propertyType: 'apartment' }],
      [{ suggestedHour: 14, confidence: 0.4, sampleSize: 20 }],
    ])
    const result = await maybeApplyAiTime(db, 1, 1, 'own_web', '2026-08-01 10:00:00', false)
    expect(result.applied).toBe(false)
  })

  it("does not apply a suggestion below the org's sample-size bar", async () => {
    const db = fakeDb([
      [{ autoApply: 1, minConfidence: 0.6, minSampleSize: 5 }],
      [{ propertyType: 'apartment' }],
      [{ suggestedHour: 14, confidence: 0.9, sampleSize: 2 }],
    ])
    const result = await maybeApplyAiTime(db, 1, 1, 'own_web', '2026-08-01 10:00:00', false)
    expect(result.applied).toBe(false)
  })

  it('snaps to the suggested hour later the same day when it is still ahead of the requested time', async () => {
    const db = fakeDb([
      [{ autoApply: 1, minConfidence: 0.6, minSampleSize: 5 }],
      [{ propertyType: 'apartment' }],
      [{ suggestedHour: 14, confidence: 0.9, sampleSize: 20 }],
    ])
    const result = await maybeApplyAiTime(db, 1, 1, 'own_web', '2026-08-01 10:00:00', false)
    expect(result.applied).toBe(true)
    expect(result.suggestedHour).toBe(14)
    expect(result.baseScheduledAt).toBe('2026-08-01 14:00:00')
  })

  it('rolls over to the next day when the suggested hour has already passed for the requested time', async () => {
    const db = fakeDb([
      [{ autoApply: 1, minConfidence: 0.6, minSampleSize: 5 }],
      [{ propertyType: 'apartment' }],
      [{ suggestedHour: 8, confidence: 0.9, sampleSize: 20 }],
    ])
    const result = await maybeApplyAiTime(db, 1, 1, 'own_web', '2026-08-01 10:00:00', false)
    expect(result.applied).toBe(true)
    expect(result.baseScheduledAt).toBe('2026-08-02 08:00:00')
  })
})
