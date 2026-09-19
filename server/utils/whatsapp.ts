/**
 * WhatsApp saliente por Twilio (Messages API).
 *
 * ## Por qué Twilio
 *
 * La API de WhatsApp Business exige una cuenta de Meta Business verificada,
 * un número dedicado y plantillas aprobadas antes de mandar nada; Twilio
 * pone lo mismo detrás de una llamada HTTP con usuario y contraseña, tiene
 * sandbox para probar sin aprobación y su webhook de estado dice si el
 * mensaje llegó. Es el camino más corto entre "no conectado" y "conectado
 * de verdad", y el que ya se mencionaba en el propio código.
 *
 * ## Qué se necesita
 *
 *   TWILIO_ACCOUNT_SID     ACxxxxxxxx (Console → Account info)
 *   TWILIO_AUTH_TOKEN      el token de la cuenta (también firma el webhook)
 *   TWILIO_WHATSAPP_FROM   el remitente: +14155238886 (sandbox) o tu número
 *                          aprobado, con o sin el prefijo "whatsapp:"
 *
 * Sin los tres, `isWhatsAppConfigured` es false y todo sigue como antes: el
 * aviso se registra como no entregado con el motivo, nunca como enviado.
 *
 * ## Límite real de WhatsApp que esto no puede saltarse
 *
 * Un negocio sólo puede escribir libremente dentro de las 24 h siguientes al
 * último mensaje del cliente; fuera de esa ventana WhatsApp exige una
 * plantilla aprobada (en Twilio, un Content SID). Un recordatorio de cita 24
 * h después de la reserva cae casi siempre fuera. Por eso, si se configura
 * TWILIO_WHATSAPP_CONTENT_SID, los avisos se mandan con esa plantilla
 * (variable {{1}} = el texto del aviso); si no, se manda el texto tal cual,
 * que funciona en el sandbox y dentro de la ventana, y Twilio devuelve el
 * error 63016 fuera de ella — que queda registrado, no escondido.
 *
 * Puro salvo `fetchImpl`, inyectable para las pruebas.
 */

export interface WhatsAppSendResult {
  ok: boolean
  /** Había credenciales; distingue "no configurado" de "Twilio lo rechazó". */
  connected: boolean
  /** El SID del mensaje en Twilio (SMxxxx): la clave con la que el webhook de estado lo encuentra después. */
  sid: string | null
  status: string | null
  message: string
}

const NOT_CONFIGURED_MESSAGE = 'WhatsApp no conectado: requiere configurar TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_FROM en el Worker.'

export function isWhatsAppConfigured(env: Record<string, any> | undefined): boolean {
  return Boolean(env?.TWILIO_ACCOUNT_SID && env?.TWILIO_AUTH_TOKEN && env?.TWILIO_WHATSAPP_FROM)
}

/**
 * Deja un teléfono como lo quiere Twilio: `whatsapp:+<E.164>`. Acepta
 * espacios, guiones y paréntesis; un número sin `+` sólo se admite si hay
 * un prefijo por defecto (WHATSAPP_DEFAULT_COUNTRY_PREFIX, p. ej. "+34"),
 * porque adivinar el país es la forma de escribirle a un desconocido.
 */
export function toWhatsAppAddress(phone: string, defaultCountryPrefix?: string | null): string | null {
  let digits = String(phone || '')
    .trim()
    .replace(/^whatsapp:/i, '')
    .replace(/[\s().-]/g, '')
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`
  if (!digits.startsWith('+')) {
    if (!defaultCountryPrefix) return null
    digits = `${defaultCountryPrefix}${digits.replace(/^0+/, '')}`
  }
  if (!/^\+[1-9]\d{6,14}$/.test(digits)) return null
  return `whatsapp:${digits}`
}

export async function sendWhatsAppMessage(
  env: Record<string, any> | undefined,
  input: { to: string; body: string; statusCallbackUrl?: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured(env)) return { ok: false, connected: false, sid: null, status: null, message: NOT_CONFIGURED_MESSAGE }
  const e = env as Record<string, any>

  const to = toWhatsAppAddress(input.to, e.WHATSAPP_DEFAULT_COUNTRY_PREFIX)
  if (!to) return { ok: false, connected: true, sid: null, status: null, message: `Teléfono no válido para WhatsApp: "${input.to}" (hace falta prefijo internacional, p. ej. +34…).` }
  const from = toWhatsAppAddress(String(e.TWILIO_WHATSAPP_FROM), null)
  if (!from) return { ok: false, connected: true, sid: null, status: null, message: 'TWILIO_WHATSAPP_FROM no es un número válido (usa +<país><número>).' }

  const form = new URLSearchParams({ From: from, To: to })
  if (e.TWILIO_WHATSAPP_CONTENT_SID) {
    form.set('ContentSid', String(e.TWILIO_WHATSAPP_CONTENT_SID))
    form.set('ContentVariables', JSON.stringify({ '1': input.body }))
  } else {
    form.set('Body', input.body)
  }
  if (input.statusCallbackUrl) form.set('StatusCallback', input.statusCallbackUrl)

  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(String(e.TWILIO_ACCOUNT_SID))}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`)}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    let json: any = null
    try {
      json = await res.json()
    } catch {
      json = null
    }
    if (!res.ok) {
      const detail = json?.message ? `${json.message}${json.code ? ` (código ${json.code})` : ''}` : `HTTP ${res.status}`
      return { ok: false, connected: true, sid: json?.sid ?? null, status: json?.status ?? null, message: `Twilio rechazó el envío: ${detail}` }
    }
    return { ok: true, connected: true, sid: json?.sid ?? null, status: json?.status ?? 'queued', message: 'Aceptado por Twilio' }
  } catch (err: any) {
    return { ok: false, connected: true, sid: null, status: null, message: `No se pudo contactar con Twilio: ${err?.message || 'error de red'}` }
  }
}

// --- webhook de estado --------------------------------------------------------

/**
 * Firma de Twilio (X-Twilio-Signature): HMAC-SHA1 con el auth token sobre la
 * URL completa del webhook seguida de cada parámetro POST ordenado por
 * nombre, concatenando nombre+valor sin separadores, en base64.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export async function computeTwilioSignature(url: string, params: Record<string, string>, authToken: string): Promise<string> {
  const data = url + Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  let binary = ''
  for (const b of sig) binary += String.fromCharCode(b)
  return btoa(binary)
}

export async function verifyTwilioSignature(url: string, params: Record<string, string>, authToken: string, signature: string | null | undefined): Promise<boolean> {
  if (!signature) return false
  const expected = await computeTwilioSignature(url, params, authToken)
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

/** Estados de Twilio que significan "ha llegado", "no ha llegado", o "todavía nada". */
export function classifyTwilioStatus(status: string): 'delivered' | 'failed' | 'pending' {
  const s = String(status || '').toLowerCase()
  if (s === 'delivered' || s === 'read') return 'delivered'
  if (s === 'failed' || s === 'undelivered' || s === 'canceled') return 'failed'
  return 'pending'
}
