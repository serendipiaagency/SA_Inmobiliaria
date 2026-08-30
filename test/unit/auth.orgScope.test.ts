import { describe, expect, it } from 'vitest'
import { resolveActiveOrgId, type SessionUser } from '../../server/utils/auth'

/**
 * resolveActiveOrgId is the single choke point that decides which
 * organization's data a request can see. A bug here is a cross-tenant data
 * leak, not a cosmetic glitch — this is exactly the kind of thing task #91
 * ("tests automatizados, empezando por org-scoping") exists to protect.
 */

function fakeEvent(cookieHeader?: string) {
  return {
    node: {
      req: { headers: { cookie: cookieHeader ?? '' } },
      res: { getHeader: () => undefined, setHeader: () => {}, appendHeader: () => {} },
    },
  } as any
}

function admin(organizationId: number | null): SessionUser {
  return { id: 1, name: 'Admin', email: 'admin@example.com', role: 'admin', organizationId }
}

function superAdmin(): SessionUser {
  return { id: 2, name: 'Super', email: 'super@example.com', role: 'super_admin', organizationId: null }
}

describe('resolveActiveOrgId', () => {
  it('always returns the org-scoped admin own organizationId, ignoring any cookie', () => {
    const event = fakeEvent('sa_active_org=999')
    expect(resolveActiveOrgId(event, admin(1))).toBe(1)
  })

  it('a regular admin can never switch org via a client-supplied cookie', () => {
    // Same admin, same org, but with an attacker-supplied cookie pointing at
    // a different tenant. The cookie must be irrelevant for non-super_admin users.
    const event = fakeEvent('sa_active_org=7')
    expect(resolveActiveOrgId(event, admin(3))).toBe(3)
  })

  it('throws 403 if an org-scoped admin somehow has no organizationId', () => {
    const event = fakeEvent()
    expect(() => resolveActiveOrgId(event, admin(null))).toThrow()
  })

  it('super_admin without a cookie fails closed (403), never defaults to org 1', () => {
    const event = fakeEvent()
    expect(() => resolveActiveOrgId(event, superAdmin())).toThrow(/403|active organization/i)
  })

  it('super_admin can switch org via the cookie (their own explicit choice, not an escalation)', () => {
    const event = fakeEvent('sa_active_org=5')
    expect(resolveActiveOrgId(event, superAdmin())).toBe(5)
  })

  it('super_admin with a garbage/non-numeric cookie value fails closed instead of guessing org 1', () => {
    expect(() => resolveActiveOrgId(fakeEvent('sa_active_org=not-a-number'), superAdmin())).toThrow(/403|active organization/i)
  })

  it('super_admin with a negative or zero cookie value fails closed instead of guessing org 1', () => {
    expect(() => resolveActiveOrgId(fakeEvent('sa_active_org=-5'), superAdmin())).toThrow(/403|active organization/i)
    expect(() => resolveActiveOrgId(fakeEvent('sa_active_org=0'), superAdmin())).toThrow(/403|active organization/i)
  })
})
