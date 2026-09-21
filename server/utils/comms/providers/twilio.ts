import { normalizePhone } from '../phone'
import type { InboundMessageEvent, InboundMessageType, LoadedChannel, MessageStatusEvent, OutboundMessage, ParsedWebhook, SendResult } from '../types'

/**
 * Twilio (WhatsApp) — mensajes por la Messages API y el parser de sus dos
 * webhooks (mensaje entrante y estado). La firma X-Twilio-Signature se
 * comprueba con `verifyTwilioSignature` de server/utils/whatsapp.ts, que ya
 * existía para los avisos de cita; aquí no se duplica.
 *
 * Twilio no expone llamadas de voz por WhatsApp para remitentes fuera de
 * BR/MX/ID/IN (docs/communications.md), así que este proveedor declara
 * `calling: false` y ningún endpoint de llamada se implementa sobre él.
 */

function credentialsOf(channel: LoadedChannel): { accountSid: string; authToken: string } {
  if (channel.credentials.provider !== 'twilio') throw new Error('El canal no es de Twilio')
  return channel.credentials
}

function basicAuth(channel: LoadedChannel): string {
  const c = credentialsOf(channel)
  return `Basic ${btoa(`${c.accountSid}:${c.authToken}`)}`
}

/** `whatsapp:+E.164`, la forma en que Twilio nombra a los dos extremos. */
export function twilioAddress(phoneE164: string): string {
  return `whatsapp:${phoneE164}`
}

/** Los parámetros exactos del POST a Messages.json. Exportado para probarlo sin red. */
export function twilioMessageForm(channel: LoadedChannel, toE164: string, message: OutboundMessage, statusCallbackUrl?: string | null): URLSearchParams {
  const form = new URLSearchParams({ From: channel.externalPhoneId, To: twilioAddress(toE164) })
  switch (message.kind) {
    case 'text':
      form.set('Body', message.body)
      break
    case 'image':
    case 'document':
      form.set('MediaUrl', message.link)
      if (message.caption) form.set('Body', message.caption)
      break
    case 'template': {
      if (!message.contentSid) throw new Error('Una plantilla de Twilio necesita su Content SID (HX…).')
      form.set('ContentSid', message.contentSid)
      const vars: Record<string, string> = {}
      message.params.forEach((p, i) => (vars[String(i + 1)] = p))
      form.set('ContentVariables', JSON.stringify(vars))
      break
    }
  }
  if (statusCallbackUrl) form.set('StatusCallback', statusCallbackUrl)
  return form
}

export async function twilioSendMessage(channel: LoadedChannel, toE164: string, message: OutboundMessage, statusCallbackUrl: string | null | undefined, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const c = credentialsOf(channel)
  let form: URLSearchParams
  try {
    form = twilioMessageForm(channel, toE164, message, statusCallbackUrl)
  } catch (e: any) {
    return { ok: false, externalId: null, status: null, errorCode: null, error: e?.message || 'Mensaje no válido' }
  }
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.accountSid)}/Messages.json`, {
      method: 'POST',
      headers: { authorization: basicAuth(channel), 'content-type': 'application/x-www-form-urlencoded' },
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
      return { ok: false, externalId: json?.sid ?? null, status: json?.status ?? null, errorCode: json?.code != null ? String(json.code) : null, error: `Twilio rechazó el envío: ${detail}` }
    }
    return { ok: true, externalId: json?.sid ?? null, status: json?.status ?? 'queued', errorCode: null, error: null }
  } catch (e: any) {
    return { ok: false, externalId: null, status: null, errorCode: null, error: `No se pudo contactar con Twilio: ${e?.message || 'error de red'}` }
  }
}

/** GET /2010-04-01/Accounts/{sid}.json — comprueba que las credenciales son reales. */
export async function twilioVerifyAccount(channel: LoadedChannel, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; friendlyName: string | null; error: string | null }> {
  const c = credentialsOf(channel)
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.accountSid)}.json`, { headers: { authorization: basicAuth(channel) } })
    const json: any = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, friendlyName: null, error: `Twilio rechazó las credenciales: ${json?.message || `HTTP ${res.status}`}` }
    return { ok: true, friendlyName: json?.friendly_name ?? null, error: null }
  } catch (e: any) {
    return { ok: false, friendlyName: null, error: `No se pudo contactar con Twilio: ${e?.message || 'error de red'}` }
  }
}

/** Descarga un medio de un mensaje entrante. Twilio exige autenticación básica en todas las URL de medios. */
export async function twilioDownloadMedia(channel: LoadedChannel, url: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; bytes: Uint8Array | null; mime: string | null; error: string | null }> {
  if (!/^https:\/\/api\.twilio\.com\//.test(url)) return { ok: false, bytes: null, mime: null, error: 'La URL del medio no es de Twilio.' }
  try {
    const res = await fetchImpl(url, { headers: { authorization: basicAuth(channel) }, redirect: 'follow' })
    if (!res.ok) return { ok: false, bytes: null, mime: null, error: `La descarga del medio devolvió HTTP ${res.status}` }
    return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()), mime: res.headers.get('content-type'), error: null }
  } catch (e: any) {
    return { ok: false, bytes: null, mime: null, error: `No se pudo descargar el medio: ${e?.message || 'error de red'}` }
  }
}

function typeFromMime(mime: string | null): InboundMessageType {
  const m = String(mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('audio/')) return 'audio'
  if (m.startsWith('video/')) return 'video'
  if (m) return 'document'
  return 'unsupported'
}

/**
 * Webhook de mensaje entrante (application/x-www-form-urlencoded): From,
 * To, Body, MessageSid, NumMedia, MediaUrl0/MediaContentType0, ProfileName,
 * WaId, Latitude/Longitude, ButtonText/ButtonPayload.
 */
export function parseTwilioInbound(params: Record<string, string>): ParsedWebhook | null {
  const sid = params.MessageSid || params.SmsSid || params.SmsMessageSid
  const from = normalizePhone(params.From)
  const to = params.To
  if (!sid || !from || !to) return null
  const event: InboundMessageEvent = {
    kind: 'message',
    externalId: sid,
    from,
    profileName: params.ProfileName || null,
    timestamp: new Date().toISOString(),
    type: 'text',
    text: params.Body ?? '',
    raw: params,
    contextExternalId: params.OriginalRepliedMessageSid || null,
  }
  const numMedia = Number(params.NumMedia || 0)
  if (numMedia > 0 && params.MediaUrl0) {
    const mime = params.MediaContentType0 || null
    event.type = typeFromMime(mime)
    event.media = { url: params.MediaUrl0, mime, caption: params.Body || null }
    event.text = params.Body || null
  } else if (params.Latitude && params.Longitude) {
    event.type = 'location'
    event.location = { latitude: Number(params.Latitude), longitude: Number(params.Longitude), name: params.Label || null, address: params.Address || null }
    event.text = params.Body || null
  } else if (params.ButtonText || params.ButtonPayload) {
    event.type = 'button'
    event.interactive = { type: 'button', id: params.ButtonPayload || null, title: params.ButtonText || null }
    event.text = params.ButtonText || params.Body || null
  }
  return { externalPhoneId: to, displayPhoneNumber: to.replace(/^whatsapp:/, ''), events: [event] }
}

/** Webhook de estado: MessageSid + MessageStatus (queued|sent|delivered|read|failed|undelivered) + ErrorCode. */
export function parseTwilioStatus(params: Record<string, string>): ParsedWebhook | null {
  const sid = params.MessageSid || params.SmsSid
  const status = String(params.MessageStatus || params.SmsStatus || '').toLowerCase()
  const to = params.From // en el webhook de estado, From es NUESTRO número (el remitente del mensaje)
  if (!sid || !to) return null
  let normalized: MessageStatusEvent['status'] | null = null
  if (status === 'sent') normalized = 'sent'
  else if (status === 'delivered') normalized = 'delivered'
  else if (status === 'read') normalized = 'read'
  else if (status === 'failed' || status === 'undelivered' || status === 'canceled') normalized = 'failed'
  if (!normalized) return { externalPhoneId: to, events: [] }
  const event: MessageStatusEvent = {
    kind: 'status',
    externalId: sid,
    status: normalized,
    timestamp: new Date().toISOString(),
    recipient: normalizePhone(params.To),
    errorCode: params.ErrorCode || null,
    errorMessage: params.ErrorMessage || (params.ErrorCode ? `Twilio error ${params.ErrorCode}` : null),
    raw: params,
  }
  return { externalPhoneId: to, events: [event] }
}
