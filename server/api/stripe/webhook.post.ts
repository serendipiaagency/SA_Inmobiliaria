import { eq } from 'drizzle-orm'
import { cfEnv, useDb, schema } from '../../utils/db'
import { verifyStripeSignature, applyStripeEvent } from '../../utils/stripe'

/**
 * Stripe's inbound webhook. Unauthenticated by session design — Stripe calls
 * this server-to-server, so trust comes entirely from the signature, not a
 * cookie. Configure the endpoint URL in the Stripe Dashboard as
 * `<origin>/api/stripe/webhook` and set STRIPE_WEBHOOK_SECRET as a Worker
 * secret (`wrangler secret put STRIPE_WEBHOOK_SECRET`) — see
 * docs/stripe-payments.md.
 *
 * Every step below exists because a webhook endpoint is a fully public POST
 * target: verify the signature before parsing anything as trusted, de-dupe
 * by Stripe's own event id (delivery is at-least-once, so redelivery is
 * normal, not an error), and never derive money amounts from the payload —
 * see applyStripeEvent()'s doc comment.
 */
export default defineEventHandler(async (event) => {
  const env = cfEnv(event)
  const secret = env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw createError({ statusCode: 503, statusMessage: 'Stripe webhooks not configured: STRIPE_WEBHOOK_SECRET is not set on this Worker.' })
  }

  const rawBody = await readRawBody(event, 'utf8')
  if (!rawBody) throw createError({ statusCode: 400, statusMessage: 'Empty body' })

  const signatureHeader = getHeader(event, 'stripe-signature')
  const validSignature = await verifyStripeSignature(rawBody, signatureHeader, secret)
  if (!validSignature) throw createError({ statusCode: 400, statusMessage: 'Invalid Stripe signature' })

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  const eventId: string | undefined = payload?.id
  const type: string | undefined = payload?.type
  const object = payload?.data?.object
  if (!eventId || !type) throw createError({ statusCode: 400, statusMessage: 'Malformed event' })

  const db = useDb(event)
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19)

  // Claim this event id BEFORE processing it, via the unique index on
  // event_id — not a check-then-insert (racy under Stripe's at-least-once,
  // occasionally-concurrent redelivery), but a single INSERT whose failure
  // mode (a unique-constraint violation) IS the "already claimed" signal.
  let claimedRowId: number
  try {
    const [row] = await db
      .insert(schema.stripeWebhookEvents)
      .values({ eventId, type, payloadJson: rawBody, processedOk: 0, receivedAt: nowIso })
      .returning({ id: schema.stripeWebhookEvents.id })
    claimedRowId = row.id
  } catch (e: any) {
    // D1's error surfaces as an H3Error whose own .message is a generic
    // "Failed query: ..." — the actual SQLITE_CONSTRAINT text is one level
    // deeper, on .cause (and possibly .cause.cause, depending on how the D1
    // driver wraps it) — check the whole chain rather than assume a depth.
    const chain = [e, e?.cause, e?.cause?.cause].filter(Boolean).map((x) => String(x?.message || x)).join(' | ')
    if (chain.includes('UNIQUE constraint failed')) {
      // Stripe redelivering an event we've already recorded — acknowledge without reprocessing.
      setResponseStatus(event, 200)
      return { received: true, duplicate: true }
    }
    throw e
  }

  const result = await applyStripeEvent(db, env, type, object)

  await db
    .update(schema.stripeWebhookEvents)
    .set({ organizationId: result.organizationId ?? null, depositId: result.depositId ?? null, processedOk: 1, note: result.note })
    .where(eq(schema.stripeWebhookEvents.id, claimedRowId))

  setResponseStatus(event, 200)
  return { received: true, status: result.status }
})
