import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'

/**
 * The Resend webhook endpoint (server/api/resend/webhook.post.ts) over real
 * HTTP. RESEND_WEBHOOK_SECRET is injected as a fixed, non-secret placeholder
 * by scripts/e2e.sh so this spec can sign its own synthetic Svix events —
 * no real Resend account, no network call to Resend, no real email sent.
 *
 * The DB-matching logic itself (does email.delivered actually mark the
 * right email_log row, does a complaint on a commercial email unsubscribe
 * the recipient, etc.) is covered exhaustively at the unit level
 * (test/unit/email.send.test.ts) against real seeded rows — not
 * reproducible here without a real Resend-issued email id, which this
 * suite deliberately never creates. This spec owns the HTTP-boundary
 * concerns: signature verification, malformed input, and idempotency —
 * same split as tests/e2e/stripe-webhook.spec.ts.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const WEBHOOK_SECRET = 'whsec_ZTJlX3Rlc3RfcGxhY2Vob2xkZXJfMzJieXRlcw=='

async function signHeaders(body: string, secret: string, svixId = `msg_${Date.now()}`, timestamp = Math.floor(Date.now() / 1000)) {
  const secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', secretBytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${svixId}.${timestamp}.${body}`))
  let bin = ''
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b)
  return { 'svix-id': svixId, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${btoa(bin)}` }
}

test.describe('Webhook de Resend', () => {
  let anon: APIRequestContext

  test.beforeAll(async () => {
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
  })

  test.afterAll(async () => {
    await anon.dispose()
  })

  test('un POST sin cabeceras svix se rechaza con 400', async () => {
    const res = await anon.post('/api/resend/webhook', { data: { type: 'email.delivered', data: { email_id: 're_x' } } })
    expect(res.status()).toBe(400)
  })

  test('una firma inválida se rechaza con 400', async () => {
    const res = await anon.post('/api/resend/webhook', {
      headers: { 'svix-id': 'msg_bad', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,deadbeef==' },
      data: { type: 'email.delivered', data: { email_id: 're_x' } },
    })
    expect(res.status()).toBe(400)
  })

  test('una firma con marca de tiempo antigua (replay) se rechaza con 400', async () => {
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: `re_stale_${Date.now()}` } })
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600
    const headers = await signHeaders(body, WEBHOOK_SECRET, `msg_stale_${Date.now()}`, staleTimestamp)
    const res = await anon.post('/api/resend/webhook', { headers: { ...headers, 'content-type': 'application/json' }, data: body })
    expect(res.status()).toBe(400)
  })

  test('un evento firmado correctamente pero sin email_log asociado se acepta (200) y se marca "ignored"', async () => {
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: `re_never_sent_${Date.now()}` } })
    const headers = await signHeaders(body, WEBHOOK_SECRET)
    const res = await anon.post('/api/resend/webhook', { headers: { ...headers, 'content-type': 'application/json' }, data: body })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect((await res.json()).status).toBe('ignored')
  })

  test('un tipo de evento no gestionado también se acepta (200), nunca un error', async () => {
    const body = JSON.stringify({ type: 'email.opened', data: { email_id: `re_opened_${Date.now()}` } })
    const headers = await signHeaders(body, WEBHOOK_SECRET)
    const res = await anon.post('/api/resend/webhook', { headers: { ...headers, 'content-type': 'application/json' }, data: body })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect((await res.json()).status).toBe('ignored')
  })

  test('el mismo svix-id reenviado dos veces solo se procesa una vez (idempotencia)', async () => {
    const svixId = `msg_idempotent_${Date.now()}`
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: `re_idempotent_${Date.now()}` } })
    const headers = await signHeaders(body, WEBHOOK_SECRET, svixId)

    const first = await anon.post('/api/resend/webhook', { headers: { ...headers, 'content-type': 'application/json' }, data: body })
    expect(first.ok(), await first.text()).toBeTruthy()
    expect((await first.json()).duplicate).toBeFalsy()

    const second = await anon.post('/api/resend/webhook', { headers: { ...headers, 'content-type': 'application/json' }, data: body })
    expect(second.ok(), await second.text()).toBeTruthy()
    expect((await second.json()).duplicate).toBe(true)
  })
})
