// The public real-estate site moved from "/" to "/demo/*" so the root can
// host a future SaaS landing page. This protects everything that pointed at
// the OLD paths before the move — bookmarks, search-engine-indexed URLs, and
// especially already-generated Asset Export Studio QR codes/PDFs whose
// destinationUrl was baked in as `${origin}/property-details/...` — with a
// permanent redirect to the new "/demo/..." location instead of a 404.
const LEGACY_PREFIXES = [
  '/properties',
  '/property-details',
  '/blog',
  '/leadership',
  '/mapa',
  '/community',
  '/project-community',
  '/developer-list',
  '/about-us',
  '/contact-us',
  '/compare',
  '/favoritos',
  '/complain',
  '/visitor',
  '/vendors',
  '/privacy',
  '/terms',
]

export default defineEventHandler((event) => {
  if (event.method !== 'GET') return
  const url = getRequestURL(event)
  const path = url.pathname
  if (path.startsWith('/demo') || path.startsWith('/admin') || path.startsWith('/api/') || path.startsWith('/_nuxt/') || path.startsWith('/_ipx/') || path.startsWith('/cdn-cgi/')) return

  const isLegacyPath = LEGACY_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
  if (!isLegacyPath) return

  return sendRedirect(event, `/demo${path}${url.search}`, 301)
})
