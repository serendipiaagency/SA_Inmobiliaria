/**
 * Per-domain robots.txt. Only ever reached on a host that
 * server/middleware/00.tenant.ts already resolved to a real tenant (a known
 * org domain or a primary host) — an unrecognized host 404s before this
 * route runs, so there's nothing tenant-specific to branch on here beyond
 * pointing at that same request's own sitemap.
 */
export default defineEventHandler((event) => {
  const origin = getRequestURL(event).origin
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`
})
