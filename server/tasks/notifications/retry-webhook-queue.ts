import { and, eq, lte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'
import { attemptWebhookDelivery, MAX_WEBHOOK_ATTEMPTS } from '../../utils/webhooks'

/**
 * Runs hourly (see nuxt.config.ts scheduledTasks + wrangler.toml [triggers])
 * — the failure queue for outbound webhooks, same shape as
 * notifications:retry-email-queue: picks up every webhook_deliveries row
 * still 'queued' whose next_retry_at has arrived and retries it via the
 * exact same attemptWebhookDelivery() the initial synchronous dispatch
 * uses (each row is self-contained — event/payload were saved at creation,
 * endpoint url/secret are re-fetched fresh — so a retry never needs the
 * caller's original request context). Cross-tenant by design, same
 * reasoning as every other cron task here.
 */
export default defineTask<{ skipped: true; reason: string } | { checked: number; delivered: number; stillQueued: number; failed: number }>({
  meta: {
    name: 'notifications:retry-webhook-queue',
    description: 'Retries webhook_deliveries rows still queued past their backoff window',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })

    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const due = await db
      .select({ id: schema.webhookDeliveries.id, attempts: schema.webhookDeliveries.attempts })
      .from(schema.webhookDeliveries)
      .where(and(eq(schema.webhookDeliveries.status, 'queued'), lte(schema.webhookDeliveries.nextRetryAt, nowIso)))

    let delivered = 0
    let stillQueued = 0
    let failed = 0
    for (const row of due) {
      if (row.attempts >= MAX_WEBHOOK_ATTEMPTS) continue // safety net; attemptWebhookDelivery() already stops scheduling further retries at this point
      const result = await attemptWebhookDelivery(db, row.id)
      if (result.status === 'delivered') delivered++
      else if (result.status === 'failed') failed++
      else stillQueued++
    }

    return { result: { checked: due.length, delivered, stillQueued, failed } }
  },
})
