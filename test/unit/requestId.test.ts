import { describe, expect, it } from 'vitest'
import { getRequestId } from '../../server/utils/requestId'

/**
 * error_logs and webhook_deliveries had no shared thread linking rows back
 * to the request that produced them (docs/production-hardening-audit.md,
 * P1-12). getRequestId() reuses Cloudflare's own cf-ray header (unique per
 * request at the edge, free) with a fallback for contexts where it's
 * absent (local dev, tests), cached on event.context so repeated calls
 * within one request agree.
 */

function fakeEvent(headers: Record<string, string> = {}) {
  return {
    context: {},
    node: {
      req: { headers },
      res: { getHeader: () => undefined, setHeader: () => {}, appendHeader: () => {} },
    },
  } as any
}

describe('getRequestId', () => {
  it('reuses the cf-ray header when Cloudflare provides one', () => {
    const event = fakeEvent({ 'cf-ray': '89abc1234-DFW' })
    expect(getRequestId(event)).toBe('89abc1234-DFW')
  })

  it('generates a fallback id when cf-ray is absent (local dev, tests)', () => {
    const event = fakeEvent()
    const id = getRequestId(event)
    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })

  it('caches the id on event.context — repeated calls within the same request return the same value', () => {
    const event = fakeEvent()
    const first = getRequestId(event)
    const second = getRequestId(event)
    expect(second).toBe(first)
  })

  it('two different requests with no cf-ray get two different fallback ids', () => {
    const idA = getRequestId(fakeEvent())
    const idB = getRequestId(fakeEvent())
    expect(idA).not.toBe(idB)
  })
})
