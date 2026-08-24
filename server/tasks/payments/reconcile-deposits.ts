import { and, eq, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'
import { retrieveCheckoutSession } from '../../utils/stripe'

/**
 * Runs hourly (see nuxt.config.ts scheduledTasks + wrangler.toml [triggers])
 * — catches any deposit whose real Stripe status the webhook
 * (server/api/stripe/webhook.post.ts) never confirmed: a missed delivery, a
 * transient failure on our end, or a webhook that was configured after the
 * checkout link had already been sent. Only touches rows still 'processing'
 * and at least 15 minutes old, so it never races the webhook for a payment
 * that's simply still in flight. Cross-tenant by design, same reasoning as
 * every other cron task here — a platform-level Cron Trigger has no single
 * org's request context, and each row is updated with its own organization's
 * data untouched.
 */
export default defineTask<{ skipped: true; reason: string } | { checked: number; updated: number }>({
  meta: {
    name: 'payments:reconcile-deposits',
    description: 'Polls Stripe for deposit_payments stuck in "processing" that the webhook never confirmed',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })

    const cutoff = new Date(Date.now() - 15 * 60_000).toISOString().replace('T', ' ').slice(0, 19)
    const stuck = await db
      .select()
      .from(schema.depositPayments)
      .where(and(eq(schema.depositPayments.status, 'processing'), lt(schema.depositPayments.createdAt, cutoff)))

    let updated = 0
    for (const deposit of stuck) {
      if (!deposit.stripeCheckoutSessionId) continue
      const result = await retrieveCheckoutSession(env, deposit.stripeCheckoutSessionId)
      if (!result.ok) continue // not connected, or a transient Stripe/network error — leave it for the next tick

      const paid = result.paymentStatus === 'paid'
      const failed = result.status === 'expired' || result.paymentStatus === 'unpaid'
      if (!paid && !failed) continue // still genuinely pending — nothing to reconcile yet

      await db
        .update(schema.depositPayments)
        .set({
          status: paid ? 'paid' : 'failed',
          paidAt: paid ? new Date().toISOString().replace('T', ' ').slice(0, 19) : deposit.paidAt,
          errorMessage: failed ? 'La sesión de Checkout expiró sin completarse' : deposit.errorMessage,
          stripePaymentIntentId: result.paymentIntentId || deposit.stripePaymentIntentId,
        })
        .where(eq(schema.depositPayments.id, deposit.id))
      updated++
    }

    return { result: { checked: stuck.length, updated } }
  },
})
