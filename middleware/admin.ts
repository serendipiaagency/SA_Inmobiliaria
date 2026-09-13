import { areaForAdminPath, isSuperAdminOnlyAdminPath } from '~/utils/adminNav'
import { allowedAreas, hasAreaAccess } from '~/utils/permissions'

export default defineNuxtRouteMiddleware(async (to) => {
  const { user, loaded, refresh } = useAuth()
  if (!loaded.value) await refresh()
  if (!user.value || (user.value.role !== 'admin' && user.value.role !== 'super_admin')) {
    return navigateTo('/admin/login')
  }

  // Granular RBAC (bloque 01): the nav already hides groups this account
  // can't read, but typing the URL by hand used to land on the page anyway —
  // a shell that then fills with 403s from every call it makes. Send them
  // somewhere they're actually allowed instead.
  //
  // This is UX alignment, not the control: server/middleware/01.admin-rbac.ts
  // is what refuses the data. `areaForAdminPath` returning null means no nav
  // entry claims the page (a deep-linked generic resource), and those are
  // left to the server.
  if (user.value.role === 'super_admin') return
  if (isSuperAdminOnlyAdminPath(to.path)) return navigateTo(firstAllowedPath(user.value))

  const area = areaForAdminPath(to.path)
  if (!area) return
  if (hasAreaAccess(user.value, area, 'read')) return
  return navigateTo(firstAllowedPath(user.value))
})

/**
 * Where to send an admin who asked for a page they can't see. The dashboard
 * when they can read "general", otherwise the first area they can — and
 * /admin/ayuda as the last resort, since it has no area and is the one page
 * every admin keeps.
 */
function firstAllowedPath(user: { role: string; permissions?: string | null }): string {
  const allowed = allowedAreas(user)
  if (allowed.includes('general')) return '/admin'
  const landing: Record<string, string> = {
    crm: '/admin/leads',
    web: '/admin/developer-properties',
    finance: '/admin/facturacion',
    cms: '/admin/cms',
    content: '/admin/blogs',
    inbox: '/admin/visitor-submissions',
    system: '/admin/configuracion',
  }
  for (const area of allowed) {
    if (landing[area]) return landing[area]
  }
  return '/admin/ayuda'
}
