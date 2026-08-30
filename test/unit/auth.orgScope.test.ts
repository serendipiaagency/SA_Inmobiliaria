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

/** Minimal `db.select().from().orderBy().limit()` stub, resolving to the given rows. */
function fakeDb(rows: { id: number }[]) {
  return {
    select: () => ({
      from: () => ({
        orderBy: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  }
}

describe('resolveActiveOrgId', () => {
  it('always returns the org-scoped admin own organizationId, ignoring any cookie', async () => {
    const event = fakeEvent('sa_active_org=999')
    expect(await resolveActiveOrgId(event, admin(1), fakeDb([]))).toBe(1)
  })

  it('a regular admin can never switch org via a client-supplied cookie', async () => {
    // Same admin, same org, but with an attacker-supplied cookie pointing at
    // a different tenant. The cookie must be irrelevant for non-super_admin users.
    const event = fakeEvent('sa_active_org=7')
    expect(await resolveActiveOrgId(event, admin(3), fakeDb([]))).toBe(3)
  })

  it('throws 403 if an org-scoped admin somehow has no organizationId', async () => {
    const event = fakeEvent()
    await expect(resolveActiveOrgId(event, admin(null), fakeDb([]))).rejects.toThrow()
  })

  it('super_admin without a cookie resolves the platform\'s own lowest-id organization, never a hardcoded one', async () => {
    const event = fakeEvent()
    expect(await resolveActiveOrgId(event, superAdmin(), fakeDb([{ id: 3 }]))).toBe(3)
  })

  it('super_admin can switch org via the cookie (their own explicit choice, not an escalation)', async () => {
    const event = fakeEvent('sa_active_org=5')
    // A DB that would answer "1" if queried — proves the cookie short-circuits the DB fallback.
    expect(await resolveActiveOrgId(event, superAdmin(), fakeDb([{ id: 1 }]))).toBe(5)
  })

  it('super_admin with a garbage/non-numeric cookie value falls back to the DB, not a hardcoded id', async () => {
    expect(await resolveActiveOrgId(fakeEvent('sa_active_org=not-a-number'), superAdmin(), fakeDb([{ id: 4 }]))).toBe(4)
  })

  it('super_admin with a negative or zero cookie value falls back to the DB, not a hardcoded id', async () => {
    expect(await resolveActiveOrgId(fakeEvent('sa_active_org=-5'), superAdmin(), fakeDb([{ id: 2 }]))).toBe(2)
    expect(await resolveActiveOrgId(fakeEvent('sa_active_org=0'), superAdmin(), fakeDb([{ id: 2 }]))).toBe(2)
  })

  it('super_admin fails closed (403) only when the platform has no organization at all', async () => {
    const event = fakeEvent()
    await expect(resolveActiveOrgId(event, superAdmin(), fakeDb([]))).rejects.toThrow(/403|no organization/i)
  })
})
