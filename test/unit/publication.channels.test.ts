import { describe, expect, it } from 'vitest'
import { CHANNELS, isValidChannelKey, priorityWeight } from '../../server/utils/publication/channels'

describe('channels registry', () => {
  it('has no duplicate keys (the registry is the single source of truth everywhere else keys it)', () => {
    const keys = CHANNELS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every channel names a distinct secret env var', () => {
    const vars = CHANNELS.map((c) => c.secretEnvVar)
    expect(new Set(vars).size).toBe(vars.length)
  })

  it('isValidChannelKey rejects keys not in the registry', () => {
    expect(isValidChannelKey('idealista')).toBe(true)
    expect(isValidChannelKey('not_a_real_channel')).toBe(false)
  })
})

describe('priorityWeight', () => {
  it('orders urgent < high < normal < low (lower weight dispatches first)', () => {
    expect(priorityWeight('urgent')).toBeLessThan(priorityWeight('high'))
    expect(priorityWeight('high')).toBeLessThan(priorityWeight('normal'))
    expect(priorityWeight('normal')).toBeLessThan(priorityWeight('low'))
  })

  it('defaults to normal for missing/unknown priority', () => {
    expect(priorityWeight(undefined)).toBe(priorityWeight('normal'))
    expect(priorityWeight(null)).toBe(priorityWeight('normal'))
    expect(priorityWeight('not_a_real_priority')).toBe(priorityWeight('normal'))
  })
})
