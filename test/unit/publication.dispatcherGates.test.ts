import { describe, expect, it } from 'vitest'
import { checkGates } from '../../server/utils/publication/dispatcher'

/**
 * Fake `db.select().from().where()[.limit()]` chain. `where()` returns a
 * thenable so it works both for evaluateCondition's direct `await
 * db...where(...)` and for the `.where().limit(1)` pattern used everywhere
 * else in checkGates — both real call shapes it needs to support.
 */
function fakeDb(resultQueue: any[][]) {
  const queue = [...resultQueue]
  const chain = (rows: any[]) => ({
    limit: async () => rows,
    then: (resolve: (v: any[]) => void) => resolve(rows),
  })
  return {
    select: () => ({
      from: () => ({
        where: () => chain(queue.shift() || []),
      }),
    }),
  }
}

const baseJob = { organizationId: 1, scheduleId: 10, channelKey: 'own_web', conditionJson: null, dependsOnJobId: null }
const nowDate = new Date('2026-01-01T12:00:00Z')

describe('checkGates', () => {
  it('blocks when the dependency job has not succeeded yet', async () => {
    const db = fakeDb([[{ status: 'pending' }]])
    const result = await checkGates(db, { ...baseJob, dependsOnJobId: 5 }, nowDate)
    expect(result).toEqual({ pass: false, reason: 'dependency_not_met' })
  })

  it('blocks when the dependency job is missing entirely', async () => {
    const db = fakeDb([[]])
    const result = await checkGates(db, { ...baseJob, dependsOnJobId: 5 }, nowDate)
    expect(result).toEqual({ pass: false, reason: 'dependency_not_met' })
  })

  it('blocks when the schedule no longer exists', async () => {
    const db = fakeDb([[]])
    const result = await checkGates(db, baseJob, nowDate)
    expect(result).toEqual({ pass: false, reason: 'schedule_not_found' })
  })

  it('blocks with the real reason when a min_photos condition is not met', async () => {
    const db = fakeDb([[{ id: 10, developerPropertyId: 1, timezone: 'UTC' }], Array.from({ length: 5 }, (_, i) => ({ id: i }))])
    const job = { ...baseJob, conditionJson: JSON.stringify({ type: 'min_photos', value: 15 }) }
    const result = await checkGates(db, job, nowDate)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('condition_not_met')
    expect(result.reason).toContain('15')
  })

  it('blocks when the channel is disabled for this org', async () => {
    const db = fakeDb([[{ id: 10, developerPropertyId: 1, timezone: 'UTC' }], [{ enabled: 0, windowStart: null, windowEnd: null }]])
    const result = await checkGates(db, baseJob, nowDate)
    expect(result.pass).toBe(false)
    expect(result.reason).toBe('channel_disabled')
  })

  it('blocks outside the configured publishing window', async () => {
    const db = fakeDb([[{ id: 10, developerPropertyId: 1, timezone: 'UTC' }], [{ enabled: 1, windowStart: '09:00', windowEnd: '17:00' }]])
    const outsideWindow = new Date('2026-01-01T20:00:00Z')
    const result = await checkGates(db, baseJob, outsideWindow)
    expect(result.pass).toBe(false)
    expect(result.reason).toBe('outside_window')
  })

  it('passes when there is no dependency, condition, or config to block it', async () => {
    const db = fakeDb([[{ id: 10, developerPropertyId: 1, timezone: 'UTC' }], []])
    const result = await checkGates(db, baseJob, nowDate)
    expect(result.pass).toBe(true)
  })

  it('passes when inside the configured publishing window', async () => {
    const db = fakeDb([[{ id: 10, developerPropertyId: 1, timezone: 'UTC' }], [{ enabled: 1, windowStart: '09:00', windowEnd: '17:00' }]])
    const insideWindow = new Date('2026-01-01T12:00:00Z')
    const result = await checkGates(db, baseJob, insideWindow)
    expect(result.pass).toBe(true)
  })
})
