/**
 * Teléfonos del Centro de Comunicaciones. Todo lo que entra (un teléfono
 * escrito a mano en la ficha de un cliente, el `wa_id` de un webhook de Meta,
 * el `From: whatsapp:+…` de Twilio) se reduce aquí a **E.164 con "+"**, que
 * es la única forma que se guarda en `comms_contacts.phone_e164` y con la
 * que se cruza contra `clients.phone` y `leads.phone`.
 *
 * Sin dependencias: se prueba en aislamiento (test/unit/comms.phone.test.ts).
 */

const E164_RE = /^\+[1-9]\d{6,14}$/

/**
 * Normaliza a `+E.164`. Acepta espacios, guiones, paréntesis, puntos, el
 * prefijo `whatsapp:` de Twilio y `00` como prefijo internacional. Un número
 * sin prefijo internacional sólo pasa con un `defaultCountryPrefix`
 * explícito (p. ej. "+34"): adivinar el país es la forma de escribirle a un
 * desconocido.
 */
export function normalizePhone(input: string | null | undefined, defaultCountryPrefix?: string | null): string | null {
  let digits = String(input || '')
    .trim()
    .replace(/^whatsapp:/i, '')
    .replace(/^tel:/i, '')
    .replace(/[\s().-]/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`
  if (!digits.startsWith('+')) {
    // Un wa_id de Meta llega sin "+" pero ya con el país (34600112233). Sólo
    // se puede tratar así cuando NO hay prefijo por defecto que aplicar y
    // el número tiene longitud de internacional: con prefijo, lo que llega
    // sin "+" es un número local.
    if (defaultCountryPrefix) {
      const prefix = String(defaultCountryPrefix).trim().replace(/[\s().-]/g, '')
      if (!/^\+[1-9]\d{0,3}$/.test(prefix)) return null
      digits = `${prefix}${digits.replace(/^0+/, '')}`
    } else if (digits.length >= 10) {
      digits = `+${digits}`
    } else {
      return null
    }
  }
  return E164_RE.test(digits) ? digits : null
}

/** El identificador de WhatsApp de un teléfono: E.164 sin "+". */
export function phoneToWaId(phoneE164: string): string {
  return phoneE164.replace(/^\+/, '')
}

/** Lo inverso: un `wa_id` (34600112233) a `+34600112233`. */
export function waIdToPhone(waId: string | null | undefined): string | null {
  return normalizePhone(waId ? `+${String(waId).replace(/^\+/, '')}` : null)
}

/** Los últimos `n` dígitos, para un LIKE que encuentre el mismo número escrito de otra forma. */
export function phoneTail(phone: string, n = 9): string {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.slice(-n)
}

/** Formato legible: `+34 600 112 233`. Sólo para mostrar; nunca se guarda así. */
export function formatPhone(phoneE164: string | null | undefined): string {
  if (!phoneE164) return ''
  const m = phoneE164.match(/^\+(\d{1,3})(\d+)$/)
  if (!m) return phoneE164
  const rest = m[2].replace(/(\d{3})(?=\d)/g, '$1 ')
  return `+${m[1]} ${rest}`
}

/**
 * Enlace oficial "click to chat" de WhatsApp (https://wa.me/<número>?text=…),
 * la forma de abrir una conversación en la app del usuario sin ninguna API.
 * Es lo que se ofrece cuando la agencia no tiene un número conectado.
 */
export function whatsappClickToChatUrl(phoneE164: string, text?: string | null): string {
  const base = `https://wa.me/${phoneToWaId(phoneE164)}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}
