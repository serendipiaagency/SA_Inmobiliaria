import type { H3Event } from 'h3'
import { getCspNonce } from '../utils/cspNonce'
import { permissionsPolicyFor } from '../utils/permissionsPolicy'
import { TILE_ORIGINS } from '../../utils/maps/tiles'
import { useDb, resolvePublicOrgId } from '../utils/db'
import { cachedCookieProviders, cspOriginsForProviders } from '../utils/siteSettings'

/**
 * Baseline security headers for every response. /embed is the one deliberate exception —
 * it's a widget meant to be iframed on third-party sites, so it keeps framing open while
 * everything else (including /admin) blocks it to prevent clickjacking.
 *
 * CSP allowlists the specific third-party origins this app actually loads at runtime: map
 * tiles (TILE_ORIGINS in utils/maps/tiles.ts: CARTO with its key, or OpenStreetMap without
 * one, for the standard/dark base layers; Esri/ArcGIS Online for "Satélite"), Google Fonts, the Instagram/TikTok embed scripts used on blog posts, and
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
 *
 * Google Analytics 4 y el píxel de Meta sólo entran en la CSP de las páginas de una web
 * cuya agencia los configuró (Constructor Web → Cookies, server/utils/siteSettings.ts), y
 * aun así sólo se cargan cuando el visitante lo acepta en el aviso de cookies
 * (plugins/consent-scripts.client.ts). Las demás webs no los permiten en absoluto.
 */
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  const isEmbeddable = path.startsWith('/embed')
  const nonce = getCspNonce(event)
  const extra = await providerOrigins(event, path)

  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
  // Geolocalización sólo para el propio origen y sólo en la web pública («Mi ubicación» de /mapa) — ver server/utils/permissionsPolicy.ts.
  setHeader(event, 'Permissions-Policy', permissionsPolicyFor(path))
  setHeader(event, 'Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  if (!isEmbeddable) setHeader(event, 'X-Frame-Options', 'DENY')

  setHeader(
    event,
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `frame-ancestors ${isEmbeddable ? '*' : "'self'"}`,
      `img-src 'self' data: blob: ${TILE_ORIGINS.join(' ')} https://images.unsplash.com${extra.img}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      `style-src-elem 'self' 'nonce-${nonce}' 'unsafe-inline' https://fonts.googleapis.com`,
      "style-src-attr 'unsafe-inline'",
      "font-src 'self' https://fonts.gstatic.com",
      `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://www.instagram.com https://www.tiktok.com${extra.script}`,
      // YouTube y Vimeo sólo con su reproductor sin cookies (utils/videoEmbed.ts).
      "frame-src 'self' https://www.instagram.com https://www.tiktok.com https://www.youtube-nocookie.com https://player.vimeo.com",
      `connect-src 'self'${extra.connect}`,
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; '),
  )
})

/** Página pública (no API, no panel, no recurso estático): la única que puede cargar analítica. */
function isPublicDocument(path: string): boolean {
  if (path.startsWith('/api/') || path.startsWith('/_nuxt/') || path.startsWith('/admin') || path.startsWith('/embed')) return false
  return !/\.[a-z0-9]{2,5}$/i.test(path)
}

async function providerOrigins(event: H3Event, path: string): Promise<{ script: string; connect: string; img: string }> {
  const none = { script: '', connect: '', img: '' }
  if (!isPublicDocument(path)) return none
  try {
    const o = cspOriginsForProviders(await cachedCookieProviders(useDb(event), resolvePublicOrgId(event)))
    const join = (list: string[]) => (list.length ? ` ${list.join(' ')}` : '')
    return { script: join(o.script), connect: join(o.connect), img: join(o.img) }
  } catch {
    // Sin poder leer los ajustes, la página sale con la CSP de siempre: sin analítica.
    return none
  }
}
