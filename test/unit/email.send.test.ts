import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { sendTransactionalEmail, sendInternalNotification, attemptSend, MAX_EMAIL_ATTEMPTS } from '../../server/utils/email/send'
import { applyResendEvent } from '../../server/utils/email/resendEvents'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'

/**
 * "Prueba el sistema con un proveedor simulado" — global fetch is stubbed
 * only for the tests that need a successful Resend response; every other
 * test exercises the real "no RESEND_API_KEY configured" code path (no
 * network at all, same honest-about-not-connected pattern as Stripe), which
 * is deterministic and needs no stub.
 */
afterEach(() => {
  vi.unstubAllGlobals()
})

function stubSuccessfulResend(id = 're_mock_123') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ id }), { status: 200 })),
  )
}

function stubFailingResend(status = 500, message = 'Internal error') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ message }), { status })),
  )
}

describe('sendTransactionalEmail — no provider configured (real "not connected" path, no network)', () => {
  it('records a queued email_log row with attempts=1 and a retry scheduled, never marks it sent', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'EmailNoKey')

    const [result] = await sendTransactionalEmail(db, {}, { organizationId: a.orgId, template: 'lead_created', to: 'client@example.com', data: { name: 'x' } })
    expect(result.status).toBe('queued')
    expect(result.ok).toBe(false)
    expect(result.connected).toBe(false)

    const [row] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.id, result.logId))
    expect(row.status).toBe('queued')
    expect(row.attempts).toBe(1)
    expect(row.nextRetryAt).toBeTruthy()
    expect(row.sentAt).toBeFalsy()
  })

  it('gives up after MAX_EMAIL_ATTEMPTS ("reintentos limitados")', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'EmailRetryLimit')
    const [result] = await sendTransactionalEmail(db, {}, { organizationId: a.orgId, template: 'password_reset', to: 'user@example.com', data: {} })

    let last
    for (let i = 1; i < MAX_EMAIL_ATTEMPTS; i++) last = await attemptSend(db, {}, result.logId)

    expect(last?.status).toBe('failed')
    const [row] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.id, result.logId))
    expect(row.status).toBe('failed')
    expect(row.attempts).toBe(MAX_EMAIL_ATTEMPTS)
    expect(row.nextRetryAt).toBeFalsy()
  })
})

describe('sendTransactionalEmail — simulated successful provider', () => {
  it('marks the email sent and captures the provider id, never "delivered" (only the webhook does that)', async () => {
    stubSuccessfulResend('re_abc')
    const { db } = createTestDb()
    const a = await seedTenant(db, 'EmailOk')

    const [result] = await sendTransactionalEmail(db, { RESEND_API_KEY: 'test_key' }, { organizationId: a.orgId, template: 'appointment_created', to: 'client@example.com', data: { scheduledAt: '2026-02-01 10:00' } })
    expect(result.status).toBe('sent')
    expect(result.ok).toBe(true)

    const [row] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.id, result.logId))
    expect(row.status).toBe('sent')
    expect(row.externalId).toBe('re_abc')
    expect(row.sentAt).toBeTruthy()
    expect(row.deliveredAt).toBeFalsy()
  })

  it('uses the org\'s own configured sender identity when set, not the platform default', async () => {
    stubSuccessfulResend()
    const { db } = createTestDb()
    const a = await seedTenant(db, 'EmailCustomSender')
    await db.update(schema.organizations).set({ emailSenderName: 'Custom Agency', emailSenderAddress: 'hello@customagency.example', emailReplyTo: 'support@customagency.example' }).where(eq(schema.organizations.id, a.orgId))

    const [result] = await sendTransactionalEmail(db, { RESEND_API_KEY: 'k' }, { organizationId: a.orgId, template: 'user_welcome', to: 'newuser@example.com', data: { name: 'X', email: 'newuser@example.com' } })
    const [row] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.id, result.logId))
    expect(row.fromHeader).toBe('Custom Agency <hello@customagency.example>')
    expect(row.replyTo).toBe('support@customagency.example')
  })

  it('falls back to the platform default sender when the org has no custom one configured', async () => {
    stubSuccessfulResend()
    const { db } = createTestDb()
    const a = await seedTenant(db, 'EmailDefaultSender')

    const [result] = await sendTransactionalEmail(db, { RESEND_API_KEY: 'k' }, { organizationId: a.orgId, template: 'contract_sent', to: 'client@example.com', data: { title: 'Contrato', url: 'https://x/y' } })
    const [row] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.id, result.logId))
    expect(row.fromHeader).toContain('sa-inmobiliaria.com')
  })
})

describe('sendInternalNotification', () => {
  it('sends to every configured internal recipient, one email_log row each', async () => {
    stubSuccessfulResend()
    const { db } = createTestDb()
    const a = await seedTenant(db, 'EmailInternal')
    await db.update(schema.organizations).set({ emailInternalRecipientsJson: JSON.stringify(['ops@x.com', 'ventas@x.com']) }).where(eq(schema.organizations.id, a.orgId))

    const results = await sendInternalNotification(db, { RESEND_API_KEY: 'k' }, a.orgId, 'lead_created', { name: 'Nuevo lead', email: 'lead@example.com', source: 'web' })
    expect(results.map((r) => r.recipient).sort()).toEqual(['ops@x.com', 'ventas@x.com'])
  })

  it('is a silent no-op when no internal recipients are configured', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'EmailNoInternal')
    const results = await sendInternalNotification(db, {}, a.orgId, 'contact_message', { name: 'x', email: 'x@example.com', message: 'hi' })
    expect(results).toEqual([])
  })
})

describe('applyResendEvent', () => {
  async function seedSentEmail(db: any, orgId: number, overrides: Record<string, unknown> = {}) {
    const [row] = await db
      .insert(schema.emailLog)
      .values({
        organizationId: orgId,
        template: 'saved_search_alert',
        kind: 'commercial',
        recipient: 'subscriber@example.com',
        fromHeader: 'X <x@example.com>',
        subject: 'Test',
        html: '<p>x</p>',
        status: 'sent',
        externalId: 're_test_1',
        attempts: 1,
        createdAt: '2026-01-01 00:00:00',
        ...overrides,
      })
      .returning()
    return row
  }

  it('email.delivered marks the row delivered — the ONLY thing that ever does', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'ResendDelivered')
    const row = await seedSentEmail(db, a.orgId)

    const result = await applyResendEvent(db, 'email.delivered', { email_id: 're_test_1' })
    expect(result.status).toBe('processed')

    const [updated] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.id, row.id))
    expect(updated.status).toBe('delivered')
    expect(updated.deliveredAt).toBeTruthy()
  })

  it('email.bounced marks the row bounced with the reason', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'ResendBounced')
    const row = await seedSentEmail(db, a.orgId, { externalId: 're_test_2' })

    await applyResendEvent(db, 'email.bounced', { email_id: 're_test_2', bounce: { message: 'Mailbox does not exist' } })
    const [updated] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.id, row.id))
    expect(updated.status).toBe('bounced')
    expect(updated.errorMessage).toBe('Mailbox does not exist')
  })

  it('email.complained on a commercial email marks it complained AND unsubscribes that recipient from the matching saved search', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'ResendComplained')
    const row = await seedSentEmail(db, a.orgId, { externalId: 're_test_3' })
    const [search] = await db
      .insert(schema.savedSearches)
      .values({ organizationId: a.orgId, email: 'subscriber@example.com', unsubscribeToken: 'tok123', active: 1, createdAt: '2026-01-01 00:00:00' })
      .returning()

    await applyResendEvent(db, 'email.complained', { email_id: 're_test_3' })

    const [updatedEmail] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.id, row.id))
    expect(updatedEmail.status).toBe('complained')

    const [updatedSearch] = await db.select().from(schema.savedSearches).where(eq(schema.savedSearches.id, search.id))
    expect(updatedSearch.active).toBe(0)
  })

  it('an event with no matching email_log row is ignored, not errored', async () => {
    const { db } = createTestDb()
    const result = await applyResendEvent(db, 'email.delivered', { email_id: 'never_sent' })
    expect(result.status).toBe('ignored')
  })

  it('an unrecognized event type is ignored, not errored', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'ResendUnhandled')
    await seedSentEmail(db, a.orgId, { externalId: 're_test_4' })
    const result = await applyResendEvent(db, 'email.opened', { email_id: 're_test_4' })
    expect(result.status).toBe('ignored')
  })
})
