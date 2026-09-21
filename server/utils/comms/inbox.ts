import { and, eq, sql } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { isUniqueConstraintError, now } from '../db'
import { sendInternalNotification } from '../email/send'
import { formatPhone } from './phone'
import { matchCrmByPhone } from './matching'
import { metaMarkRead, metaSendMessage } from './providers/metaCloud'
import { twilioSendMessage } from './providers/twilio'
import { PROVIDERS } from './providers/registry'
import type { CallPermissionEvent, InboundMessageEvent, LoadedChannel, MessageStatusEvent, OutboundMessage, SendResult } from './types'

/**
 * La bandeja: contactos, conversaciones y mensajes, y las dos reglas de
 * WhatsApp que ningún proveedor deja saltarse —
 *
 *   1. **La ventana de 24 h.** Un negocio sólo puede escribir texto libre
 *      durante las 24 h siguientes al último mensaje del cliente. Fuera de
 *      ella, sólo una plantilla aprobada. `serviceWindow()` lo calcula desde
 *      `comms_conversations.last_inbound_at` y `sendOutbound()` lo aplica
 *      ANTES de llamar al proveedor: el error es nuestro, claro y en
 *      español, no un 131047 de Meta o un 63016 de Twilio.
 *   2. **El consentimiento.** Un contacto `opted_out` no recibe nada, ni
 *      plantillas. Escribir "STOP"/"BAJA" lo marca solo.
 *
 * Los timestamps de la base van en `now()` ('YYYY-MM-DD HH:MM:SS', UTC) como
 * el resto del proyecto; los del proveedor (ISO) se convierten al entrar.
 */

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000
export const PREVIEW_MAX = 120

/** 'YYYY-MM-DD HH:MM:SS' (UTC) → ms, aceptando también ISO. */
export function dbTsToMs(ts: string | null | undefined): number | null {
  if (!ts) return null
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts) ? `${ts.replace(' ', 'T')}Z` : ts
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** ISO (del proveedor) → 'YYYY-MM-DD HH:MM:SS' (UTC), el formato de la base. */
export function isoToDbTs(iso: string | null | undefined): string {
  const ms = iso ? new Date(iso).getTime() : NaN
  return Number.isFinite(ms) ? new Date(ms).toISOString().replace('T', ' ').slice(0, 19) : now()
}

export interface ServiceWindow {
  open: boolean
  /** ISO. `null` si el contacto nunca escribió. */
  expiresAt: string | null
  remainingMs: number
}

export function serviceWindow(lastInboundAt: string | null | undefined, nowMs = Date.now()): ServiceWindow {
  const start = dbTsToMs(lastInboundAt)
  if (start == null) return { open: false, expiresAt: null, remainingMs: 0 }
  const expires = start + SERVICE_WINDOW_MS
  return { open: nowMs < expires, expiresAt: new Date(expires).toISOString(), remainingMs: Math.max(0, expires - nowMs) }
}

/** Sustituye {{1}}, {{2}}… por los parámetros, para previsualizar y para guardar lo que se envió. */
export function renderTemplateBody(body: string, params: string[]): string {
  return String(body || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] ?? `{{${n}}}`)
}

/** Cuántos {{n}} distintos tiene una plantilla. */
export function templateParamCount(body: string): number {
  let max = 0
  for (const m of String(body || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]))
  return max
}

const OPT_OUT_KEYWORDS = ['stop', 'baja', 'unsubscribe', 'cancelar', 'no molestar', 'darme de baja']

export function isOptOutText(text: string | null | undefined): boolean {
  const t = String(text || '')
    .trim()
    .toLowerCase()
  return t.length <= 40 && OPT_OUT_KEYWORDS.some((k) => t === k || t.startsWith(`${k} `) || t.startsWith(`${k}.`))
}

const TYPE_PREVIEW: Record<string, string> = {
  image: '📷 Imagen',
  document: '📎 Documento',
  audio: '🎤 Audio',
  video: '🎬 Vídeo',
  sticker: 'Sticker',
  location: '📍 Ubicación',
  contacts: '👤 Contacto',
  reaction: 'Reacción',
  call: '📞 Llamada',
  property_share: '🏠 Propiedad',
  unsupported: 'Mensaje no soportado',
}

export function previewOf(message: { type: string; body?: string | null; mediaFilename?: string | null; templateName?: string | null }): string {
  const text = (message.body || '').replace(/\s+/g, ' ').trim()
  if (text) return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text
  if (message.type === 'document' && message.mediaFilename) return `📎 ${message.mediaFilename}`
  if (message.type === 'template') return `Plantilla ${message.templateName || ''}`.trim()
  return TYPE_PREVIEW[message.type] || ''
}

// --- ajustes ------------------------------------------------------------------

export interface CommsSettingsView {
  defaultCountryPrefix: string | null
  unknownContactPolicy: 'ask' | 'lead'
  notifyInternal: boolean
}

export async function getCommsSettings(db: any, orgId: number): Promise<CommsSettingsView> {
  const rows = await db.select().from(schema.commsSettings).where(eq(schema.commsSettings.organizationId, orgId)).limit(1)
  const row = rows[0]
  return {
    defaultCountryPrefix: row?.defaultCountryPrefix ?? null,
    unknownContactPolicy: row?.unknownContactPolicy === 'lead' ? 'lead' : 'ask',
    notifyInternal: row ? row.notifyInternal === 1 : true,
  }
}

// --- contactos y conversaciones ----------------------------------------------

type ContactRow = typeof schema.commsContacts.$inferSelect
type ConversationRow = typeof schema.commsConversations.$inferSelect
type MessageRow = typeof schema.commsMessages.$inferSelect

export interface UpsertContactInput {
  waId?: string | null
  displayName?: string | null
  /** 'YYYY-MM-DD HH:MM:SS' del mensaje entrante que provoca el alta/actualización. */
  inboundAt?: string | null
}

/**
 * El contacto de un teléfono en esta organización, creándolo si no existe.
 * Al crearlo se cruza con el CRM; si no hay nadie y la política es `lead`,
 * se abre un lead con origen "whatsapp" para que no se pierda.
 */
export async function upsertContact(db: any, orgId: number, phoneE164: string, input: UpsertContactInput = {}): Promise<ContactRow & { created: boolean }> {
  const nowTs = now()
  const existing: ContactRow[] = await db
    .select()
    .from(schema.commsContacts)
    .where(and(eq(schema.commsContacts.organizationId, orgId), eq(schema.commsContacts.phoneE164, phoneE164)))
    .limit(1)
  if (existing[0]) {
    const c = existing[0]
    const patch: Record<string, any> = { updatedAt: nowTs }
    if (input.waId && !c.waId) patch.waId = input.waId
    if (input.displayName && input.displayName !== c.displayName) patch.displayName = input.displayName
    if (input.inboundAt) patch.lastInboundAt = input.inboundAt
    await db.update(schema.commsContacts).set(patch).where(eq(schema.commsContacts.id, c.id))
    return { ...c, ...patch, created: false }
  }

  const settings = await getCommsSettings(db, orgId)
  const match = await matchCrmByPhone(db, orgId, phoneE164, settings.defaultCountryPrefix)
  let leadId = match.leadId
  if (!match.clientId && !leadId && settings.unknownContactPolicy === 'lead') {
    const [lead] = await db
      .insert(schema.leads)
      .values({
        organizationId: orgId,
        name: input.displayName || formatPhone(phoneE164),
        phone: phoneE164,
        source: 'whatsapp',
        status: 'new',
        score: 10,
        notes: 'Creado automáticamente desde un mensaje de WhatsApp (Centro de Comunicaciones).',
        lastContactAt: nowTs,
        createdAt: nowTs,
        updatedAt: nowTs,
      })
      .returning({ id: schema.leads.id })
    leadId = lead.id
  }

  const values = {
    organizationId: orgId,
    phoneE164,
    waId: input.waId ?? null,
    displayName: input.displayName ?? null,
    clientId: match.clientId,
    leadId,
    consentStatus: 'unknown',
    callPermissionStatus: 'unknown',
    lastInboundAt: input.inboundAt ?? null,
    createdAt: nowTs,
    updatedAt: nowTs,
  }
  try {
    const [row] = await db.insert(schema.commsContacts).values(values).returning()
    return { ...row, created: true }
  } catch (e: any) {
    if (!isUniqueConstraintError(e)) throw e
    // Dos webhooks del mismo número a la vez: el otro ganó la inserción.
    const again: ContactRow[] = await db
      .select()
      .from(schema.commsContacts)
      .where(and(eq(schema.commsContacts.organizationId, orgId), eq(schema.commsContacts.phoneE164, phoneE164)))
      .limit(1)
    return { ...again[0], created: false }
  }
}

export async function findOrCreateConversation(db: any, orgId: number, channelId: number, contactId: number): Promise<ConversationRow & { created: boolean }> {
  const rows: ConversationRow[] = await db
    .select()
    .from(schema.commsConversations)
    .where(and(eq(schema.commsConversations.channelId, channelId), eq(schema.commsConversations.contactId, contactId)))
    .limit(1)
  if (rows[0]) return { ...rows[0], created: false }
  const nowTs = now()
  try {
    const [row] = await db
      .insert(schema.commsConversations)
      .values({ organizationId: orgId, channelId, contactId, status: 'open', unreadCount: 0, createdAt: nowTs, updatedAt: nowTs })
      .returning()
    return { ...row, created: true }
  } catch (e: any) {
    if (!isUniqueConstraintError(e)) throw e
    const again: ConversationRow[] = await db
      .select()
      .from(schema.commsConversations)
      .where(and(eq(schema.commsConversations.channelId, channelId), eq(schema.commsConversations.contactId, contactId)))
      .limit(1)
    return { ...again[0], created: false }
  }
}

async function touchConversation(db: any, conversationId: number, patch: Record<string, any>): Promise<void> {
  await db
    .update(schema.commsConversations)
    .set({ ...patch, updatedAt: now() })
    .where(eq(schema.commsConversations.id, conversationId))
}

// --- entrada ------------------------------------------------------------------

export interface IngestContext {
  /** Origen público (https://…) para construir enlaces en el aviso interno. */
  publicOrigin?: string | null
  requestId?: string | null
}

export interface IngestMessageResult {
  duplicate: boolean
  messageId: number | null
  conversationId: number
  contactId: number
  newConversation: boolean
}

/** Un mensaje entrante ya verificado: contacto → conversación → mensaje → contadores → aviso interno. */
export async function ingestInboundMessage(db: any, env: Record<string, any>, channel: LoadedChannel, event: InboundMessageEvent, ctx: IngestContext = {}): Promise<IngestMessageResult> {
  const orgId = channel.organizationId
  const ts = isoToDbTs(event.timestamp)
  const contact = await upsertContact(db, orgId, event.from, { waId: event.raw && (event.raw as any).from ? String((event.raw as any).from) : null, displayName: event.profileName ?? null, inboundAt: ts })
  const conversation = await findOrCreateConversation(db, orgId, channel.id, contact.id)

  const type = event.type
  const body = event.text ?? null
  const values = {
    organizationId: orgId,
    conversationId: conversation.id,
    direction: 'in',
    type,
    body,
    mediaMime: event.media?.mime ?? null,
    mediaFilename: event.media?.filename ?? null,
    externalId: event.externalId,
    status: 'received',
    providerTimestamp: event.timestamp,
    payloadJson: JSON.stringify({
      media: event.media ?? null,
      interactive: event.interactive ?? null,
      location: event.location ?? null,
      contextExternalId: event.contextExternalId ?? null,
      profileName: event.profileName ?? null,
    }),
    createdAt: ts,
    updatedAt: ts,
  }
  let messageId: number
  try {
    const [row] = await db.insert(schema.commsMessages).values(values).returning({ id: schema.commsMessages.id })
    messageId = row.id
  } catch (e: any) {
    if (isUniqueConstraintError(e)) return { duplicate: true, messageId: null, conversationId: conversation.id, contactId: contact.id, newConversation: false }
    throw e
  }

  await touchConversation(db, conversation.id, {
    lastMessageAt: ts,
    lastMessagePreview: previewOf({ type, body, mediaFilename: values.mediaFilename }),
    lastInboundAt: ts,
    unreadCount: sql`${schema.commsConversations.unreadCount} + 1`,
    status: conversation.status === 'closed' ? 'open' : conversation.status,
  })

  // Consentimiento: un mensaje del cliente es la señal que abre la
  // conversación; "STOP"/"BAJA" la cierra. Un opt-out explícito sólo lo
  // revierte un opt-in explícito del propio cliente, nunca este código.
  if (isOptOutText(body)) {
    await db
      .update(schema.commsContacts)
      .set({ consentStatus: 'opted_out', consentSource: 'keyword', consentUpdatedAt: ts, updatedAt: ts })
      .where(eq(schema.commsContacts.id, contact.id))
  } else if (contact.consentStatus === 'unknown') {
    await db
      .update(schema.commsContacts)
      .set({ consentStatus: 'opted_in', consentSource: 'inbound_message', consentUpdatedAt: ts, updatedAt: ts })
      .where(eq(schema.commsContacts.id, contact.id))
  }

  if (conversation.created) {
    try {
      const settings = await getCommsSettings(db, orgId)
      if (settings.notifyInternal) {
        await sendInternalNotification(
          db,
          env,
          orgId,
          'whatsapp_message_received',
          {
            contactName: event.profileName || formatPhone(event.from),
            phone: formatPhone(event.from),
            preview: previewOf({ type, body, mediaFilename: values.mediaFilename }),
            inboxUrl: ctx.publicOrigin ? `${ctx.publicOrigin}/admin/comunicaciones?conversation=${conversation.id}` : null,
          },
          ctx.requestId ?? null,
        )
      }
    } catch {
      // El mensaje ya está guardado; un fallo del aviso interno no lo deshace.
    }
  }

  return { duplicate: false, messageId, conversationId: conversation.id, contactId: contact.id, newConversation: conversation.created }
}

const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, received: 3, failed: 9 }

/** Un estado de entrega: sólo avanza (un `delivered` tardío no pisa un `read`); `failed` siempre se aplica. */
export async function applyMessageStatus(db: any, event: MessageStatusEvent): Promise<{ updated: boolean }> {
  const rows: MessageRow[] = await db.select().from(schema.commsMessages).where(eq(schema.commsMessages.externalId, event.externalId)).limit(1)
  const row = rows[0]
  if (!row) return { updated: false }
  const current = STATUS_RANK[row.status] ?? 0
  const next = STATUS_RANK[event.status] ?? 0
  if (event.status !== 'failed' && next <= current) return { updated: false }
  await db
    .update(schema.commsMessages)
    .set({
      status: event.status,
      errorCode: event.status === 'failed' ? (event.errorCode ?? null) : row.errorCode,
      errorMessage: event.status === 'failed' ? (event.errorMessage ?? 'El proveedor no pudo entregar el mensaje.') : row.errorMessage,
      updatedAt: now(),
    })
    .where(eq(schema.commsMessages.id, row.id))
  return { updated: true }
}

/** La respuesta del usuario a una petición de permiso de llamada. Queda en el contacto y como mensaje del hilo. */
export async function applyCallPermission(db: any, channel: LoadedChannel, event: CallPermissionEvent): Promise<void> {
  const orgId = channel.organizationId
  const ts = isoToDbTs(event.timestamp)
  const contact = await upsertContact(db, orgId, event.from, {})
  const granted = event.response === 'accept'
  await db
    .update(schema.commsContacts)
    .set({
      callPermissionStatus: granted ? (event.isPermanent ? 'permanent' : 'temporary') : 'denied',
      callPermissionExpiresAt: granted && !event.isPermanent && event.expiresAt ? isoToDbTs(event.expiresAt) : null,
      callPermissionUpdatedAt: ts,
      updatedAt: ts,
    })
    .where(eq(schema.commsContacts.id, contact.id))
  const conversation = await findOrCreateConversation(db, orgId, channel.id, contact.id)
  const body = granted
    ? event.isPermanent
      ? 'El contacto ha dado permiso permanente para llamarle por WhatsApp.'
      : `El contacto ha dado permiso para llamarle por WhatsApp${event.expiresAt ? ` hasta el ${isoToDbTs(event.expiresAt)} (UTC)` : ' durante 7 días'}.`
    : 'El contacto ha rechazado el permiso de llamada.'
  try {
    await db.insert(schema.commsMessages).values({
      organizationId: orgId,
      conversationId: conversation.id,
      direction: 'in',
      type: 'interactive',
      body,
      externalId: event.externalId,
      status: 'received',
      providerTimestamp: event.timestamp,
      payloadJson: JSON.stringify({ interactive: { type: 'call_permission_reply', response: event.response, isPermanent: event.isPermanent, expiresAt: event.expiresAt } }),
      createdAt: ts,
      updatedAt: ts,
    })
    await touchConversation(db, conversation.id, { lastMessageAt: ts, lastMessagePreview: body.slice(0, PREVIEW_MAX), lastInboundAt: ts })
  } catch (e: any) {
    if (!isUniqueConstraintError(e)) throw e
  }
}

// --- salida -------------------------------------------------------------------

export type SendErrorCode = 'opted_out' | 'window_closed' | 'provider' | 'unsupported' | 'not_configured'

export interface SendOutboundInput {
  channel: LoadedChannel
  env: Record<string, any>
  conversation: ConversationRow
  contact: ContactRow
  message: OutboundMessage
  /** Texto que se guarda en el hilo (para plantillas, el cuerpo ya renderizado). */
  displayBody?: string | null
  /** Tipo con el que se guarda: por defecto el del mensaje; `property_share` cuando lo que va es una propiedad. */
  storeAs?: string | null
  propertyId?: number | null
  userId: number
  statusCallbackUrl?: string | null
  fetchImpl?: typeof fetch
}

export interface SendOutboundResult {
  ok: boolean
  code: SendErrorCode | null
  error: string | null
  message: MessageRow | null
}

/** Envía por el proveedor del canal y deja el mensaje en el hilo, con su estado real (aceptado o fallido). */
export async function sendOutbound(db: any, input: SendOutboundInput): Promise<SendOutboundResult> {
  const { channel, conversation, contact, message } = input
  const caps = PROVIDERS[channel.provider].capabilities
  if (contact.consentStatus === 'opted_out') {
    return { ok: false, code: 'opted_out', error: 'Este contacto pidió no recibir mensajes (baja). No se envía nada hasta que vuelva a escribir o alguien cambie su consentimiento a mano.', message: null }
  }
  if (message.kind === 'template' && !caps.templates) return { ok: false, code: 'unsupported', error: 'Este canal no admite plantillas.', message: null }
  if ((message.kind === 'image' || message.kind === 'document') && !caps.media) return { ok: false, code: 'unsupported', error: 'Este canal no admite enviar archivos.', message: null }
  const window = serviceWindow(conversation.lastInboundAt)
  if (!window.open && message.kind !== 'template') {
    return {
      ok: false,
      code: 'window_closed',
      error: conversation.lastInboundAt
        ? 'Han pasado más de 24 h desde el último mensaje del contacto: WhatsApp sólo permite escribirle con una plantilla aprobada.'
        : 'Este contacto todavía no os ha escrito: WhatsApp sólo permite iniciar la conversación con una plantilla aprobada.',
      message: null,
    }
  }

  const fetchImpl = input.fetchImpl ?? fetch
  let result: SendResult
  if (channel.provider === 'meta_cloud') result = await metaSendMessage(channel, input.env, contact.phoneE164, message, fetchImpl)
  else result = await twilioSendMessage(channel, contact.phoneE164, message, input.statusCallbackUrl ?? null, fetchImpl)

  const nowTs = now()
  const type = input.storeAs || (message.kind === 'text' ? 'text' : message.kind)
  const body = input.displayBody ?? (message.kind === 'text' ? message.body : message.kind === 'template' ? null : (message.caption ?? null))
  const values = {
    organizationId: channel.organizationId,
    conversationId: conversation.id,
    direction: 'out',
    type,
    body,
    mediaUrl: message.kind === 'image' || message.kind === 'document' ? message.link : null,
    mediaFilename: message.kind === 'document' ? (message.filename ?? null) : null,
    mediaMime: null,
    templateName: message.kind === 'template' ? message.name : null,
    templateLanguage: message.kind === 'template' ? message.language : null,
    templateParamsJson: message.kind === 'template' ? JSON.stringify(message.params) : null,
    propertyId: input.propertyId ?? null,
    externalId: result.ok ? result.externalId : null,
    status: result.ok ? 'sent' : 'failed',
    errorCode: result.ok ? null : result.errorCode,
    errorMessage: result.ok ? null : result.error,
    sentByUserId: input.userId,
    createdAt: nowTs,
    updatedAt: nowTs,
  }
  const [row] = await db.insert(schema.commsMessages).values(values).returning()

  await touchConversation(db, conversation.id, {
    lastMessageAt: nowTs,
    lastMessagePreview: previewOf({ type, body, mediaFilename: values.mediaFilename, templateName: values.templateName }),
    status: conversation.status === 'closed' ? 'open' : conversation.status,
  })

  return result.ok ? { ok: true, code: null, error: null, message: row } : { ok: false, code: 'provider', error: result.error, message: row }
}

/** Nota interna: se guarda en el hilo, nunca se envía. */
export async function addInternalNote(db: any, input: { orgId: number; conversationId: number; userId: number; body: string }): Promise<MessageRow> {
  const nowTs = now()
  const [row] = await db
    .insert(schema.commsMessages)
    .values({ organizationId: input.orgId, conversationId: input.conversationId, direction: 'note', type: 'note', body: input.body, status: 'sent', sentByUserId: input.userId, createdAt: nowTs, updatedAt: nowTs })
    .returning()
  return row
}

/** Pone a cero los no leídos y, si el proveedor lo permite, marca leído en el WhatsApp del cliente (mejor esfuerzo). */
export async function markConversationRead(db: any, env: Record<string, any>, channel: LoadedChannel, conversation: ConversationRow, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (conversation.unreadCount > 0) await touchConversation(db, conversation.id, { unreadCount: 0 })
  if (channel.provider !== 'meta_cloud') return
  const rows = await db
    .select({ externalId: schema.commsMessages.externalId })
    .from(schema.commsMessages)
    .where(and(eq(schema.commsMessages.conversationId, conversation.id), eq(schema.commsMessages.direction, 'in')))
    .orderBy(sql`${schema.commsMessages.id} DESC`)
    .limit(1)
  const wamid = rows[0]?.externalId
  if (wamid && wamid.startsWith('wamid.')) {
    try {
      await metaMarkRead(channel, env, wamid, fetchImpl)
    } catch {
      // Marcar leído en el teléfono del cliente es cortesía, no estado.
    }
  }
}
