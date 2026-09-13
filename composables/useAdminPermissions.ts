import { allowedAreas, hasAreaAccess, type PermissionAction } from '~/utils/permissions'
import type { AdminArea } from '~/utils/adminAreas'

/**
 * Client-side view of the logged-in admin's permissions, reading the exact
 * same rules the server enforces (utils/permissions.ts, shared by both).
 *
 * This is for *alignment*, never for protection: hiding a button the API
 * would reject keeps the panel honest, but the decision that matters is the
 * one in server/middleware/01.admin-rbac.ts. Anything gated only here is not
 * gated at all.
 *
 * While the session is still loading, `user` is null and every check answers
 * as if unrestricted — the same thing the nav did before this existed, so a
 * page never flickers from "denied" to "allowed" on hydration. The server is
 * what stops a request either way.
 */
export function useAdminPermissions() {
  const { user } = useAuth()

  const subject = computed(() => user.value || { role: 'user', permissions: null })
  const isSuperAdmin = computed(() => user.value?.role === 'super_admin')
  const areas = computed<AdminArea[]>(() => allowedAreas(subject.value))

  function can(area: AdminArea, action: PermissionAction = 'read'): boolean {
    return hasAreaAccess(subject.value, area, action)
  }

  function canRead(area: AdminArea): boolean {
    return can(area, 'read')
  }

  function canWrite(area: AdminArea): boolean {
    return can(area, 'write')
  }

  return { areas, can, canRead, canWrite, isSuperAdmin }
}
