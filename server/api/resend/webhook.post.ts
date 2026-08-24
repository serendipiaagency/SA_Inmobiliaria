import { eq } from 'drizzle-orm'
import { cfEnv, useDb, schema } from '../../utils/db'
import { verifyResendSignature } from '../../utils/email/signature'
import { applyResendEvent } from '../../utils/email/resendEvents'

/**
 * Resend's inbound webhook (delivered/bounced/complained — see
 * docs/resend-email.md for the Dashboard setup). Same shape as
 * server/api/stripe/webhook.post.ts: unauthenticated (trust comes from the
 * signature, not a session), verify before parsing anything as trusted,
 * claim the event id before processing it (Svix redelivers — this must be
 * idempotent, not just "usually only called once").
 */
export default defineEventHandler(async (event) => {
  const env = cfEnv(event)
  const secret = env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    throw createError({ statusCode: 503, statusMessage: 'Resend webhooks not configured: RESEND_WEBHOOK_SECRET is not set on this Worker.' })
  }

  const rawBody = await readRawBody(event, 'utf8')
  if (!rawBody) throw createError({ statusCode: 400, statusMessage: 'Empty body' })

  const svixId = getHeader(event, 'svix-id')
  const svixTimestamp = getHeader(event, 'svix-timestamp')
  const svixSignature = getHeader(event, 'svix-signature')
  const validSignature = await verifyResendSignature(rawBody, { svixId, svixTimestamp, svixSignature }, secret)
  if (!validSignature) throw createError({ statusCode: 400, statusMessage: 'Invalid Resend/Svix signature' })

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  const type: string | undefined = payload?.type
  const data = payload?.data
  if (!svixId || !type) throw createError({ statusCode: 400, statusMessage: 'Malformed event' })

  const db = useDb(event)
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19)

  let claimedRowId: number
  try {
    const [row] = await db
      .insert(schema.resendWebhookEvents)
      .values({ svixId, type, payloadJson: rawBody, processedOk: 0, receivedAt: nowIso })
      .returning({ id: schema.resendWebhookEvents.id })
    claimedRowId = row.id
  } catch (e: any) {
    const chain = [e, e?.cause, e?.cause?.cause].filter(Boolean).map((x) => String(x?.message || x)).join(' | ')
    if (chain.includes('UNIQUE constraint failed')) {
      setResponseStatus(event, 200)
      return { received: true, duplicate: true }
    }
    throw e
  }

  const result = await applyResendEvent(db, type, data)

  await db
    .update(schema.resendWebhookEvents)
    .set({ organizationId: result.organizationId ?? null, emailLogId: result.emailLogId ?? null, processedOk: 1, note: result.note })
    .where(eq(schema.resendWebhookEvents.id, claimedRowId))

  setResponseStatus(event, 200)
  return { received: true, status: result.status }
})
