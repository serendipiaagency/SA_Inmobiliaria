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
): Promise<{ ok: boolean; connected: boolean; status?: string; paymentStatus?: string; message: string }> {
  const secretKey = env.STRIPE_SECRET_KEY
  if (!secretKey) return { ok: false, connected: false, message: 'Pagos no conectados: falta configurar el secreto STRIPE_SECRET_KEY en el Worker.' }

  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${secretKey}` } })
    const json: any = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, connected: true, message: json?.error?.message || `Stripe devolvió ${res.status}` }
    return { ok: true, connected: true, status: json.status, paymentStatus: json.payment_status, message: 'OK' }
  } catch (e: any) {
    return { ok: false, connected: true, message: e?.message || 'Error de red al contactar con Stripe' }
  }
}
