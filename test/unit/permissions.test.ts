import { describe, expect, it } from 'vitest'
import { allowedAreas, hasAnyWriteAccess, hasAreaAccess, parsePermissions, parsePermissionsConfig, validatePermissionsInput, ADMIN_AREAS } from '../../server/utils/permissions'
import { adminResources } from '../../server/utils/adminResources'

/**
 * Granular RBAC. `permissions: null` (every account that existed before this
 * feature, unconditionally) must behave exactly like before it existed:
 * unrestricted admin access. What changed in bloque 01 is the other two
 * states — an explicitly empty list and an unparseable value used to collapse
 * into "null" and therefore granted everything; they now deny. See
 * migrations/0061_normalize_user_permissions.sql for the compatible
 * transition that keeps existing rows on the "unrestricted" side of that
 * line.
 */

describe('parsePermissionsConfig', () => {
  it('treats an absent value as unrestricted', () => {
    expect(parsePermissionsConfig(null)).toEqual({ kind: 'unrestricted' })
    expect(parsePermissionsConfig(undefined)).toEqual({ kind: 'unrestricted' })
    expect(parsePermissionsConfig('')).toEqual({ kind: 'unrestricted' })
    expect(parsePermissionsConfig('   ')).toEqual({ kind: 'unrestricted' })
  })

  it('treats an explicitly empty list as restricted-to-nothing, NOT unrestricted', () => {
    expect(parsePermissionsConfig('[]')).toEqual({ kind: 'restricted', granted: new Set() })
  })

  it('treats an unparseable or non-array value as invalid configuration', () => {
    expect(parsePermissionsConfig('not json')).toEqual({ kind: 'invalid', reason: 'not-json' })
    expect(parsePermissionsConfig('["crm:read"')).toEqual({ kind: 'invalid', reason: 'not-json' })
    expect(parsePermissionsConfig('{"not":"an array"}')).toEqual({ kind: 'invalid', reason: 'not-an-array' })
    expect(parsePermissionsConfig('"crm:read"')).toEqual({ kind: 'invalid', reason: 'not-an-array' })
    expect(parsePermissionsConfig('42')).toEqual({ kind: 'invalid', reason: 'not-an-array' })
  })

  it('parses a real permissions array, dropping non-string entries', () => {
    expect(parsePermissionsConfig('["crm:read","finance:write",42,null]')).toEqual({
      kind: 'restricted',
      granted: new Set(['crm:read', 'finance:write']),
    })
  })
})

describe('parsePermissions', () => {
  it('returns null only for the unrestricted state', () => {
    expect(parsePermissions(null)).toBeNull()
    expect(parsePermissions(undefined)).toBeNull()
    expect(parsePermissions('')).toBeNull()
  })

  it('no longer returns null (unrestricted) for an empty list or malformed JSON — the bloque 01 fix', () => {
    expect(parsePermissions('[]')).toEqual(new Set())
    expect(parsePermissions('not json')).toEqual(new Set())
    expect(parsePermissions('{"not":"an array"}')).toEqual(new Set())
  })

  it('parses a real permissions array into a Set, dropping non-string entries', () => {
    expect(parsePermissions('["crm:read","finance:write",42,null]')).toEqual(new Set(['crm:read', 'finance:write']))
  })
})

describe('hasAreaAccess', () => {
  it('super_admin always passes, regardless of permissions', () => {
    expect(hasAreaAccess({ role: 'super_admin', permissions: '["crm:read"]' }, 'finance', 'write')).toBe(true)
    expect(hasAreaAccess({ role: 'super_admin', permissions: null }, 'system', 'write')).toBe(true)
    // Even a corrupted value cannot lock the platform owner out.
    expect(hasAreaAccess({ role: 'super_admin', permissions: 'not json' }, 'system', 'write')).toBe(true)
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

  it('an explicitly empty permissions list denies every area', () => {
    for (const a of ADMIN_AREAS) {
      expect(hasAreaAccess({ role: 'admin', permissions: '[]' }, a.key, 'read')).toBe(false)
      expect(hasAreaAccess({ role: 'admin', permissions: '[]' }, a.key, 'write')).toBe(false)
    }
  })

  it('an invalid permissions value denies every area instead of granting all of them', () => {
    for (const raw of ['not json', '{"crm":"read"}', '["crm:read"']) {
      for (const a of ADMIN_AREAS) {
        expect(hasAreaAccess({ role: 'admin', permissions: raw }, a.key, 'read'), `${raw} / ${a.key}`).toBe(false)
      }
    }
  })

  it('role: user (never an admin today) is not special-cased — always denied unless granted', () => {
    expect(hasAreaAccess({ role: 'user', permissions: null }, 'crm', 'read')).toBe(true) // unrestricted by absence, same rule as admin
    expect(hasAreaAccess({ role: 'user', permissions: '["crm:read"]' }, 'finance', 'read')).toBe(false)
  })
})

describe('hasAnyWriteAccess', () => {
  it('passes for super_admin and for unrestricted accounts', () => {
    expect(hasAnyWriteAccess({ role: 'super_admin', permissions: '[]' })).toBe(true)
    expect(hasAnyWriteAccess({ role: 'admin', permissions: null })).toBe(true)
  })

  it('passes with a single write grant anywhere, fails with read-only grants', () => {
    expect(hasAnyWriteAccess({ role: 'admin', permissions: '["cms:write"]' })).toBe(true)
    expect(hasAnyWriteAccess({ role: 'admin', permissions: '["crm:read","web:read"]' })).toBe(false)
  })

  it('fails for an empty or invalid configuration', () => {
    expect(hasAnyWriteAccess({ role: 'admin', permissions: '[]' })).toBe(false)
    expect(hasAnyWriteAccess({ role: 'admin', permissions: 'not json' })).toBe(false)
  })

  it('ignores grants for areas that do not exist', () => {
    expect(hasAnyWriteAccess({ role: 'admin', permissions: '["not-a-real-area:write"]' })).toBe(false)
  })
})

describe('validatePermissionsInput', () => {
  it('accepts the two deliberate states: unrestricted and "no areas"', () => {
    expect(validatePermissionsInput(null)).toBeNull()
    expect(validatePermissionsInput(undefined)).toBeNull()
    expect(validatePermissionsInput('')).toBeNull()
    expect(validatePermissionsInput('[]')).toBeNull()
  })

  it('accepts a well-formed grant list', () => {
    expect(validatePermissionsInput('["crm:read","cms:write","system:write"]')).toBeNull()
  })

  it('rejects values the checker could not parse — those would deny everything once stored', () => {
    expect(validatePermissionsInput('not json')).toMatch(/JSON válido/)
    expect(validatePermissionsInput('{"crm":"read"}')).toMatch(/array JSON/)
    expect(validatePermissionsInput(['crm:read'])).toMatch(/texto JSON/)
  })

  it('rejects entries that name an unknown area or action', () => {
    expect(validatePermissionsInput('["crm:delete"]')).toMatch(/Permiso desconocido/)
    expect(validatePermissionsInput('["not-a-real-area:read"]')).toMatch(/Permiso desconocido/)
    expect(validatePermissionsInput('["crm"]')).toMatch(/Permiso desconocido/)
    expect(validatePermissionsInput('[42]')).toMatch(/cadena/)
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
    expect(allowedAreas({ role: 'admin', permissions: '[]' })).toEqual([])
    expect(allowedAreas({ role: 'admin', permissions: 'not json' })).toEqual([])
  })
})

describe('adminResources area coverage', () => {
  it('every resource declares a valid area — a missing one would silently leave that resource unrestricted for every admin', () => {
    const validAreas = new Set(ADMIN_AREAS.map((a) => a.key))
    for (const [key, def] of Object.entries(adminResources)) {
      expect(def.area, `resource "${key}" has no area`).toBeTruthy()
      expect(validAreas.has(def.area as any), `resource "${key}" has an invalid area: ${def.area}`).toBe(true)
    }
  })
})
