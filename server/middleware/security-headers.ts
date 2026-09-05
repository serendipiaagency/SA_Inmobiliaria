import { getCspNonce } from '../utils/cspNonce'

/**
 * Baseline security headers for every response. /embed is the one deliberate exception —
 * it's a widget meant to be iframed on third-party sites, so it keeps framing open while
 * everything else (including /admin) blocks it to prevent clickjacking.
 *
 * CSP allowlists the specific third-party origins this app actually loads at runtime: map
 * tiles (CartoDB), Google Fonts, the Instagram/TikTok embed scripts used on blog posts, and
 * Unsplash — property/community/blog/floor-plan images are content fields that hold either
 * an R2-backed /api/media/ key or a direct Unsplash URL (used as placeholder photography
 * until real listing photos are uploaded), never assume every image is same-origin.
 *
 * script-src and style-src-elem use a per-request nonce (server/utils/cspNonce.ts) instead
 * of 'unsafe-inline' — server/plugins/csp-nonce.ts stamps that same nonce onto every
 * <script>/<style> tag Nuxt's own renderer emits (its hydration payload included) via the
 * `render:html` hook. 'unsafe-inline' stays alongside the nonce in script-src/style-src-elem
 * anyway, purely as a no-op fallback for browsers too old to support nonce-based CSP: a
 * browser new enough to understand 'nonce-…' ignores 'unsafe-inline' in the same directive
 * per spec, so this changes nothing for modern browsers while never breaking an old one.
 * style-src-attr keeps plain 'unsafe-inline' (no nonce) — CSP has no nonce mechanism for the
 * `style="…"` HTML attribute itself, only for <style> elements, and Tailwind/Vue's `:style`
 * bindings render as that attribute. style-src (no suffix) is the fallback a browser without
 * CSP3 directive-splitting support uses instead of style-src-elem/style-src-attr — kept at
 * today's 'unsafe-inline' so those browsers see no change either.
 */
export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  const isEmbeddable = path.startsWith('/embed')
  const nonce = getCspNonce(event)

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
      "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://images.unsplash.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      `style-src-elem 'self' 'nonce-${nonce}' 'unsafe-inline' https://fonts.googleapis.com`,
      "style-src-attr 'unsafe-inline'",
      "font-src 'self' https://fonts.gstatic.com",
      `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://www.instagram.com https://www.tiktok.com`,
      "frame-src 'self' https://www.instagram.com https://www.tiktok.com",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; '),
  )
})
