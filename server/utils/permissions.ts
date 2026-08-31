import { ADMIN_AREAS, type AdminArea } from '../../utils/adminAreas'
import type { SessionUser } from './auth'

export type { AdminArea }
export { ADMIN_AREAS }

/**
 * Granular per-admin permissions (P2, docs/production-hardening-audit.md).
 * Until now `role: 'admin'` meant unconditional full access to everything
 * in the org's panel — there was no way to give one admin (e.g. a
 * comercial) access to just CRM/Portal Web without also handing them
 * Facturación or Usuarios. `users.permissions` (migration 0058) is a
 * nullable JSON array of "<area>:<action>" strings; NULL/empty means
 * unrestricted (today's behavior, unchanged for every existing account) —
 * only an admin whose row gets an explicit array becomes restricted.
 */

export type PermissionAction = 'read' | 'write'

/** null return = unrestricted (no row, empty array, or unparseable — fails open to "unrestricted" rather than locking an admin out over a data glitch, since a parse failure here is a data-integrity bug, not an access decision). */
export function parsePermissions(raw: string | null | undefined): Set<string> | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr) || !arr.length) return null
    return new Set(arr.filter((v) => typeof v === 'string'))
  } catch {
    return null
  }
}

/**
 * super_admin always passes, regardless of `permissions` — same as every
 * other role check in server/utils/auth.ts. Otherwise: no permissions row
 * (or empty/unparseable) = unrestricted. A non-empty set restricts to
 * exactly the areas listed; `write` implies `read` for the same area.
 */
export function hasAreaAccess(user: Pick<SessionUser, 'role'> & { permissions?: string | null }, area: AdminArea, action: PermissionAction = 'read'): boolean {
  if (user.role === 'super_admin') return true
  const perms = parsePermissions(user.permissions)
  if (perms === null) return true
  if (perms.has(`${area}:write`)) return true
  if (action === 'read' && perms.has(`${area}:read`)) return true
  return false
}

/** For the nav-filtering / permissions-editor UI: every area this user currently has at least read access to. */
export function allowedAreas(user: Pick<SessionUser, 'role'> & { permissions?: string | null }): AdminArea[] {
  return ADMIN_AREAS.map((a) => a.key).filter((area) => hasAreaAccess(user, area, 'read'))
}
