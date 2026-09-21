import { normalizePhone, phoneToWaId, waIdToPhone } from '../phone'
import type { CallEvent, CallPermissionEvent, InboundEvent, InboundMessageEvent, InboundMessageType, LoadedChannel, MessageStatusEvent, OutboundMessage, ParsedWebhook, SendResult } from '../types'

/**
 * Meta WhatsApp Cloud API — mensajes, medios, plantillas, marcado de
 * lectura, permisos y acciones de llamada, y el parser de sus webhooks.
 *
 * Todo lo que hay aquí sale de la documentación oficial (enlaces en
 * docs/communications.md), en concreto:
 *
 *   POST /<PHONE_NUMBER_ID>/messages          texto / imagen / documento /
 *                                              plantilla / interactivo
 *                                              (call_permission_request) /
 *                                              {"status":"read"}
 *   POST /<PHONE_NUMBER_ID>/calls             connect / pre_accept / accept /
 *                                              reject / terminate
 *   GET  /<PHONE_NUMBER_ID>/call_permissions  ?user_wa_id=…
 *   GET|POST /<PHONE_NUMBER_ID>/settings      {"calling":{…}}
 *   GET  /<WABA_ID>/message_templates
 *   GET  /<MEDIA_ID>  →  url (caduca en 5 min)  →  GET url con Bearer
 *   GET  /<PHONE_NUMBER_ID>?fields=verified_name,display_phone_number,…
 *   Webhook: X-Hub-Signature-256 = sha256=HMAC-SHA256(app secret, cuerpo)
 *
 * Nada de SDK: son llamadas HTTP con `fetch`, inyectable para las pruebas.
 * Ningún endpoint que no esté en esa lista se usa.
 */

export const META_GRAPH_VERSION_DEFAULT = 'v23.0'

export function graphBase(env?: Record<string, any> | null): string {
  const version = String(env?.WHATSAPP_GRAPH_VERSION || META_GRAPH_VERSION_DEFAULT).replace(/^\/+|\/+$/g, '')
  return `https://graph.facebook.com/${version}`
}

interface GraphResponse {
  ok: boolean
  status: number
  json: any
  /** Mensaje de error legible, ya con el código de Meta si lo hay. */
  error: string | null
  errorCode: string | null
}

function accessTokenOf(channel: LoadedChannel): string {
  if (channel.credentials.provider !== 'meta_cloud') throw new Error('El canal no es de Meta Cloud API')
  return channel.credentials.accessToken
}

async function graph(
  channel: LoadedChannel,
  env: Record<string, any> | null | undefined,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<GraphResponse> {
  const url = `${graphBase(env)}/${path.replace(/^\/+/, '')}`
  try {
    const res = await fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${accessTokenOf(channel)}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    let json: any = null
    try {
      json = await res.json()
    } catch {
      json = null
    }
    if (!res.ok) {
      const err = json?.error
      const detail = err?.error_data?.details || err?.error_user_msg || err?.message || `HTTP ${res.status}`
      const code = err?.code != null ? String(err.code) : null
      return { ok: false, status: res.status, json, error: `Meta rechazó la petición: ${detail}${code ? ` (código ${code})` : ''}`, errorCode: code }
    }
    return { ok: true, status: res.status, json, error: null, errorCode: null }
  } catch (e: any) {
    return { ok: false, status: 0, json: null, error: `No se pudo contactar con Meta: ${e?.message || 'error de red'}`, errorCode: null }
  }
}

// --- envío ------------------------------------------------------------------

/** El cuerpo exacto de POST /<PHONE_NUMBER_ID>/messages para cada tipo de mensaje que enviamos. Exportado para probarlo sin red. */
export function metaMessageBody(toE164: string, message: OutboundMessage): Record<string, any> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: phoneToWaId(toE164) }
  switch (message.kind) {
    case 'text':
      return { ...base, type: 'text', text: { preview_url: message.previewUrl !== false, body: message.body } }
    case 'image':
      return { ...base, type: 'image', image: { link: message.link, ...(message.caption ? { caption: message.caption } : {}) } }
    case 'document':
      return {
        ...base,
        type: 'document',
        document: { link: message.link, ...(message.caption ? { caption: message.caption } : {}), ...(message.filename ? { filename: message.filename } : {}) },
      }
    case 'template':
      return {
        ...base,
        type: 'template',
        template: {
          name: message.name,
          language: { code: message.language },
          ...(message.params.length ? { components: [{ type: 'body', parameters: message.params.map((text) => ({ type: 'text', text })) }] } : {}),
        },
      }
  }
}

export async function metaSendMessage(channel: LoadedChannel, env: Record<string, any> | null | undefined, toE164: string, message: OutboundMessage, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const r = await graph(channel, env, 'POST', `${channel.externalPhoneId}/messages`, metaMessageBody(toE164, message), fetchImpl)
  if (!r.ok) return { ok: false, externalId: null, status: null, errorCode: r.errorCode, error: r.error }
  const id = r.json?.messages?.[0]?.id ?? null
  return { ok: true, externalId: id, status: r.json?.messages?.[0]?.message_status || 'accepted', errorCode: null, error: null }
}

/** Marca un mensaje entrante como leído (los anteriores del hilo también quedan leídos). */
export async function metaMarkRead(channel: LoadedChannel, env: Record<string, any> | null | undefined, wamid: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; error: string | null }> {
  const r = await graph(channel, env, 'POST', `${channel.externalPhoneId}/messages`, { messaging_product: 'whatsapp', status: 'read', message_id: wamid }, fetchImpl)
  return { ok: r.ok, error: r.error }
}

/** Mensaje interactivo de tipo call_permission_request: pide al usuario permiso para llamarle. */
export async function metaSendCallPermissionRequest(
  channel: LoadedChannel,
  env: Record<string, any> | null | undefined,
  toE164: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phoneToWaId(toE164),
    type: 'interactive',
    interactive: { type: 'call_permission_request', action: { name: 'call_permission_request' }, body: { text } },
  }
  const r = await graph(channel, env, 'POST', `${channel.externalPhoneId}/messages`, body, fetchImpl)
  if (!r.ok) return { ok: false, externalId: null, status: null, errorCode: r.errorCode, error: r.error }
  return { ok: true, externalId: r.json?.messages?.[0]?.id ?? null, status: 'accepted', errorCode: null, error: null }
}

export interface CallPermissionState {
  ok: boolean
  status: 'none' | 'temporary' | 'permanent' | 'unknown'
  expiresAt: string | null
  canRequest: boolean | null
  error: string | null
  raw: any
}

/** GET /<PHONE_NUMBER_ID>/call_permissions?user_wa_id=… */
export async function metaGetCallPermission(channel: LoadedChannel, env: Record<string, any> | null | undefined, userE164: string, fetchImpl: typeof fetch = fetch): Promise<CallPermissionState> {
  const r = await graph(channel, env, 'GET', `${channel.externalPhoneId}/call_permissions?user_wa_id=${encodeURIComponent(phoneToWaId(userE164))}`, undefined, fetchImpl)
  if (!r.ok) return { ok: false, status: 'unknown', expiresAt: null, canRequest: null, error: r.error, raw: r.json }
  const permission = r.json?.permission
  const status = permission?.status === 'temporary' || permission?.status === 'permanent' ? permission.status : permission?.status === 'no_permission' ? 'none' : permission?.status ? String(permission.status) : 'none'
  const exp = permission?.expiration_time ? new Date(Number(permission.expiration_time) * 1000).toISOString() : null
  const action = Array.isArray(r.json?.actions) ? r.json.actions.find((a: any) => a?.action_name === 'send_call_permission_request') : null
  return { ok: true, status: status as CallPermissionState['status'], expiresAt: exp, canRequest: action ? Boolean(action.can_perform_action) : null, error: null, raw: r.json }
}

export type MetaCallAction =
  | { action: 'connect'; toE164: string; sdp: string; bizOpaqueCallbackData?: string | null }
  | { action: 'pre_accept' | 'accept'; callId: string; sdp: string; bizOpaqueCallbackData?: string | null }
  | { action: 'reject' | 'terminate'; callId: string }

/** POST /<PHONE_NUMBER_ID>/calls — iniciar, pre-aceptar, aceptar, rechazar o terminar una llamada. */
export async function metaCallAction(channel: LoadedChannel, env: Record<string, any> | null | undefined, input: MetaCallAction, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; callId: string | null; error: string | null; errorCode: string | null }> {
  let body: Record<string, any>
  switch (input.action) {
    case 'connect':
      body = {
        messaging_product: 'whatsapp',
        to: phoneToWaId(input.toE164),
        action: 'connect',
        session: { sdp_type: 'offer', sdp: input.sdp },
        ...(input.bizOpaqueCallbackData ? { biz_opaque_callback_data: input.bizOpaqueCallbackData } : {}),
      }
      break
    case 'pre_accept':
    case 'accept':
      body = {
        messaging_product: 'whatsapp',
        call_id: input.callId,
        action: input.action,
        session: { sdp_type: 'answer', sdp: input.sdp },
        ...(input.bizOpaqueCallbackData ? { biz_opaque_callback_data: input.bizOpaqueCallbackData } : {}),
      }
      break
    default:
      body = { messaging_product: 'whatsapp', call_id: input.callId, action: input.action }
  }
  const r = await graph(channel, env, 'POST', `${channel.externalPhoneId}/calls`, body, fetchImpl)
  if (!r.ok) return { ok: false, callId: null, error: r.error, errorCode: r.errorCode }
  return { ok: true, callId: r.json?.calls?.[0]?.id ?? null, error: null, errorCode: null }
}

export interface CallingSettings {
  status: 'ENABLED' | 'DISABLED' | null
  callIconVisibility: string | null
  callbackPermissionStatus: string | null
  raw: any
}

/** GET /<PHONE_NUMBER_ID>/settings → el objeto `calling`. */
export async function metaGetCallingSettings(channel: LoadedChannel, env: Record<string, any> | null | undefined, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; settings: CallingSettings | null; error: string | null; errorCode: string | null }> {
  const r = await graph(channel, env, 'GET', `${channel.externalPhoneId}/settings`, undefined, fetchImpl)
  if (!r.ok) return { ok: false, settings: null, error: r.error, errorCode: r.errorCode }
  const calling = r.json?.calling ?? null
  return {
    ok: true,
    settings: {
      status: calling?.status === 'ENABLED' || calling?.status === 'DISABLED' ? calling.status : null,
      callIconVisibility: calling?.call_icon_visibility ?? null,
      callbackPermissionStatus: calling?.callback_permission_status ?? null,
      raw: calling,
    },
    error: null,
    errorCode: null,
  }
}

/** POST /<PHONE_NUMBER_ID>/settings {"calling":{"status":…}} — activa o desactiva las llamadas en el número. */
export async function metaSetCallingStatus(channel: LoadedChannel, env: Record<string, any> | null | undefined, enabled: boolean, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; error: string | null; errorCode: string | null }> {
  const r = await graph(channel, env, 'POST', `${channel.externalPhoneId}/settings`, { calling: { status: enabled ? 'ENABLED' : 'DISABLED', ...(enabled ? { callback_permission_status: 'ENABLED' } : {}) } }, fetchImpl)
  return { ok: r.ok, error: r.error, errorCode: r.errorCode }
}

export interface MetaTemplate {
  externalId: string | null
  name: string
  language: string
  status: string
  category: string | null
  /** El texto del componente BODY con sus {{n}}; vacío si la plantilla no tiene cuerpo de texto. */
  body: string
}

/** GET /<WABA_ID>/message_templates — todas las páginas. */
export async function metaListTemplates(channel: LoadedChannel, env: Record<string, any> | null | undefined, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; templates: MetaTemplate[]; error: string | null }> {
  if (!channel.businessAccountId) return { ok: false, templates: [], error: 'Este canal no tiene el id de la cuenta de WhatsApp Business (WABA): sin él no se pueden listar plantillas.' }
  const templates: MetaTemplate[] = []
  let path: string | null = `${channel.businessAccountId}/message_templates?fields=name,status,category,language,components&limit=100`
  for (let page = 0; page < 20 && path; page++) {
    const r: GraphResponse = await graph(channel, env, 'GET', path, undefined, fetchImpl)
    if (!r.ok) return { ok: false, templates, error: r.error }
    for (const t of r.json?.data || []) {
      const body = (t.components || []).find((c: any) => String(c?.type).toUpperCase() === 'BODY')
      templates.push({ externalId: t.id ?? null, name: String(t.name), language: String(t.language || 'es'), status: String(t.status || 'UNKNOWN'), category: t.category ?? null, body: body?.text || '' })
    }
    const after: string | undefined = r.json?.paging?.cursors?.after
    path = after && r.json?.paging?.next ? `${channel.businessAccountId}/message_templates?fields=name,status,category,language,components&limit=100&after=${encodeURIComponent(after)}` : null
  }
  return { ok: true, templates, error: null }
}

/** GET /<PHONE_NUMBER_ID>?fields=… — comprueba que el token y el número son reales. */
export async function metaVerifyNumber(channel: LoadedChannel, env: Record<string, any> | null | undefined, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; displayPhoneNumber: string | null; verifiedName: string | null; qualityRating: string | null; error: string | null }> {
  const r = await graph(channel, env, 'GET', `${channel.externalPhoneId}?fields=display_phone_number,verified_name,quality_rating`, undefined, fetchImpl)
  if (!r.ok) return { ok: false, displayPhoneNumber: null, verifiedName: null, qualityRating: null, error: r.error }
  return { ok: true, displayPhoneNumber: r.json?.display_phone_number ?? null, verifiedName: r.json?.verified_name ?? null, qualityRating: r.json?.quality_rating ?? null, error: null }
}

/** GET /<MEDIA_ID> → URL temporal (5 min), y la descarga con el token. */
export async function metaDownloadMedia(channel: LoadedChannel, env: Record<string, any> | null | undefined, mediaId: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; bytes: Uint8Array | null; mime: string | null; sha256: string | null; error: string | null }> {
  const meta = await graph(channel, env, 'GET', `${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(channel.externalPhoneId)}`, undefined, fetchImpl)
  if (!meta.ok || !meta.json?.url) return { ok: false, bytes: null, mime: null, sha256: null, error: meta.error || 'Meta no devolvió la URL del medio.' }
  try {
    const res = await fetchImpl(String(meta.json.url), { headers: { authorization: `Bearer ${accessTokenOf(channel)}` } })
    if (!res.ok) return { ok: false, bytes: null, mime: null, sha256: null, error: `La descarga del medio devolvió HTTP ${res.status}` }
    const bytes = new Uint8Array(await res.arrayBuffer())
    return { ok: true, bytes, mime: meta.json?.mime_type || res.headers.get('content-type') || null, sha256: meta.json?.sha256 ?? null, error: null }
  } catch (e: any) {
    return { ok: false, bytes: null, mime: null, sha256: null, error: `No se pudo descargar el medio: ${e?.message || 'error de red'}` }
  }
}

// --- webhooks -----------------------------------------------------------------

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 del cuerpo crudo con el App Secret. */
export async function computeMetaSignature(rawBody: string, appSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)))
  return `sha256=${Array.from(sig)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`
}

export async function verifyMetaSignature(rawBody: string, header: string | null | undefined, appSecret: string): Promise<boolean> {
  if (!header || !appSecret) return false
  const expected = await computeMetaSignature(rawBody, appSecret)
  return timingSafeEqual(expected, header.trim())
}

/** El handshake GET del webhook: hub.mode=subscribe y hub.verify_token igual al nuestro → se responde hub.challenge. */
export function verifyMetaWebhookToken(query: Record<string, any>, validTokens: string[]): { ok: boolean; challenge: string | null } {
  const mode = String(query['hub.mode'] || '')
  const token = String(query['hub.verify_token'] || '')
  const challenge = query['hub.challenge'] != null ? String(query['hub.challenge']) : null
  if (mode !== 'subscribe' || !token || !challenge) return { ok: false, challenge: null }
  const ok = validTokens.some((t) => t && timingSafeEqual(t, token))
  return { ok, challenge: ok ? challenge : null }
}

/** Los phone_number_id que aparecen en un payload (SIN fiarse de él todavía): sólo sirven para saber qué secreto usar al verificar la firma. */
export function metaPhoneNumberIdsIn(payload: any): string[] {
  const ids = new Set<string>()
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const id = change?.value?.metadata?.phone_number_id
      if (id) ids.add(String(id))
    }
  }
  return [...ids]
}

function isoFromUnix(ts: unknown): string {
  const n = Number(ts)
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString()
}

const MEDIA_TYPES: InboundMessageType[] = ['image', 'document', 'audio', 'video', 'sticker']

function parseMessage(m: any, contacts: any[]): InboundMessageEvent | CallPermissionEvent | null {
  const id = m?.id ? String(m.id) : null
  const from = waIdToPhone(m?.from)
  if (!id || !from) return null
  const contact = contacts.find((c) => c?.wa_id && String(c.wa_id) === String(m.from))
  const profileName = contact?.profile?.name ?? null
  const timestamp = isoFromUnix(m.timestamp)
  const type = String(m.type || 'unsupported') as InboundMessageType

  if (type === 'interactive' && m.interactive?.type === 'call_permission_reply') {
    const reply = m.interactive.call_permission_reply || {}
    const response = String(reply.response || '').toLowerCase() === 'accept' ? 'accept' : 'reject'
    return {
      kind: 'call_permission',
      externalId: id,
      from,
      response,
      isPermanent: Boolean(reply.is_permanent),
      expiresAt: reply.expiration_timestamp ? isoFromUnix(reply.expiration_timestamp) : null,
      timestamp,
      raw: m,
    }
  }

  const event: InboundMessageEvent = { kind: 'message', externalId: id, from, profileName, timestamp, type: 'unsupported', raw: m, contextExternalId: m.context?.id ?? null }
  if (type === 'text') {
    event.type = 'text'
    event.text = m.text?.body ?? ''
  } else if (MEDIA_TYPES.includes(type)) {
    const media = m[type] || {}
    event.type = type
    event.media = { providerMediaId: media.id ?? null, mime: media.mime_type ?? null, filename: media.filename ?? null, caption: media.caption ?? null, sha256: media.sha256 ?? null }
    event.text = media.caption ?? null
  } else if (type === 'location') {
    event.type = 'location'
    event.location = { latitude: Number(m.location?.latitude), longitude: Number(m.location?.longitude), name: m.location?.name ?? null, address: m.location?.address ?? null }
  } else if (type === 'interactive') {
    const i = m.interactive || {}
    const reply = i.button_reply || i.list_reply || {}
    event.type = 'interactive'
    event.interactive = { type: String(i.type || ''), id: reply.id ?? null, title: reply.title ?? null }
    event.text = reply.title ?? null
  } else if (type === 'button') {
    event.type = 'button'
    event.text = m.button?.text ?? null
    event.interactive = { type: 'button', id: m.button?.payload ?? null, title: m.button?.text ?? null }
  } else if (type === 'reaction') {
    event.type = 'reaction'
    event.text = m.reaction?.emoji ?? null
    event.contextExternalId = m.reaction?.message_id ?? null
  } else if (type === 'contacts') {
    event.type = 'contacts'
    event.text = (m.contacts || []).map((c: any) => c?.name?.formatted_name).filter(Boolean).join(', ') || null
  } else {
    event.type = 'unsupported'
  }
  return event
}

function parseStatus(s: any): MessageStatusEvent | null {
  const id = s?.id ? String(s.id) : null
  const status = String(s?.status || '').toLowerCase()
  if (!id || !['sent', 'delivered', 'read', 'failed'].includes(status)) return null
  const err = Array.isArray(s.errors) ? s.errors[0] : null
  return {
    kind: 'status',
    externalId: id,
    status: status as MessageStatusEvent['status'],
    timestamp: isoFromUnix(s.timestamp),
    recipient: waIdToPhone(s.recipient_id),
    errorCode: err?.code != null ? String(err.code) : null,
    errorMessage: err ? [err.title, err.message, err.error_data?.details].filter(Boolean).join(' — ') : null,
    raw: s,
  }
}

function parseCall(c: any): CallEvent | null {
  const id = c?.id ? String(c.id) : null
  if (!id) return null
  const event = String(c.event || (c.session ? 'connect' : c.status ? 'terminate' : '')).toLowerCase()
  if (!['connect', 'terminate', 'status'].includes(event)) return null
  const direction = c.direction === 'USER_INITIATED' ? 'inbound' : c.direction === 'BUSINESS_INITIATED' ? 'outbound' : null
  const session = c.session?.sdp ? { sdpType: (c.session.sdp_type === 'answer' ? 'answer' : 'offer') as 'offer' | 'answer', sdp: String(c.session.sdp) } : null
  const rawStatus = Array.isArray(c.status) ? c.status[0] : c.status
  return {
    kind: 'call',
    externalId: id,
    event: event as CallEvent['event'],
    direction,
    from: c.from ? waIdToPhone(c.from) : null,
    to: c.to ? normalizePhone(`+${String(c.to).replace(/^\+/, '')}`) : null,
    session,
    status: rawStatus ? String(rawStatus).toUpperCase() : null,
    startTime: c.start_time ? isoFromUnix(c.start_time) : null,
    endTime: c.end_time ? isoFromUnix(c.end_time) : null,
    durationSeconds: c.duration != null ? Number(c.duration) : null,
    timestamp: isoFromUnix(c.timestamp),
    raw: c,
  }
}

/**
 * Convierte un payload de webhook (ya verificado) en eventos normalizados,
 * agrupados por phone_number_id. Los campos `messages` y `calls` comparten
 * la forma entry[].changes[].value; un `statuses[]` con un id `wacid.` es un
 * estado de llamada (RINGING/ACCEPTED/REJECTED), con `wamid.` de mensaje.
 */
export function parseMetaWebhook(payload: any): ParsedWebhook[] {
  const byPhone = new Map<string, ParsedWebhook>()
  if (payload?.object !== 'whatsapp_business_account') return []
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change?.value
      const phoneNumberId = value?.metadata?.phone_number_id ? String(value.metadata.phone_number_id) : null
      if (!phoneNumberId) continue
      let group = byPhone.get(phoneNumberId)
      if (!group) {
        group = { externalPhoneId: phoneNumberId, displayPhoneNumber: value.metadata?.display_phone_number ?? null, events: [] }
        byPhone.set(phoneNumberId, group)
      }
      const events: InboundEvent[] = group.events
      const contacts = Array.isArray(value.contacts) ? value.contacts : []
      for (const m of value.messages || []) {
        const ev = parseMessage(m, contacts)
        if (ev) events.push(ev)
      }
      for (const s of value.statuses || []) {
        const id = String(s?.id || '')
        if (id.startsWith('wacid.')) {
          const status = String(s.status || '').toUpperCase()
          if (['RINGING', 'ACCEPTED', 'REJECTED'].includes(status)) {
            events.push({ kind: 'call', externalId: id, event: 'status', status, timestamp: isoFromUnix(s.timestamp), raw: s })
          }
          continue
        }
        const ev = parseStatus(s)
        if (ev) events.push(ev)
      }
      for (const c of value.calls || []) {
        const ev = parseCall(c)
        if (ev) events.push(ev)
      }
    }
  }
  return [...byPhone.values()]
}
