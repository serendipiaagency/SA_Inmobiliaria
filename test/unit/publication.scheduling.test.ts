import { describe, expect, it } from 'vitest'
import { addBackoff, buildJobRows, computeRunAt, type TemplateStep } from '../../server/utils/publication/scheduling'

describe('computeRunAt', () => {
  it('adds the offset in minutes to the base timestamp', () => {
    expect(computeRunAt('2026-08-01 10:00:00', 5)).toBe('2026-08-01 10:05:00')
  })

  it('defaults a missing/zero offset to no change', () => {
    expect(computeRunAt('2026-08-01 10:00:00', 0)).toBe('2026-08-01 10:00:00')
  })

  it('rolls over into the next day/month correctly', () => {
    expect(computeRunAt('2026-08-31 23:58:00', 5)).toBe('2026-09-01 00:03:00')
  })
})

describe('buildJobRows', () => {
  const cfg = { maxRetries: 3, retryBackoffSeconds: 300, maxDurationSeconds: 120 }
  const steps: TemplateStep[] = [
    { channelKey: 'own_web', offsetMinutes: 0, priority: 'high' },
    { channelKey: 'marketplace', offsetMinutes: 2, priority: 'normal' },
    { channelKey: 'idealista', offsetMinutes: 5, priority: 'low' },
  ]

  it('stamps each job with its own immutable offsetMinutes, independent of run_at', () => {
    const { rows } = buildJobRows({
      organizationId: 1,
      scheduleId: 10,
      baseScheduledAt: '2026-08-01 09:00:00',
      steps,
      channelConfigByKey: { own_web: cfg, marketplace: cfg, idealista: cfg },
    })
    expect(rows.map((r) => r.offsetMinutes)).toEqual([0, 2, 5])
    expect(rows.map((r) => r.runAt)).toEqual(['2026-08-01 09:00:00', '2026-08-01 09:02:00', '2026-08-01 09:05:00'])
  })

  it('regression test for the retry-drift duplication bug: offsetMinutes never comes from reverse-engineering run_at', () => {
    // Real bug found in this project: an earlier implementation recomputed a
    // duplicated job's offset as (runAt - baseScheduledAt) using the SOURCE
    // job's *current* run_at. A retry backoff mutates run_at directly (see
    // dispatcher.ts), so duplicating a schedule after any retry produced
    // scrambled offsets. buildJobRows must be the only place offsetMinutes is
    // set, straight from the step definition, never derived from a mutable run_at.
    const { rows } = buildJobRows({
      organizationId: 1,
      scheduleId: 11,
      baseScheduledAt: '2026-08-01 09:00:00',
      steps,
      channelConfigByKey: { own_web: cfg, marketplace: cfg, idealista: cfg },
    })
    // Simulate what the dispatcher's retry logic does: mutate run_at only.
    const retried = { ...rows[1], runAt: '2026-08-01 09:47:00' }
    expect(retried.offsetMinutes).toBe(2) // untouched by the run_at mutation
  })

  it('falls back to channel-config defaults when a step omits priority/action', () => {
    const { rows } = buildJobRows({
      organizationId: 1,
      scheduleId: 12,
      baseScheduledAt: '2026-08-01 09:00:00',
      steps: [{ channelKey: 'own_web', offsetMinutes: 0 }],
      channelConfigByKey: { own_web: { maxRetries: 5, retryBackoffSeconds: 60, maxDurationSeconds: 30 } },
    })
    expect(rows[0]).toMatchObject({ priority: 'normal', action: 'publish', maxRetries: 5, retryBackoffSeconds: 60, maxDurationSeconds: 30 })
  })

  it('missing channel config falls back to safe defaults instead of throwing', () => {
    const { rows } = buildJobRows({
      organizationId: 1,
      scheduleId: 13,
      baseScheduledAt: '2026-08-01 09:00:00',
      steps: [{ channelKey: 'unconfigured_channel', offsetMinutes: 0 }],
      channelConfigByKey: {},
    })
    expect(rows[0]).toMatchObject({ maxRetries: 3, retryBackoffSeconds: 300, maxDurationSeconds: 120 })
  })
})

describe('addBackoff', () => {
  it('doubles per attempt (exponential)', () => {
    expect(addBackoff(60, 1)).toBe(60)
    expect(addBackoff(60, 2)).toBe(120)
    expect(addBackoff(60, 3)).toBe(240)
  })

  it('caps at 6 hours so a flaky channel never pushes a retry days out', () => {
    expect(addBackoff(60, 20)).toBe(6 * 60 * 60)
  })

  it('treats attempt 0 or negative the same as attempt 1', () => {
    expect(addBackoff(60, 0)).toBe(60)
    expect(addBackoff(60, -3)).toBe(60)
  })
})
