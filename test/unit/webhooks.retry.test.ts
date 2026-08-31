import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { attemptWebhookDelivery, MAX_WEBHOOK_ATTEMPTS } from '../../server/utils/webhooks'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'

/**
 * dispatchWebhook() used to make exactly one delivery attempt and mark a
 * failure permanently 'failed' — no retry, despite webhook_deliveries.attempts
 * implying one was intended (docs/production-hardening-audit.md, P1-4).
 * attemptWebhookDelivery() is the extracted, reusable core (used by both the
 * initial synchronous dispatch and server/tasks/notifications/retry-webhook-queue.ts)
 * — these tests exercise it directly, same style as test/unit/email.send.test.ts
 * tests attemptSend() directly.
 */
afterEach(() => {
  vi.unstubAllGlobals()
})

function stubResponse(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status })),
  )
}

function stubNetworkError(message = 'fetch failed') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error(message)
    }),
  )
}

async function seedEndpointAndDelivery(db: any, orgId: number, opts: { active?: boolean } = {}) {
  const [endpoint] = await db
    .insert(schema.webhookEndpoints)
    .values({ organizationId: orgId, url: 'https://example.com/hook', secret: 'whsec_test', eventsJson: JSON.stringify(['lead.created']), active: opts.active === false ? 0 : 1, createdAt: '2026-01-01 00:00:00' })
    .returning()
  const [delivery] = await db
    .insert(schema.webhookDeliveries)
    .values({ endpointId: endpoint.id, event: 'lead.created', payloadJson: JSON.stringify({ event: 'lead.created', data: {} }), status: 'pending', attempts: 0, createdAt: '2026-01-01 00:00:00' })
    .returning()
  return { endpoint, delivery }
}

describe('attemptWebhookDelivery — successful delivery', () => {
  it('marks the delivery delivered and clears any retry schedule', async () => {
    stubResponse(200)
    const { db } = createTestDb()
    const t = await seedTenant(db, 'WebhookOk')
    const { delivery } = await seedEndpointAndDelivery(db, t.orgId)

    const result = await attemptWebhookDelivery(db, delivery.id)
    expect(result.status).toBe('delivered')

    const [row] = await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, delivery.id))
    expect(row.status).toBe('delivered')
    expect(row.attempts).toBe(1)
    expect(row.deliveredAt).toBeTruthy()
    expect(row.nextRetryAt).toBeFalsy()
  })
})

describe('attemptWebhookDelivery — failure queues a retry, not a permanent failure', () => {
  it('an HTTP error response queues the delivery with a backoff schedule', async () => {
    stubResponse(500)
    const { db } = createTestDb()
    const t = await seedTenant(db, 'WebhookHttpError')
    const { delivery } = await seedEndpointAndDelivery(db, t.orgId)

    const result = await attemptWebhookDelivery(db, delivery.id)
    expect(result.status).toBe('queued')

    const [row] = await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, delivery.id))
    expect(row.status).toBe('queued')
    expect(row.attempts).toBe(1)
    expect(row.responseCode).toBe(500)
    expect(row.nextRetryAt).toBeTruthy()
  })

  it('a network error also queues the delivery for retry', async () => {
    stubNetworkError()
    const { db } = createTestDb()
    const t = await seedTenant(db, 'WebhookNetworkError')
    const { delivery } = await seedEndpointAndDelivery(db, t.orgId)

    const result = await attemptWebhookDelivery(db, delivery.id)
    expect(result.status).toBe('queued')

    const [row] = await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, delivery.id))
    expect(row.errorMessage).toContain('fetch failed')
    expect(row.nextRetryAt).toBeTruthy()
  })

  it('gives up after MAX_WEBHOOK_ATTEMPTS ("dead letter")', async () => {
    stubResponse(500)
    const { db } = createTestDb()
    const t = await seedTenant(db, 'WebhookDeadLetter')
    const { delivery } = await seedEndpointAndDelivery(db, t.orgId)

    let last
    for (let i = 0; i < MAX_WEBHOOK_ATTEMPTS; i++) last = await attemptWebhookDelivery(db, delivery.id)

    expect(last?.status).toBe('failed')
    const [row] = await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, delivery.id))
    expect(row.status).toBe('failed')
    expect(row.attempts).toBe(MAX_WEBHOOK_ATTEMPTS)
    expect(row.nextRetryAt).toBeFalsy()
  })
})

describe('attemptWebhookDelivery — endpoint no longer valid', () => {
  it('a deactivated endpoint fails the delivery immediately, without a retry (not a transient failure)', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'WebhookDeactivated')
    const { delivery } = await seedEndpointAndDelivery(db, t.orgId, { active: false })

    const result = await attemptWebhookDelivery(db, delivery.id)
    expect(result.status).toBe('failed')

    const [row] = await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, delivery.id))
    expect(row.status).toBe('failed')
    expect(row.nextRetryAt).toBeFalsy()
  })

  it('a deleted endpoint fails the delivery immediately', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'WebhookDeleted')
    const { endpoint, delivery } = await seedEndpointAndDelivery(db, t.orgId)
    await db.delete(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, endpoint.id))

    const result = await attemptWebhookDelivery(db, delivery.id)
    expect(result.status).toBe('failed')
  })
})
