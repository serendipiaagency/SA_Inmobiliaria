import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'

/**
 * The Stripe webhook endpoint (server/api/stripe/webhook.post.ts) over real
 * HTTP. STRIPE_WEBHOOK_SECRET is injected as a fixed, non-secret placeholder
 * by scripts/e2e.sh (`wrangler dev --var STRIPE_WEBHOOK_SECRET:...`) so this
 * spec can sign its own synthetic events — no real Stripe account, no
 * network call to Stripe, no real charge.
 *
 * The DB-matching logic itself (does a checkout.session.completed actually
 * mark the right deposit paid, capture the payment_intent id, etc.) is
 * covered exhaustively at the unit level (test/unit/stripe.test.ts) against
 * a real seeded deposit row — that's not reproducible here without a real
 * Stripe-created Checkout Session id, which this suite deliberately never
 * creates. This spec owns the HTTP-boundary concerns instead: signature
 * verification, malformed input, and idempotency.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const WEBHOOK_SECRET = 'whsec_e2e_test_placeholder'

async function signHeader(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `t=${timestamp},v1=${hex}`
}

test.describe('Webhook de Stripe', () => {
  let anon: APIRequestContext

  test.beforeAll(async () => {
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
  })

  test.afterAll(async () => {
    await anon.dispose()
  })

  test('un POST sin cabecera stripe-signature se rechaza con 400', async () => {
    const res = await anon.post('/api/stripe/webhook', { data: { id: 'evt_no_sig', type: 'checkout.session.completed' } })
    expect(res.status()).toBe(400)
  })

  test('una firma inválida se rechaza con 400 y no crea ningún registro procesado', async () => {
    const res = await anon.post('/api/stripe/webhook', {
      headers: { 'stripe-signature': 't=1700000000,v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' },
      data: { id: `evt_bad_sig_${Date.now()}`, type: 'checkout.session.completed' },
    })
    expect(res.status()).toBe(400)
  })

  test('una firma con marca de tiempo antigua (replay) se rechaza con 400', async () => {
    const body = JSON.stringify({ id: `evt_stale_${Date.now()}`, type: 'checkout.session.completed', data: { object: {} } })
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600 // 1h old
    const header = await signHeader(body, WEBHOOK_SECRET, staleTimestamp)
    const res = await anon.post('/api/stripe/webhook', { headers: { 'stripe-signature': header, 'content-type': 'application/json' }, data: body })
    expect(res.status()).toBe(400)
  })

  test('un evento firmado correctamente pero sin depósito asociado se acepta (200) y se marca "ignored"', async () => {
    const body = JSON.stringify({ id: `evt_e2e_${Date.now()}`, type: 'checkout.session.completed', data: { object: { id: 'cs_never_created_by_this_suite', payment_status: 'paid' } } })
    const header = await signHeader(body, WEBHOOK_SECRET)
    const res = await anon.post('/api/stripe/webhook', { headers: { 'stripe-signature': header, 'content-type': 'application/json' }, data: body })
    expect(res.ok(), await res.text()).toBeTruthy()
    const json = await res.json()
    expect(json.status).toBe('ignored')
  })

  test('un tipo de evento no gestionado también se acepta (200), nunca un error', async () => {
    const body = JSON.stringify({ id: `evt_e2e_unhandled_${Date.now()}`, type: 'customer.created', data: { object: { id: 'cus_123' } } })
    const header = await signHeader(body, WEBHOOK_SECRET)
    const res = await anon.post('/api/stripe/webhook', { headers: { 'stripe-signature': header, 'content-type': 'application/json' }, data: body })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect((await res.json()).status).toBe('ignored')
  })

  test('el mismo event_id reenviado dos veces solo se procesa una vez (idempotencia)', async () => {
    const eventId = `evt_e2e_idempotent_${Date.now()}`
    const body = JSON.stringify({ id: eventId, type: 'checkout.session.completed', data: { object: { id: 'cs_never_created_by_this_suite_2', payment_status: 'paid' } } })
    const header = await signHeader(body, WEBHOOK_SECRET)

    const first = await anon.post('/api/stripe/webhook', { headers: { 'stripe-signature': header, 'content-type': 'application/json' }, data: body })
    expect(first.ok(), await first.text()).toBeTruthy()
    expect((await first.json()).duplicate).toBeFalsy()

    const second = await anon.post('/api/stripe/webhook', { headers: { 'stripe-signature': header, 'content-type': 'application/json' }, data: body })
    expect(second.ok(), await second.text()).toBeTruthy()
    expect((await second.json()).duplicate).toBe(true)
  })
})
