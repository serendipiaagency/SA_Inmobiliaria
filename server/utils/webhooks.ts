import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from './db'

export type WebhookEvent = 'lead.created' | 'deal.closed' | 'visit.booked' | 'contract.accepted' | 'referral.converted'

async function hmacSign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Real outbound delivery — every registered, active endpoint subscribed to
 * this event gets a genuine signed HTTP POST, awaited inline (same
 * synchronous pattern this codebase already uses for email/notifications,
 * not a fire-and-forget queue this project has no infrastructure for). Every
 * attempt — success or failure — is recorded honestly in webhook_deliveries;
 * a delivery failure here never throws and never blocks the caller's own
 * response.
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

      let status = 'failed'
      let responseCode: number | null = null
      let errorMessage: string | null = null
      try {
        const signature = await hmacSign(ep.secret, bodyStr)
        const res = await fetch(ep.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': `sha256=${signature}`, 'X-Webhook-Event': eventName },
          body: bodyStr,
        })
        responseCode = res.status
        status = res.ok ? 'delivered' : 'failed'
        if (!res.ok) errorMessage = `El endpoint respondió HTTP ${res.status}`
      } catch (err: any) {
        errorMessage = err?.message || 'Error de red al entregar el webhook'
      }

      const nowTs = now()
      await db.insert(schema.webhookDeliveries).values({
        endpointId: ep.id,
        event: eventName,
        payloadJson: bodyStr,
        status,
        responseCode,
        errorMessage,
        attempts: 1,
        createdAt: nowTs,
        deliveredAt: status === 'delivered' ? nowTs : null,
      })
    }
  } catch {
    // A webhook failure must never break the feature that triggered it (a lead being created, a deal being closed, etc).
  }
}
