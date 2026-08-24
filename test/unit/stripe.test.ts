import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { verifyStripeSignature, applyStripeEvent } from '../../server/utils/stripe'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'

const SECRET = 'whsec_test_do_not_use_in_prod'

async function signHeader(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `t=${timestamp},v1=${hex}`
}

describe('verifyStripeSignature', () => {
  const body = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' })

  it('accepts a correctly signed payload', async () => {
    const header = await signHeader(body, SECRET)
    expect(await verifyStripeSignature(body, header, SECRET)).toBe(true)
  })

  it('rejects a payload signed with the wrong secret', async () => {
    const header = await signHeader(body, 'whsec_wrong_secret')
    expect(await verifyStripeSignature(body, header, SECRET)).toBe(false)
  })

  it('rejects a payload that was tampered with after signing', async () => {
    const header = await signHeader(body, SECRET)
    const tampered = JSON.stringify({ id: 'evt_123', type: 'charge.refunded' })
    expect(await verifyStripeSignature(tampered, header, SECRET)).toBe(false)
  })

  it('rejects a stale timestamp (replay protection)', async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 10 * 60 // 10 minutes old, default tolerance is 300s
    const header = await signHeader(body, SECRET, staleTimestamp)
    expect(await verifyStripeSignature(body, header, SECRET)).toBe(false)
  })

  it('rejects a missing signature header', async () => {
    expect(await verifyStripeSignature(body, null, SECRET)).toBe(false)
    expect(await verifyStripeSignature(body, undefined, SECRET)).toBe(false)
  })

  it('rejects a malformed header', async () => {
    expect(await verifyStripeSignature(body, 'not-a-valid-header', SECRET)).toBe(false)
    expect(await verifyStripeSignature(body, 't=abc,v1=deadbeef', SECRET)).toBe(false)
  })
})

describe('applyStripeEvent', () => {
  async function seedDeposit(db: any, orgId: number, overrides: Record<string, unknown> = {}) {
    const [deposit] = await db
      .insert(schema.depositPayments)
      .values({ organizationId: orgId, amount: 500, currency: 'eur', status: 'processing', createdAt: '2026-01-01 00:00:00', ...overrides })
      .returning()
    return deposit
  }

  it('checkout.session.completed with payment_status=paid marks the deposit paid and captures the payment_intent id', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Stripe1')
    const deposit = await seedDeposit(db, a.orgId, { stripeCheckoutSessionId: 'cs_test_1' })

    const result = await applyStripeEvent(db, {}, 'checkout.session.completed', { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_test_1' })
    expect(result.status).toBe('processed')
    expect(result.depositId).toBe(deposit.id)

    const [updated] = await db.select().from(schema.depositPayments).where(eq(schema.depositPayments.id, deposit.id))
    expect(updated.status).toBe('paid')
    expect(updated.paidAt).toBeTruthy()
    expect(updated.stripePaymentIntentId).toBe('pi_test_1')
  })

  it('checkout.session.completed with an unpaid status leaves the deposit processing, not paid', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Stripe2')
    const deposit = await seedDeposit(db, a.orgId, { stripeCheckoutSessionId: 'cs_test_2' })

    await applyStripeEvent(db, {}, 'checkout.session.completed', { id: 'cs_test_2', payment_status: 'unpaid', payment_intent: 'pi_test_2' })

    const [updated] = await db.select().from(schema.depositPayments).where(eq(schema.depositPayments.id, deposit.id))
    expect(updated.status).toBe('processing')
    expect(updated.paidAt).toBeFalsy()
  })

  it('checkout.session.async_payment_failed marks the deposit failed', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Stripe3')
    const deposit = await seedDeposit(db, a.orgId, { stripeCheckoutSessionId: 'cs_test_3' })

    await applyStripeEvent(db, {}, 'checkout.session.async_payment_failed', { id: 'cs_test_3' })

    const [updated] = await db.select().from(schema.depositPayments).where(eq(schema.depositPayments.id, deposit.id))
    expect(updated.status).toBe('failed')
  })

  it('payment_intent.payment_failed matches by payment_intent id, not session id', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Stripe4')
    const deposit = await seedDeposit(db, a.orgId, { stripeCheckoutSessionId: 'cs_test_4', stripePaymentIntentId: 'pi_test_4' })

    const result = await applyStripeEvent(db, {}, 'payment_intent.payment_failed', { id: 'pi_test_4', last_payment_error: { message: 'Your card was declined.' } })
    expect(result.status).toBe('processed')

    const [updated] = await db.select().from(schema.depositPayments).where(eq(schema.depositPayments.id, deposit.id))
    expect(updated.status).toBe('failed')
    expect(updated.errorMessage).toBe('Your card was declined.')
  })

  it('charge.refunded matches via the charge object\'s payment_intent field', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Stripe5')
    const deposit = await seedDeposit(db, a.orgId, { stripeCheckoutSessionId: 'cs_test_5', stripePaymentIntentId: 'pi_test_5', status: 'paid', paidAt: '2026-01-02 00:00:00' })

    const result = await applyStripeEvent(db, {}, 'charge.refunded', { id: 'ch_test_5', payment_intent: 'pi_test_5' })
    expect(result.status).toBe('processed')

    const [updated] = await db.select().from(schema.depositPayments).where(eq(schema.depositPayments.id, deposit.id))
    expect(updated.status).toBe('refunded')
    expect(updated.refundedAt).toBeTruthy()
  })

  it('an event with no matching deposit is ignored, not errored', async () => {
    const { db } = createTestDb()
    await seedTenant(db, 'Stripe6')

    const result = await applyStripeEvent(db, {}, 'checkout.session.completed', { id: 'cs_never_seen', payment_status: 'paid' })
    expect(result.status).toBe('ignored')
  })

  it('an unrecognized event type is ignored, not errored', async () => {
    const { db } = createTestDb()
    const result = await applyStripeEvent(db, {}, 'customer.created', { id: 'cus_123' })
    expect(result.status).toBe('ignored')
  })

  it('never touches the deposit amount, regardless of what the event payload contains', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Stripe7')
    const deposit = await seedDeposit(db, a.orgId, { stripeCheckoutSessionId: 'cs_test_7', amount: 500 })

    // A malicious/buggy payload with a different amount must never change what we charge for.
    await applyStripeEvent(db, {}, 'checkout.session.completed', { id: 'cs_test_7', payment_status: 'paid', amount_total: 999999, payment_intent: 'pi_test_7' })

    const [updated] = await db.select().from(schema.depositPayments).where(eq(schema.depositPayments.id, deposit.id))
    expect(updated.amount).toBe(500)
  })
})
