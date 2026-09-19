import { eq } from 'drizzle-orm'
import { cfEnv, useDb, schema } from '../../utils/db'
import { classifyTwilioStatus, verifyTwilioSignature } from '../../utils/whatsapp'

/**
 * Webhook de estado de mensajes de Twilio (WhatsApp). Sin sesión por
 * diseño — lo llama Twilio servidor a servidor — así que la confianza viene
 * entera de la firma X-Twilio-Signature (HMAC con el auth token sobre la URL
 * y los parámetros), nunca de una cookie. Se configura como StatusCallback
 * al enviar (server/utils/whatsapp.ts) o en la consola de Twilio:
 * `<origen>/api/twilio/status`.
 *
 * Lo único que hace es pasar `delivered` de "Twilio lo aceptó" a "llegó" /
 * "no llegó" en la fila de appointment_notifications con ese SID. Un SID que
 * no es nuestro se responde 200 y se ignora: Twilio reintenta los no-2xx y
 * no hay nada que reintentar.
 */
export default defineEventHandler(async (event) => {
  const env = cfEnv(event) as Record<string, any>
  const token = env.TWILIO_AUTH_TOKEN
  if (!token) throw createError({ statusCode: 503, statusMessage: 'Twilio webhooks not configured: TWILIO_AUTH_TOKEN is not set on this Worker.' })

  const rawBody = (await readRawBody(event, 'utf8')) || ''
  const params: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(rawBody)) params[k] = v

  // Twilio firma la URL exactamente como la llamó (con https y el host
  // público): detrás de Cloudflare la URL que ve el Worker es la misma.
  const url = getRequestURL(event).toString()
  const valid = await verifyTwilioSignature(url, params, String(token), getHeader(event, 'x-twilio-signature'))
  if (!valid) throw createError({ statusCode: 403, statusMessage: 'Invalid Twilio signature' })

  const sid = params.MessageSid || params.SmsSid
  const status = params.MessageStatus || params.SmsStatus || ''
  if (!sid) throw createError({ statusCode: 400, statusMessage: 'MessageSid is required' })

  const db = useDb(event)
  const outcome = classifyTwilioStatus(status)
  if (outcome === 'pending') return { ok: true, ignored: 'pending' }

  const patch =
    outcome === 'delivered'
      ? { delivered: 1, errorMessage: null }
      : { delivered: 0, errorMessage: `WhatsApp no entregado (${status}${params.ErrorCode ? `, código ${params.ErrorCode}` : ''})` }
  const updated = await db.update(schema.appointmentNotifications).set(patch).where(eq(schema.appointmentNotifications.externalId, sid)).returning({ id: schema.appointmentNotifications.id })
  return { ok: true, updated: updated.length, status }
})
