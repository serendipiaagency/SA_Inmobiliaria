interface ResendSendResult {
  ok: boolean
  connected: boolean
  id?: string
  message: string
}

/**
 * Low-level Resend send — no SDK, plain fetch, same reasoning as
 * server/utils/stripe.ts. Honestly reports `connected:false` until
 * RESEND_API_KEY is set as a Worker secret rather than faking a delivery.
 * `id` is Resend's own email id — the only handle the webhook
 * (server/api/resend/webhook.post.ts) has to later confirm real delivery.
 */
export async function callResendApi(
  env: Record<string, any>,
  input: { from: string; to: string; replyTo?: string | null; subject: string; html: string },
): Promise<ResendSendResult> {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, connected: false, message: 'Email no conectado: falta configurar el secreto RESEND_API_KEY en el Worker.' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: input.from, to: input.to, reply_to: input.replyTo || undefined, subject: input.subject, html: input.html }),
    })
    const json: any = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, connected: true, message: json?.message || `Resend devolvió ${res.status}` }
    }
    return { ok: true, connected: true, id: json?.id, message: 'Enviado' }
  } catch (e: any) {
    return { ok: false, connected: true, message: e?.message || 'Error de red al enviar el email' }
  }
}

/**
 * Checks whether `domain` is a verified sending domain in this Resend
 * account (Dashboard → Domains). Used when an org saves its sender email —
 * "email remitente validado" is a real check against Resend, never a manual
 * toggle. Returns null (unknown) rather than false when it can't check
 * (no API key, network error) — an org's sender should never be silently
 * marked unverified just because we failed to ask.
 */
export async function checkResendDomainVerified(env: Record<string, any>, domain: string): Promise<boolean | null> {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey || !domain) return null

  try {
    const res = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) return null
    const json: any = await res.json().catch(() => null)
    const match = (json?.data || []).find((d: any) => String(d?.name || '').toLowerCase() === domain.toLowerCase())
    if (!match) return false
    return match.status === 'verified'
  } catch {
    return null
  }
}
