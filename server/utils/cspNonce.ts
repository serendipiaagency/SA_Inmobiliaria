import type { H3Event } from 'h3'

/**
 * Per-request CSP nonce (P2, docs/production-hardening-audit.md — closing
 * the `unsafe-inline` gap on script-src/style-src-elem). Generated once by
 * server/middleware/security-headers.ts (which needs it to build the
 * Content-Security-Policy header) and read again later, same request, by
 * server/plugins/csp-nonce.ts's `render:html` hook (which needs it to stamp
 * the matching `nonce="…"` attribute onto every `<script>`/`<style>` tag
 * Nuxt renders). Cached on `event.context` — same pattern as
 * server/utils/requestId.ts's getRequestId() — so both call sites agree on
 * one value per request instead of each minting their own.
 */
export function getCspNonce(event: H3Event): string {
  const ctx = event.context as any
  if (ctx.cspNonce) return ctx.cspNonce as string
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const nonce = btoa(String.fromCharCode(...bytes))
  ctx.cspNonce = nonce
  return nonce
}

/**
 * Adds `nonce="…"` to every <script>/<style> tag in an HTML fragment —
 * used by server/plugins/csp-nonce.ts's `render:html` hook to stamp Nuxt's
 * own rendered tags with the same nonce the CSP header advertises. Skips a
 * tag that already carries a nonce (defensive — nothing produces one today).
 */
export function stampNonce(html: string, nonce: string): string {
  return html.replace(/<script(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`).replace(/<style(?![^>]*\bnonce=)/g, `<style nonce="${nonce}"`)
}
