import { createError } from 'h3'
import { getSessionUser } from '../utils/auth'
import { hasAnyWriteAccess, hasAreaAccess, parsePermissionsConfig } from '../utils/permissions'
import { isAdminApiPath, resolveAdminRouteAccess } from '../utils/adminRouteMatrix'
import { getRequestId } from '../utils/requestId'

/**
 * Enforces the admin authorization matrix (server/utils/adminRouteMatrix.ts)
 * for every `/api/admin/**` request, before the handler runs (bloque 01).
 *
 * Why a middleware and not 147 more `requireOrgScope(event, area, action)`
 * call sites: the matrix has to be complete to be worth anything, and a
 * per-handler argument is exactly the kind of thing a new endpoint forgets.
 * Here there is one list, one test that proves it covers every route file,
 * and an unmatched admin route denies rather than allows. The handlers keep
 * their own `requireOrgScope(...)` calls — this is an additional gate, not a
 * replacement, and the nine already-annotated routes still check twice.
 *
 * What this middleware deliberately does NOT do:
 *
 *  - It never returns 401. An unauthenticated (or non-admin) request falls
 *    through untouched so the handler's own requireAdmin() produces exactly
 *    the status and message it produced before this file existed.
 *  - It never widens access. super_admin passes as it always has; an account
 *    with no permissions value (every account today) passes every check.
 *  - It does not enforce tenant scope. `organizationId` isolation stays where
 *    it is, in requireOrgScope()/buildTenantWhere() — an area grant says
 *    *what* you may touch, never *whose*.
 */
export default defineEventHandler(async (event) => {
  const path = event.path || ''
  if (!isAdminApiPath(path)) return

  const user = await getSessionUser(event)
  // No session, or not an admin at all: leave it to the handler (401/403).
  if (!user) return
  if (user.role !== 'admin' && user.role !== 'super_admin') return
  if (user.role === 'super_admin') return

  const cfg = parsePermissionsConfig(user.permissions)
  // Unrestricted — the state of every account that has never been given an
  // explicit permissions array. Nothing to check, and no reason to pay for
  // a matrix lookup.
  if (cfg.kind === 'unrestricted') return

  if (cfg.kind === 'invalid') {
    // A corrupted permissions value used to read as "unrestricted", which
    // turned a data-integrity bug into a silent grant of full access. It now
    // denies, and says so somewhere an operator can find it. No secrets and
    // no personal data: the user's internal id, never their email, and never
    // the stored value itself.
    console.warn(`[rbac] permisos inválidos (${cfg.reason}) para el usuario ${user.id} en ${event.method} ${path} — denegado [req ${getRequestId(event)}]`)
    throw deny()
  }

  const access = resolveAdminRouteAccess(path, event.method || 'GET')

  if (!access) {
    // An admin route nobody classified. Denying is the only safe default for
    // a restricted account: the alternative is a new endpoint silently
    // ignoring permissions, which is the defect this block exists to fix.
    // test/unit/adminRouteMatrix.test.ts makes this unreachable in practice.
    console.warn(`[rbac] ruta admin sin entrada en la matriz: ${event.method} ${path} — denegada para el usuario ${user.id} [req ${getRequestId(event)}]`)
    throw deny()
  }

  if (access.kind === 'super-admin') throw deny() // handler enforces it too
  if (access.kind === 'admin-metadata') return
  if (access.kind === 'any-write') {
    if (!hasAnyWriteAccess(user)) throw deny()
    return
  }
  if (!hasAreaAccess(user, access.area, access.action)) throw deny()
})

/**
 * Same status and message requireOrgScope() already threw for a failed area
 * check, so the admin UI's existing error handling keeps working and the
 * response says nothing about which areas the account *does* have.
 */
function deny() {
  return createError({ statusCode: 403, statusMessage: 'No tienes permiso para acceder a esta sección.' })
}
