// The public real-estate site now lives at clean, root-level URLs (see
// pages/index.vue's host-aware "/" branch and pages/propiedades, /mapa,
// /zonas, /promotoras, /equipo, /blog, /contacto, /mi-cuenta, etc.). This
// middleware permanently redirects every URL that used to reach that
// content — both the ORIGINAL pre-migration-0033 bare paths (already
// search-indexed, and baked into QR codes/PDFs generated before that
// migration) and the interim "/demo/*" paths migration 0033 moved them to
// (also indexed, and referenced by every asset export generated since) —
// straight to the new clean path in a single hop.
//
// Rules are prefix-based: `from` matches the path itself or any of its
// subpaths, and the matched prefix is swapped for `to` while the remainder
// (a slug/id) and the query string pass through unchanged. Order matters:
// a more specific prefix must come before a shorter one it overlaps with
// (e.g. "/demo/blog/preview" before "/demo/blog").
//
// Paths where the bare pre-migration path already equals the new clean path
// (/blog, /mapa, /favoritos) are intentionally absent — there's nothing to
// redirect, the live page already serves that exact URL.
const REDIRECT_RULES: Array<{ from: string; to: string }> = [
  // Interim "/demo/*" paths (migration 0033 → today)
  { from: '/demo/blog/preview', to: '/admin/cms/articles/preview' },
  { from: '/demo/property-details', to: '/propiedades' },
  { from: '/demo/properties', to: '/propiedades' },
  { from: '/demo/leadership', to: '/equipo' },
  { from: '/demo/blog', to: '/blog' },
  { from: '/demo/mapa', to: '/mapa' },
  { from: '/demo/community', to: '/zonas' },
  { from: '/demo/project-community', to: '/zonas' },
  { from: '/demo/developer-list', to: '/promotoras' },
  { from: '/demo/about-us', to: '/nosotros' },
  { from: '/demo/contact-us', to: '/contacto' },
  { from: '/demo/compare', to: '/comparar' },
  { from: '/demo/favoritos', to: '/favoritos' },
  { from: '/demo/complain', to: '/reclamaciones' },
  { from: '/demo/visitor', to: '/visitante' },
  { from: '/demo/vendors/registration', to: '/proveedores/registro' },
  { from: '/demo/privacy', to: '/privacidad' },
  { from: '/demo/terms', to: '/terminos' },
  { from: '/demo/mi-cuenta', to: '/mi-cuenta' },
  { from: '/demo/referir', to: '/referir' },
  { from: '/demo', to: '/' },

  // Original bare paths, from before migration 0033 moved everything under
  // "/demo" — still search-indexed, still on old QR codes/PDFs/bookmarks.
  { from: '/property-details', to: '/propiedades' },
  { from: '/properties', to: '/propiedades' },
  { from: '/leadership', to: '/equipo' },
  { from: '/community', to: '/zonas' },
  { from: '/project-community', to: '/zonas' },
  { from: '/developer-list', to: '/promotoras' },
  { from: '/about-us', to: '/nosotros' },
  { from: '/contact-us', to: '/contacto' },
  { from: '/compare', to: '/comparar' },
  { from: '/complain', to: '/reclamaciones' },
  { from: '/visitor', to: '/visitante' },
  { from: '/vendors/registration', to: '/proveedores/registro' },
  { from: '/vendors', to: '/proveedores/registro' },
  { from: '/privacy', to: '/privacidad' },
  { from: '/terms', to: '/terminos' },
]

export default defineEventHandler((event) => {
  if (event.method !== 'GET') return
  const url = getRequestURL(event)
  const path = url.pathname
  if (path.startsWith('/admin') || path.startsWith('/api/') || path.startsWith('/_nuxt/') || path.startsWith('/_ipx/') || path.startsWith('/cdn-cgi/')) return

  for (const rule of REDIRECT_RULES) {
    if (path === rule.from || path.startsWith(`${rule.from}/`)) {
      const remainder = path.slice(rule.from.length)
      return sendRedirect(event, `${rule.to}${remainder}${url.search}`, 301)
    }
  }
})
