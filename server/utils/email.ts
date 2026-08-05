interface SendEmailInput {
  to: string
  subject: string
  html: string
}

interface SendEmailResult {
  ok: boolean
  connected: boolean
  message: string
}

/**
 * Real transactional email via Resend's HTTP API — no SDK, just fetch, so it
 * costs nothing to keep here unused. Honestly reports `connected:false`
 * until RESEND_API_KEY is set as a Worker secret, the same pattern the
 * Publication Scheduler's channel adapters use: never fake a delivery that
 * didn't happen.
 */
export async function sendEmail(env: Record<string, any>, input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, connected: false, message: 'Email no conectado: falta configurar el secreto RESEND_API_KEY en el Worker.' }
  }

  const from = env.NOTIFICATIONS_FROM_EMAIL || 'notificaciones@sa-inmobiliaria.com'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, connected: true, message: `Resend devolvió ${res.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true, connected: true, message: 'Enviado' }
  } catch (e: any) {
    return { ok: false, connected: true, message: e?.message || 'Error de red al enviar el email' }
  }
}
