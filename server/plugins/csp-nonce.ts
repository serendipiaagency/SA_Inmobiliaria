import { getCspNonce, stampNonce } from '../utils/cspNonce'

/**
 * Stamps the same per-request nonce server/middleware/security-headers.ts put in the
 * Content-Security-Policy header onto every <script>/<style> tag Nuxt's own renderer emits —
 * its hydration payload (`window.__NUXT__ = …`) included. Without this, the CSP header's
 * `'nonce-…'` source would make browsers reject Nuxt's own un-nonced scripts (the presence of
 * a nonce source disables the 'unsafe-inline' fallback for nonce-aware browsers), breaking
 * hydration/interactivity everywhere. `render:html` is the first-party Nitro hook for exactly
 * this — see @nuxt/nitro-server's NitroRuntimeHooks type — firing once per SSR page render
 * with the same `event` security-headers.ts already generated the nonce for, so
 * getCspNonce(event) here returns that identical cached value rather than minting a new one.
 *
 * Applied uniformly to every htmlContext array: which one actually holds the payload script
 * is a renderer implementation detail not worth depending on, and re-stamping a tag that
 * happens not to need it is harmless.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const nonce = getCspNonce(event)
    html.head = html.head.map((s) => stampNonce(s, nonce))
    html.bodyPrepend = html.bodyPrepend.map((s) => stampNonce(s, nonce))
    html.body = html.body.map((s) => stampNonce(s, nonce))
    html.bodyAppend = html.bodyAppend.map((s) => stampNonce(s, nonce))
  })
})
