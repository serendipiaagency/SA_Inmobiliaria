import { describe, expect, it } from 'vitest'
import { stampNonce } from '../../server/utils/cspNonce'

/**
 * P2 CSP hardening (docs/production-hardening-audit.md) — script-src/
 * style-src-elem dropped 'unsafe-inline' in favor of a per-request nonce.
 * stampNonce() is what server/plugins/csp-nonce.ts applies to every HTML
 * fragment Nuxt's `render:html` hook hands it, so the nonce it stamps here
 * must exactly match the one server/middleware/security-headers.ts put in
 * the CSP header for the same request — otherwise every un-nonced inline
 * <script>/<style> gets silently blocked by nonce-aware browsers.
 */
describe('stampNonce', () => {
  it('adds a matching nonce attribute to a plain <script> tag', () => {
    expect(stampNonce('<script>window.__NUXT__={}</script>', 'abc123')).toBe('<script nonce="abc123">window.__NUXT__={}</script>')
  })

  it('adds a matching nonce attribute to a <script> tag that already has other attributes', () => {
    expect(stampNonce('<script type="module" src="/_nuxt/a.js" crossorigin>', 'abc123')).toBe(
      '<script nonce="abc123" type="module" src="/_nuxt/a.js" crossorigin>',
    )
  })

  it('adds a matching nonce attribute to <style> tags', () => {
    expect(stampNonce('<style>.a{color:red}</style>', 'xyz')).toBe('<style nonce="xyz">.a{color:red}</style>')
  })

  it('stamps every tag in a fragment with multiple scripts/styles', () => {
    const input = '<style>.a{}</style><script>1</script><script>2</script>'
    const out = stampNonce(input, 'n1')
    expect(out).toBe('<style nonce="n1">.a{}</style><script nonce="n1">1</script><script nonce="n1">2</script>')
  })

  it('does not touch tags that already carry a nonce', () => {
    expect(stampNonce('<script nonce="existing">x</script>', 'new')).toBe('<script nonce="existing">x</script>')
  })

  it('leaves fragments with no script/style tags untouched', () => {
    expect(stampNonce('<meta charset="utf-8">', 'n1')).toBe('<meta charset="utf-8">')
  })

  it('never leaves an un-nonced script/style tag behind — the exact failure mode that would break hydration under a nonce-based CSP', () => {
    const html = '<script>a</script><style>b</style><script type="module">c</script>'
    const out = stampNonce(html, 'n')
    expect(out.match(/<script(?![^>]*nonce=)/g)).toBeNull()
    expect(out.match(/<style(?![^>]*nonce=)/g)).toBeNull()
  })
})
