/**
 * Baseline security headers for every response. /embed is the one deliberate exception —
 * it's a widget meant to be iframed on third-party sites, so it keeps framing open while
 * everything else (including /admin) blocks it to prevent clickjacking.
 *
 * CSP allowlists the specific third-party origins this app actually loads at runtime: map
 * tiles (CartoDB), Google Fonts, and the Instagram/TikTok embed scripts used on blog posts.
 * script-src/style-src still need 'unsafe-inline' because Nuxt's hydration payload and
 * Tailwind's inline :style bindings aren't nonce-based here — tightening that further would
 * need a dedicated CSP-nonce setup (e.g. @nuxtjs/security), left as a follow-up.
 */
export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  const isEmbeddable = path.startsWith('/embed')

  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
  setHeader(event, 'Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  setHeader(event, 'Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  if (!isEmbeddable) setHeader(event, 'X-Frame-Options', 'DENY')

  setHeader(
    event,
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `frame-ancestors ${isEmbeddable ? '*' : "'self'"}`,
      "img-src 'self' data: blob: https://*.basemaps.cartocdn.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self' 'unsafe-inline' https://www.instagram.com https://www.tiktok.com",
      "frame-src 'self' https://www.instagram.com https://www.tiktok.com",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; '),
  )
})
