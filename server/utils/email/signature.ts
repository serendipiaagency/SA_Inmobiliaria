/**
 * Verifies Resend's inbound webhook signature. Resend signs webhooks via
 * Svix, which uses a different scheme from Stripe's (see
 * server/utils/stripe.ts#verifyStripeSignature for the Stripe one):
 *
 *  - secret is `whsec_<base64>` — the actual HMAC key is the base64-decoded
 *    bytes after that prefix.
 *  - signed content is `${svix-id}.${svix-timestamp}.${rawBody}` (note:
 *    includes the message id, unlike Stripe's timestamp-only payload).
 *  - HMAC-SHA256 of that content, base64-encoded (not hex).
 *  - `svix-signature` is a space-separated list of `v1,<base64>` tokens (a
 *    secret rotation can leave more than one simultaneously valid) — any
 *    single match is sufficient.
 *
 * `svix-id` doubles as the idempotency key for resend_webhook_events, the
 * same role Stripe's `event.id` plays.
 */

function base64ToBytes(b64: string): BufferSource {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface SvixHeaders {
  svixId: string | null | undefined
  svixTimestamp: string | null | undefined
  svixSignature: string | null | undefined
}

export async function verifyResendSignature(rawBody: string, headers: SvixHeaders, secret: string, toleranceSeconds = 300): Promise<boolean> {
  const { svixId, svixTimestamp, svixSignature } = headers
  if (!svixId || !svixTimestamp || !svixSignature) return false

  const timestamp = Number(svixTimestamp)
  if (!Number.isFinite(timestamp)) return false
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false

  const secretBytes = base64ToBytes(secret.replace(/^whsec_/, ''))
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  const expected = bytesToBase64(new Uint8Array(sig))

  const candidates = svixSignature
    .split(' ')
    .map((tok) => tok.split(',')[1])
    .filter(Boolean)

  return candidates.some((c) => timingSafeEqual(c, expected))
}
