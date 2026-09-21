import { cfEnv, useDb } from '../../../utils/db'
import { isCommsEncryptionAvailable, loadChannelByExternalPhone } from '../../../utils/comms/credentials'
import { ingestParsedWebhook, type IngestSummary } from '../../../utils/comms/ingest'
import { metaPhoneNumberIdsIn, parseMetaWebhook, verifyMetaSignature } from '../../../utils/comms/providers/metaCloud'
import type { LoadedChannel } from '../../../utils/comms/types'
import { getRequestId } from '../../../utils/requestId'

/**
 * Webhook de Meta WhatsApp Cloud API (campos `messages` y `calls`).
 *
 * Sin sesión por diseño: la confianza viene entera de X-Hub-Signature-256
 * (HMAC-SHA256 del cuerpo crudo con el App Secret). Como una plataforma
 * puede tener varias agencias con apps de Meta distintas, el secreto con el
 * que se verifica depende del número al que iba el evento: se lee el
 * phone_number_id del cuerpo **sin fiarse todavía de nada**, se busca el
 * canal, y se verifica con el App Secret de ese canal (o con el del Worker,
 * WHATSAPP_APP_SECRET, si el canal no tiene uno propio). Si la firma no
 * cuadra con ninguno, 403 y no se toca nada.
 *
 * Idempotente: cada mensaje/estado/llamada se reclama por su id en
 * comms_webhook_events antes de procesarse (server/utils/comms/ingest.ts).
 * Un número que no es de ningún canal se responde 200 e ignora.
 */
export default defineEventHandler(async (event) => {
  const env = cfEnv(event) as Record<string, any>
  if (!isCommsEncryptionAvailable(env)) {
    throw createError({ statusCode: 503, statusMessage: 'Comms webhooks not configured: COMMS_CREDENTIALS_ENCRYPTION_KEY is not set on this Worker.' })
  }
  const rawBody = await readRawBody(event, 'utf8')
  if (!rawBody) throw createError({ statusCode: 400, statusMessage: 'Empty body' })

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  const db = useDb(event)
  const phoneNumberIds = metaPhoneNumberIdsIn(payload)
  const channels = new Map<string, LoadedChannel>()
  for (const id of phoneNumberIds) {
    const channel = await loadChannelByExternalPhone(db, env, 'meta_cloud', id)
    if (channel && channel.status === 'active') channels.set(id, channel)
  }

  // Los secretos candidatos: el de cada canal implicado y el del Worker.
  const secrets = new Set<string>()
  for (const channel of channels.values()) {
    if (channel.credentials.provider === 'meta_cloud' && channel.credentials.appSecret) secrets.add(channel.credentials.appSecret)
  }
  if (env.WHATSAPP_APP_SECRET) secrets.add(String(env.WHATSAPP_APP_SECRET))
  if (!secrets.size) throw createError({ statusCode: 403, statusMessage: 'No app secret available to verify this webhook' })

  const signature = getHeader(event, 'x-hub-signature-256')
  let valid = false
  for (const secret of secrets) {
    if (await verifyMetaSignature(rawBody, signature, secret)) {
      valid = true
      break
    }
  }
  if (!valid) throw createError({ statusCode: 403, statusMessage: 'Invalid Meta signature' })

  const parsed = parseMetaWebhook(payload)
  const totals: IngestSummary = { processed: 0, duplicates: 0, failed: 0, ignored: 0, notes: [] }
  let unknown = 0
  const ctx = { publicOrigin: getRequestURL(event).origin, requestId: getRequestId(event) }
  for (const group of parsed) {
    const channel = channels.get(group.externalPhoneId)
    if (!channel) {
      unknown += group.events.length
      continue
    }
    const summary = await ingestParsedWebhook(db, env, channel, group, ctx)
    totals.processed += summary.processed
    totals.duplicates += summary.duplicates
    totals.failed += summary.failed
    totals.ignored += summary.ignored
    totals.notes.push(...summary.notes)
  }

  setResponseStatus(event, 200)
  return { received: true, ...totals, unknown }
})
