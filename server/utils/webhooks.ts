import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from './db'
import { getRequestId } from './requestId'

export type WebhookEvent = 'lead.created' | 'deal.closed' | 'visit.booked' | 'contract.accepted' | 'referral.converted'

/** Retry backoff schedule in minutes — 5 attempts total, then permanently 'failed' ("dead letter"). Same schedule as email_log (server/utils/email/send.ts). */
export const MAX_WEBHOOK_ATTEMPTS = 5
const RETRY_DELAYS_MINUTES = [2, 10, 30, 120, 360]

function addMinutesIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString().replace('T', ' ').slice(0, 19)
}

async function hmacSign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * One real delivery attempt against a webhook_deliveries row + the
 * bookkeeping around it — reads everything it needs (event/payload) off the
 * row and the endpoint (url/secret, re-fetched fresh so a rotated secret or
 * a deactivated endpoint is respected on retry, not just at the original
 * send), so it's equally usable for the initial synchronous attempt
 * (dispatchWebhook below) and for the retry task
 * (server/tasks/notifications/retry-webhook-queue.ts) picking the same row
 * back up later — same shape as attemptSend() for email.
 */
export async function attemptWebhookDelivery(db: any, deliveryId: number): Promise<{ status: 'delivered' | 'queued' | 'failed' }> {
  const [delivery] = await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, deliveryId)).limit(1)
  if (!delivery) return { status: 'failed' }
  const [endpoint] = await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, delivery.endpointId)).limit(1)
  const attempts = (delivery.attempts ?? 0) + 1

  if (!endpoint || !endpoint.active) {
    // Deleted or deactivated since this delivery was queued — a real
    // dead end, not a transient network failure worth retrying.
    await db
      .update(schema.webhookDeliveries)
      .set({ status: 'failed', attempts, errorMessage: 'El endpoint fue eliminado o desactivado', nextRetryAt: null })
      .where(eq(schema.webhookDeliveries.id, deliveryId))
    return { status: 'failed' }
  }

  let responseCode: number | null = null
  let errorMessage: string | null = null
  let delivered = false
  try {
    const signature = await hmacSign(endpoint.secret, delivery.payloadJson)
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': `sha256=${signature}`, 'X-Webhook-Event': delivery.event },
      body: delivery.payloadJson,
    })
    responseCode = res.status
    delivered = res.ok
    if (!delivered) errorMessage = `El endpoint respondió HTTP ${res.status}`
  } catch (err: any) {
    errorMessage = err?.message || 'Error de red al entregar el webhook'
  }

  if (delivered) {
    await db
      .update(schema.webhookDeliveries)
      .set({ status: 'delivered', responseCode, errorMessage: null, attempts, deliveredAt: now(), nextRetryAt: null })
      .where(eq(schema.webhookDeliveries.id, deliveryId))
    return { status: 'delivered' }
  }

  const exhausted = attempts >= MAX_WEBHOOK_ATTEMPTS
  await db
    .update(schema.webhookDeliveries)
    .set({
      status: exhausted ? 'failed' : 'queued',
      responseCode,
      errorMessage,
      attempts,
      nextRetryAt: exhausted ? null : addMinutesIso(RETRY_DELAYS_MINUTES[Math.min(attempts - 1, RETRY_DELAYS_MINUTES.length - 1)]),
    })
    .where(eq(schema.webhookDeliveries.id, deliveryId))
  return { status: exhausted ? 'failed' : 'queued' }
}

/**
 * Real outbound delivery — every registered, active endpoint subscribed to
 * this event gets a genuine signed HTTP POST, awaited inline (same
 * synchronous pattern this codebase already uses for email/notifications,
 * not a fire-and-forget queue this project has no infrastructure for). A
 * failed first attempt is queued for retry
 * (server/tasks/notifications/retry-webhook-queue.ts), same pattern as
 * email's failure queue, not silently dropped — a delivery failure here
 * never throws and never blocks the caller's own response.
 */
export async function dispatchWebhook(event: H3Event, orgId: number, eventName: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  try {
    const db = useDb(event)
    const endpoints = await db.select().from(schema.webhookEndpoints).where(and(eq(schema.webhookEndpoints.organizationId, orgId), eq(schema.webhookEndpoints.active, 1)))
    if (!endpoints.length) return

    const bodyStr = JSON.stringify({ event: eventName, data: payload, timestamp: now() })

    for (const ep of endpoints) {
      let subscribed: string[] = []
      try {
        subscribed = JSON.parse(ep.eventsJson || '[]')
      } catch {
        subscribed = []
      }
      if (!subscribed.includes(eventName) && !subscribed.includes('*')) continue

      const [delivery] = await db
        .insert(schema.webhookDeliveries)
        .values({ endpointId: ep.id, event: eventName, payloadJson: bodyStr, status: 'pending', attempts: 0, createdAt: now(), requestId: getRequestId(event) })
        .returning({ id: schema.webhookDeliveries.id })
      await attemptWebhookDelivery(db, delivery.id)
    }
  } catch {
    // A webhook failure must never break the feature that triggered it (a lead being created, a deal being closed, etc).
  }
}
