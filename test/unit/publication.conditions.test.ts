import { describe, expect, it } from 'vitest'
import { evaluateCondition } from '../../server/utils/publication/conditions'

/** Minimal fake of the drizzle `db.select().from().where()` chain used by evaluateCondition. */
function fakeDb(imageCount: number) {
  return {
    select: () => ({
      from: () => ({
        where: async () => Array.from({ length: imageCount }, (_, i) => ({ id: i + 1 })),
      }),
    }),
  }
}

describe('evaluateCondition', () => {
  it('passes with no condition set', async () => {
    expect(await evaluateCondition(fakeDb(0), 1, null)).toEqual({ met: true })
  })

  it('passes through unparseable JSON rather than blocking the job', async () => {
    expect(await evaluateCondition(fakeDb(0), 1, '{not json')).toEqual({ met: true })
  })

  it('min_photos: blocks with a real reason when the property has fewer photos than required', async () => {
    const result = await evaluateCondition(fakeDb(5), 1, JSON.stringify({ type: 'min_photos', value: 15 }))
    expect(result.met).toBe(false)
    expect(result.reason).toContain('15')
    expect(result.reason).toContain('5')
  })

  it('min_photos: passes once the count meets the threshold', async () => {
    expect(await evaluateCondition(fakeDb(15), 1, JSON.stringify({ type: 'min_photos', value: 15 }))).toEqual({ met: true })
  })

  it('min_photos: passes when the count exceeds the threshold', async () => {
    expect((await evaluateCondition(fakeDb(20), 1, JSON.stringify({ type: 'min_photos', value: 15 }))).met).toBe(true)
  })

  it('unknown condition types pass rather than silently blocking forever', async () => {
    expect(await evaluateCondition(fakeDb(0), 1, JSON.stringify({ type: 'unknown_future_condition', value: 1 }))).toEqual({ met: true })
  })
})
