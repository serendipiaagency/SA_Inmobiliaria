import { cfEnv, useDb } from '../../../../utils/db'
import { isCommsEncryptionAvailable, loadChannelByExternalPhone } from '../../../../utils/comms/credentials'
import { ingestParsedWebhook } from '../../../../utils/comms/ingest'
import { parseTwilioInbound } from '../../../../utils/comms/providers/twilio'
import { verifyTwilioSignature } from '../../../../utils/whatsapp'
import { getRequestId } from '../../../../utils/requestId'

/**
 * Webhook de mensaje entrante de Twilio (WhatsApp). Sin sesión por diseño:
 * la credencial es X-Twilio-Signature (HMAC-SHA1 con el auth token sobre la
 * URL y los parámetros), y el auth token con el que se verifica es el del
 * canal al que iba el mensaje (`To`), leído cifrado de comms_channels. Un
 * `To` que no es de ningún canal se responde 200 e ignora — Twilio
 * reintenta los no-2xx y no hay nada que reintentar.
 *
 * Twilio espera TwiML: se devuelve un <Response/> vacío (no se responde
 * automáticamente nada al cliente).
 */
export default defineEventHandler(async (event) => {
  const env = cfEnv(event) as Record<string, any>
  if (!isCommsEncryptionAvailable(env)) {
    throw createError({ statusCode: 503, statusMessage: 'Comms webhooks not configured: COMMS_CREDENTIALS_ENCRYPTION_KEY is not set on this Worker.' })
  }
  const rawBody = (await readRawBody(event, 'utf8')) || ''
  const params: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(rawBody)) params[k] = v
  if (!params.To) throw createError({ statusCode: 400, statusMessage: 'To is required' })

  const db = useDb(event)
  const channel = await loadChannelByExternalPhone(db, env, 'twilio', params.To)
  setHeader(event, 'content-type', 'text/xml; charset=utf-8')
  if (!channel || channel.credentials.provider !== 'twilio') return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

  const url = getRequestURL(event).toString()
  const valid = await verifyTwilioSignature(url, params, channel.credentials.authToken, getHeader(event, 'x-twilio-signature'))
  if (!valid) throw createError({ statusCode: 403, statusMessage: 'Invalid Twilio signature' })

  const parsed = parseTwilioInbound(params)
  if (parsed && channel.status === 'active') {
    await ingestParsedWebhook(db, env, channel, parsed, { publicOrigin: getRequestURL(event).origin, requestId: getRequestId(event) })
  }
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
})
