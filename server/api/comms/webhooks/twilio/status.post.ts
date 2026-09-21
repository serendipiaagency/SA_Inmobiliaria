import { cfEnv, useDb } from '../../../../utils/db'
import { isCommsEncryptionAvailable, loadChannelByExternalPhone } from '../../../../utils/comms/credentials'
import { ingestParsedWebhook } from '../../../../utils/comms/ingest'
import { parseTwilioStatus } from '../../../../utils/comms/providers/twilio'
import { verifyTwilioSignature } from '../../../../utils/whatsapp'

/**
 * Webhook de estado de Twilio para los mensajes del Centro de
 * Comunicaciones (se registra como StatusCallback al enviar). Misma
 * verificación que el de entrada: la firma con el auth token del canal cuyo
 * número aparece en `From` (nuestro remitente). Sólo cambia el estado del
 * mensaje con ese SID; uno desconocido se ignora con 200.
 */
export default defineEventHandler(async (event) => {
  const env = cfEnv(event) as Record<string, any>
  if (!isCommsEncryptionAvailable(env)) {
    throw createError({ statusCode: 503, statusMessage: 'Comms webhooks not configured: COMMS_CREDENTIALS_ENCRYPTION_KEY is not set on this Worker.' })
  }
  const rawBody = (await readRawBody(event, 'utf8')) || ''
  const params: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(rawBody)) params[k] = v
  if (!params.From) throw createError({ statusCode: 400, statusMessage: 'From is required' })

  const db = useDb(event)
  const channel = await loadChannelByExternalPhone(db, env, 'twilio', params.From)
  if (!channel || channel.credentials.provider !== 'twilio') return { ok: true, ignored: 'unknown sender' }

  const url = getRequestURL(event).toString()
  const valid = await verifyTwilioSignature(url, params, channel.credentials.authToken, getHeader(event, 'x-twilio-signature'))
  if (!valid) throw createError({ statusCode: 403, statusMessage: 'Invalid Twilio signature' })

  const parsed = parseTwilioStatus(params)
  if (!parsed || !parsed.events.length) return { ok: true, ignored: 'pending' }
  const summary = await ingestParsedWebhook(db, env, channel, parsed)
  return { ok: true, ...summary }
})
