import { ADMIN_AREAS, isAdminArea, type AdminArea } from './adminAreas'

/**
 * Granular per-admin permissions (P2, docs/production-hardening-audit.md;
 * hardened in bloque 01, docs/rbac-authorization-matrix.md).
 *
 * Root-level (not server/utils/) so this is the single source of truth for
 * both the client (nav filtering in layouts/admin.vue, the permissions
 * editor in pages/admin/[resource]/[id].vue) and the server
 * (server/utils/permissions.ts re-exports this for Nitro's separate
 * auto-import scope).
 *
 * `users.permissions` (migration 0058) is a nullable JSON array of
 * "<area>:<action>" strings with exactly three distinct meanings:
 *
 *   NULL / absent          -> unrestricted. Every account that existed
 *                             before RBAC shipped, and the default for any
 *                             new account nobody restricts. Unchanged.
 *   ["crm:read", ...]      -> restricted to exactly those areas/actions.
 *   [] or unparseable      -> DENY EVERYTHING (fail closed).
 *
 * That last line is the bloque-01 fix. It used to collapse into "NULL", so
 * an empty list — the natural way for the editor UI to express "this admin
 * may do nothing" — silently granted full access, and a corrupted/truncated
 * JSON value did the same. See migration 0061 for the compatible transition:
 * every row that meant "unrestricted" via those paths is normalised to a
 * real NULL *before* this code starts denying them, so no existing account
 * changes behaviour on deploy.
 */

export type PermissionAction = 'read' | 'write'

/**
 * The three states a `users.permissions` value can be in. Callers that only
 * need a yes/no should use `hasAreaAccess`; this exists so the server can
 * tell "deliberately restricted to nothing" from "corrupted configuration"
 * and log the latter (server/middleware/01.admin-rbac.ts).
 */
export type PermissionsConfig =
  | { kind: 'unrestricted' }
  | { kind: 'restricted'; granted: Set<string> }
  | { kind: 'invalid'; reason: 'not-json' | 'not-an-array' }

const UNRESTRICTED: PermissionsConfig = { kind: 'unrestricted' }

/**
 * Classifies a raw `users.permissions` column value. Never throws: a value
 * this can't make sense of is reported as `invalid`, which every caller
 * must treat as "deny", not as "allow".
 */
export function parsePermissionsConfig(raw: string | null | undefined): PermissionsConfig {
  // NULL, undefined and '' are the "no restriction configured" state. An
  // empty string is included deliberately: it is what a NULL column looks
  // like after a round-trip through some form encoders, and it carries no
  // intent to restrict, unlike a literal '[]'.
  if (raw == null || raw.trim() === '') return UNRESTRICTED
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'invalid', reason: 'not-json' }
  }
  if (!Array.isArray(parsed)) return { kind: 'invalid', reason: 'not-an-array' }
  // An explicit [] is a real decision ("no areas"), so it stays `restricted`
  // with an empty grant set and denies everything.
  return { kind: 'restricted', granted: new Set(parsed.filter((v): v is string => typeof v === 'string')) }
}

/**
 * Back-compatible shape: `null` = unrestricted, a Set = the exact grants
 * (possibly empty, meaning "nothing"). Invalid configuration collapses to an
 * empty Set — i.e. denied — never to `null`.
 */
export function parsePermissions(raw: string | null | undefined): Set<string> | null {
  const cfg = parsePermissionsConfig(raw)
  if (cfg.kind === 'unrestricted') return null
  if (cfg.kind === 'invalid') return new Set<string>()
  return cfg.granted
}

/**
 * super_admin always passes, regardless of `permissions` — same as every
 * other role check in server/utils/auth.ts. Otherwise: no permissions value
 * = unrestricted; a stored array restricts to exactly the areas listed
 * (`write` implies `read` for the same area); an empty array or an
 * unparseable value denies everything.
 */
export function hasAreaAccess(user: { role: string; permissions?: string | null }, area: AdminArea, action: PermissionAction = 'read'): boolean {
  if (user.role === 'super_admin') return true
  const cfg = parsePermissionsConfig(user.permissions)
  if (cfg.kind === 'unrestricted') return true
  if (cfg.kind === 'invalid') return false
  if (cfg.granted.has(`${area}:write`)) return true
  if (action === 'read' && cfg.granted.has(`${area}:read`)) return true
  return false
}

/** For the nav-filtering / permissions-editor UI: every area this user currently has at least read access to. */
export function allowedAreas(user: { role: string; permissions?: string | null }): AdminArea[] {
  return ADMIN_AREAS.map((a) => a.key).filter((area) => hasAreaAccess(user, area, 'read'))
}

/**
 * Write-side guard for `users.permissions`: returns an error message for a
 * value that must not be stored, or `null` when it's acceptable.
 *
 * The read side already fails closed on a corrupted value, but that turns a
 * typo into a locked-out admin. Rejecting the write is the better half of the
 * same fix — the only way an `invalid` row can exist after this ships is data
 * written outside the app (a manual D1 statement, a restore), which is
 * exactly when denying is the right answer.
 *
 * `null`/absent (unrestricted) and `[]` (deliberately no areas) are both
 * accepted: they are decisions, not mistakes.
 */
export function validatePermissionsInput(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw !== 'string') return 'Los permisos deben enviarse como texto JSON.'
  if (raw.trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return 'Los permisos no son JSON válido.'
  }
  if (!Array.isArray(parsed)) return 'Los permisos deben ser un array JSON de cadenas "<área>:<acción>".'
  for (const entry of parsed) {
    if (typeof entry !== 'string') return 'Cada permiso debe ser una cadena "<área>:<acción>".'
    const [areaKey, action] = entry.split(':')
    if (!isAdminArea(areaKey) || (action !== 'read' && action !== 'write')) {
      return `Permiso desconocido: "${entry}". Usa "<área>:read" o "<área>:write" con un área válida.`
    }
  }
  return null
}

/**
 * True when the account may write in at least one area. Used by the handful
 * of endpoints that are genuinely shared across every area (the R2 upload
 * endpoints, reachable from the property builder, the CMS, the site builder
 * and the asset exporter alike) and therefore cannot be pinned to a single
 * one — see server/utils/adminRouteMatrix.ts.
 */
export function hasAnyWriteAccess(user: { role: string; permissions?: string | null }): boolean {
  if (user.role === 'super_admin') return true
  const cfg = parsePermissionsConfig(user.permissions)
  if (cfg.kind === 'unrestricted') return true
  if (cfg.kind === 'invalid') return false
  return ADMIN_AREAS.some((a) => cfg.granted.has(`${a.key}:write`))
}
