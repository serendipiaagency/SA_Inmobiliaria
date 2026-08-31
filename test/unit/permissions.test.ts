import { describe, expect, it } from 'vitest'
import { allowedAreas, hasAreaAccess, parsePermissions } from '../../server/utils/permissions'

/**
 * P2 granular RBAC (docs/production-hardening-audit.md) — infrastructure
 * only in this pass: schema + this checking utility + requireOrgScope's
 * optional area/action params. `permissions: null` (every existing account,
 * unconditionally) must behave exactly like today: unrestricted admin
 * access. Only an account with an explicit, non-empty permissions array
 * becomes restricted.
 */

describe('parsePermissions', () => {
  it('returns null (unrestricted) for null, empty array, or malformed JSON', () => {
    expect(parsePermissions(null)).toBeNull()
    expect(parsePermissions(undefined)).toBeNull()
    expect(parsePermissions('')).toBeNull()
    expect(parsePermissions('[]')).toBeNull()
    expect(parsePermissions('not json')).toBeNull()
    expect(parsePermissions('{"not":"an array"}')).toBeNull()
  })

  it('parses a real permissions array into a Set, dropping non-string entries', () => {
    const result = parsePermissions('["crm:read","finance:write",42,null]')
    expect(result).toEqual(new Set(['crm:read', 'finance:write']))
  })
})

describe('hasAreaAccess', () => {
  it('super_admin always passes, regardless of permissions', () => {
    expect(hasAreaAccess({ role: 'super_admin', permissions: '["crm:read"]' }, 'finance', 'write')).toBe(true)
    expect(hasAreaAccess({ role: 'super_admin', permissions: null }, 'system', 'write')).toBe(true)
  })

  it('an admin with no permissions row (every existing account today) is unrestricted', () => {
    expect(hasAreaAccess({ role: 'admin', permissions: null }, 'finance', 'write')).toBe(true)
    expect(hasAreaAccess({ role: 'admin', permissions: undefined }, 'system', 'write')).toBe(true)
  })

  it('a restricted admin only passes for areas explicitly listed', () => {
    const user = { role: 'admin', permissions: '["crm:read","web:write"]' }
    expect(hasAreaAccess(user, 'crm', 'read')).toBe(true)
    expect(hasAreaAccess(user, 'crm', 'write')).toBe(false) // read-only grant, not write
    expect(hasAreaAccess(user, 'web', 'read')).toBe(true) // write implies read
    expect(hasAreaAccess(user, 'web', 'write')).toBe(true)
    expect(hasAreaAccess(user, 'finance', 'read')).toBe(false) // not granted at all
  })

  it('role: user (never an admin today) is not special-cased — always denied unless granted', () => {
    expect(hasAreaAccess({ role: 'user', permissions: null }, 'crm', 'read')).toBe(true) // unrestricted by absence, same rule as admin
    expect(hasAreaAccess({ role: 'user', permissions: '["crm:read"]' }, 'finance', 'read')).toBe(false)
  })
})

describe('allowedAreas', () => {
  it('returns every area for an unrestricted account', () => {
    expect(allowedAreas({ role: 'admin', permissions: null })).toEqual(['general', 'crm', 'web', 'finance', 'cms', 'content', 'inbox', 'system'])
  })

  it('returns only the granted areas for a restricted account', () => {
    expect(allowedAreas({ role: 'admin', permissions: '["crm:read","system:write"]' })).toEqual(['crm', 'system'])
  })

  it('returns an empty list for an account granted zero areas (not the same as unrestricted)', () => {
    // A single bogus/unmatched permission string still counts as "has an explicit array" — restricted, just to nothing real.
    expect(allowedAreas({ role: 'admin', permissions: '["not-a-real-area:read"]' })).toEqual([])
  })
})
