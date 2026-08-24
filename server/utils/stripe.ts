import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'
import { sendTransactionalEmail } from './email/send'
import type { TemplateKey } from './email/templates'

interface StripeCheckoutResult {
  ok: boolean
  connected: boolean
  message: string
  checkoutUrl?: string
  sessionId?: string
}

/**
 * Real Stripe Checkout Session creation via the plain REST API (no SDK — keeps
 * the Worker bundle small and avoids Node-only deps). Honestly reports
 * `connected:false` until STRIPE_SECRET_KEY is set as a Worker secret, the
 * same pattern used by sendEmail() and the Publication Scheduler's channel
 * adapters: never fake a checkout link that doesn't actually charge anything.
 */
export async function createDepositCheckout(
  env: Record<string, any>,
  opts: { amount: number; currency: string; description: string; successUrl: string; cancelUrl: string },
): Promise<StripeCheckoutResult> {
  const secretKey = env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return { ok: false, connected: false, message: 'Pagos no conectados: falta configurar el secreto STRIPE_SECRET_KEY en el Worker.' }
  }

  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': opts.currency,
    'line_items[0][price_data][product_data][name]': opts.description,
    'line_items[0][price_data][unit_amount]': String(Math.round(opts.amount * 100)),
    'line_items[0][quantity]': '1',
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  })

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const json: any = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, connected: true, message: json?.error?.message || `Stripe devolvió ${res.status}` }
    return { ok: true, connected: true, message: 'Sesión de pago creada', checkoutUrl: json.url, sessionId: json.id }
  } catch (e: any) {
    return { ok: false, connected: true, message: e?.message || 'Error de red al contactar con Stripe' }
  }
}

export async function retrieveCheckoutSession(
  env: Record<string, any>,
  sessionId: string,
): Promise<{ ok: boolean; connected: boolean; status?: string; paymentStatus?: string; paymentIntentId?: string | null; message: string }> {
  const secretKey = env.STRIPE_SECRET_KEY
  if (!secretKey) return { ok: false, connected: false, message: 'Pagos no conectados: falta configurar el secreto STRIPE_SECRET_KEY en el Worker.' }

  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${secretKey}` } })
    const json: any = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, connected: true, message: json?.error?.message || `Stripe devolvió ${res.status}` }
    return { ok: true, connected: true, status: json.status, paymentStatus: json.payment_status, paymentIntentId: json.payment_intent || null, message: 'OK' }
  } catch (e: any) {
    return { ok: false, connected: true, message: e?.message || 'Error de red al contactar con Stripe' }
  }
}

// ---------------------------------------------------------------------------
// Inbound webhook — signature verification + idempotent event handling
// ---------------------------------------------------------------------------

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Verifies a `Stripe-Signature` header per Stripe's documented scheme:
 * header is `t=<unix ts>,v1=<hex hmac>[,v1=<hex hmac>...]` (Stripe sends one
 * `v1` per configured signing secret during a rotation, hence the array —
 * any single match is sufficient), the signed payload is `${t}.${rawBody}`,
 * HMAC-SHA256 keyed by the webhook signing secret. `toleranceSeconds` rejects
 * a stale signature (replay protection) — Stripe's own SDKs default to 300s.
 */
export async function verifyStripeSignature(rawBody: string, signatureHeader: string | null | undefined, secret: string, toleranceSeconds = 300): Promise<boolean> {
  if (!signatureHeader) return false
  const parts = Object.fromEntries(
    signatureHeader
      .split(',')
      .map((p) => p.split('=') as [string, string])
      .filter((p) => p.length === 2),
  )
  const timestampRaw = (parts as any).t
  const candidates = signatureHeader
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3))
  if (!timestampRaw || !candidates.length) return false

  const timestamp = Number(timestampRaw)
  if (!Number.isFinite(timestamp)) return false
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false

  const expected = await hmacSha256Hex(secret, `${timestampRaw}.${rawBody}`)
  return candidates.some((c) => timingSafeEqualHex(c, expected))
}

export interface StripeApplyResult {
  status: 'processed' | 'ignored'
  depositId?: number
  organizationId?: number
  note: string
}

/**
 * Applies one already-signature-verified, already-deduplicated Stripe event
 * to deposit_payments. Never reads an amount off the event — the amount was
 * set server-side when the Checkout Session was created
 * (server/api/admin/saas/deposits.post.ts) and is never revisited; the
 * webhook is only ever trusted for STATUS, which is exactly what makes it
 * trustworthy (Stripe, not the browser, is the one calling this endpoint,
 * and the signature proves that).
 */
export async function applyStripeEvent(db: any, env: Record<string, any>, type: string, object: any): Promise<StripeApplyResult> {
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19)

  const findBySession = async (sessionId: string) => (await db.select().from(schema.depositPayments).where(eq(schema.depositPayments.stripeCheckoutSessionId, sessionId)).limit(1))[0]
  const findByPaymentIntent = async (paymentIntentId: string) =>
    (await db.select().from(schema.depositPayments).where(eq(schema.depositPayments.stripePaymentIntentId, paymentIntentId)).limit(1))[0]

  // "depósito recibido" / "pago fallido" — best-effort: the deposit's own
  // status is already correctly updated regardless of whether the client
  // can be emailed at all (no contract, no clientEmail on it).
  const notifyClient = async (deposit: any, template: TemplateKey) => {
    if (!deposit.contractId) return
    try {
      const [contract] = await db.select({ clientEmail: schema.contracts.clientEmail }).from(schema.contracts).where(eq(schema.contracts.id, deposit.contractId)).limit(1)
      if (contract?.clientEmail) await sendTransactionalEmail(db, env, { organizationId: deposit.organizationId, template, to: contract.clientEmail, data: { amount: deposit.amount } })
    } catch {
      // The deposit's own status is already saved — a notification failure must never undo that.
    }
  }

  switch (type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const deposit = await findBySession(object.id)
      if (!deposit) return { status: 'ignored', note: 'No hay depósito con esa sesión de Checkout' }
      const paid = object.payment_status === 'paid'
      await db
        .update(schema.depositPayments)
        .set({
          status: paid ? 'paid' : 'processing',
          paidAt: paid ? nowIso : deposit.paidAt,
          stripePaymentIntentId: object.payment_intent || deposit.stripePaymentIntentId,
        })
        .where(eq(schema.depositPayments.id, deposit.id))
      if (paid) await notifyClient(deposit, 'deposit_received')
      return { status: 'processed', depositId: deposit.id, organizationId: deposit.organizationId, note: paid ? 'Marcado como pagado' : 'Sesión completada, pago aún pendiente' }
    }
    case 'checkout.session.async_payment_failed': {
      const deposit = await findBySession(object.id)
      if (!deposit) return { status: 'ignored', note: 'No hay depósito con esa sesión de Checkout' }
      await db.update(schema.depositPayments).set({ status: 'failed', errorMessage: 'El pago asíncrono no se completó' }).where(eq(schema.depositPayments.id, deposit.id))
      await notifyClient(deposit, 'payment_failed')
      return { status: 'processed', depositId: deposit.id, organizationId: deposit.organizationId, note: 'Marcado como fallido (pago asíncrono)' }
    }
    case 'payment_intent.payment_failed': {
      const deposit = await findByPaymentIntent(object.id)
      if (!deposit) return { status: 'ignored', note: 'No hay depósito con ese payment_intent' }
      const reason = object.last_payment_error?.message || 'El pago falló'
      await db.update(schema.depositPayments).set({ status: 'failed', errorMessage: reason }).where(eq(schema.depositPayments.id, deposit.id))
      await notifyClient(deposit, 'payment_failed')
      return { status: 'processed', depositId: deposit.id, organizationId: deposit.organizationId, note: `Marcado como fallido: ${reason}` }
    }
    case 'charge.refunded': {
      const paymentIntentId = object.payment_intent
      if (!paymentIntentId) return { status: 'ignored', note: 'El cargo no tiene payment_intent asociado' }
      const deposit = await findByPaymentIntent(paymentIntentId)
      if (!deposit) return { status: 'ignored', note: 'No hay depósito con ese payment_intent' }
      await db.update(schema.depositPayments).set({ status: 'refunded', refundedAt: nowIso }).where(eq(schema.depositPayments.id, deposit.id))
      return { status: 'processed', depositId: deposit.id, organizationId: deposit.organizationId, note: 'Marcado como reembolsado' }
    }
    default:
      return { status: 'ignored', note: `Tipo de evento no gestionado: ${type}` }
  }
}
