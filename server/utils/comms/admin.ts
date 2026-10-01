import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { createError, getRequestURL, type H3Event } from 'h3'
import * as schema from '../../db/schema'
import { isUniqueConstraintError, now } from '../db'
import { hasOverlappingVisit, shiftDateTime } from '../appointments/availability'
import { generateManagementToken } from '../appointments/managementToken'
import { syncLeadNextAction } from '../leads/nextAction'
import { toPublicProperty } from '../propertyPrivacy'
import type { PropertyKind } from '../matching/service'
import { listChannels } from './credentials'
import { previewOf, sendOutbound, serviceWindow, type SendOutboundResult } from './inbox'
import { formatPhone, whatsappClickToChatUrl } from './phone'
import { NO_CAPABILITIES, PROVIDERS } from './providers/registry'
import type { ChannelView, LoadedChannel, OutboundMessage, ProviderCapabilities } from './types'

/**
 * Lo que comparten los endpoints de /api/admin/comms: cargar una
 * conversación **de esta organización** (404 si no lo es, nunca 403: un 403
 * confirmaría que existe en otra agencia), serializar filas para el panel
 * sin filtrar nada que no deba viajar, y las dos cosas que varios endpoints
 * necesitan igual — el origen público de la web de la agencia (para los
 * enlaces de propiedades) y crear una visita de seguimiento.
 */

type ConversationRow = typeof schema.commsConversations.$inferSelect
type ContactRow = typeof schema.commsContacts.$inferSelect
type MessageRow = typeof schema.commsMessages.$inferSelect
type CallRow = typeof schema.commsCalls.$inferSelect

export interface ConversationBundle {
  conversation: ConversationRow
  contact: ContactRow
  channelRow: typeof schema.commsChannels.$inferSelect
}

export async function loadConversationForOrg(db: any, orgId: number, id: number): Promise<ConversationBundle> {
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const rows = await db
    .select()
    .from(schema.commsConversations)
    .where(and(eq(schema.commsConversations.id, id), eq(schema.commsConversations.organizationId, orgId)))
    .limit(1)
  const conversation: ConversationRow | undefined = rows[0]
  if (!conversation) throw createError({ statusCode: 404, statusMessage: 'Conversación no encontrada' })
  const contacts = await db.select().from(schema.commsContacts).where(eq(schema.commsContacts.id, conversation.contactId)).limit(1)
  const channels = await db.select().from(schema.commsChannels).where(eq(schema.commsChannels.id, conversation.channelId)).limit(1)
  if (!contacts[0] || !channels[0]) throw createError({ statusCode: 404, statusMessage: 'Conversación no encontrada' })
  return { conversation, contact: contacts[0], channelRow: channels[0] }
}

export async function loadContactForOrg(db: any, orgId: number, id: number): Promise<ContactRow> {
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const rows = await db
    .select()
    .from(schema.commsContacts)
    .where(and(eq(schema.commsContacts.id, id), eq(schema.commsContacts.organizationId, orgId)))
    .limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Contacto no encontrado' })
  return rows[0]
}

export async function loadCallForOrg(db: any, orgId: number, id: number): Promise<CallRow> {
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const rows = await db
    .select()
    .from(schema.commsCalls)
    .where(and(eq(schema.commsCalls.id, id), eq(schema.commsCalls.organizationId, orgId)))
    .limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Llamada no encontrada' })
  return rows[0]
}

/** Nombres de los clientes/leads vinculados a un conjunto de contactos, en dos consultas. */
export async function crmNamesFor(db: any, orgId: number, contacts: ContactRow[]): Promise<{ clients: Map<number, { id: number; name: string; email: string | null }>; leads: Map<number, { id: number; name: string; status: string; email: string | null }> }> {
  const clientIds = [...new Set(contacts.map((c) => c.clientId).filter((v): v is number => typeof v === 'number'))]
  const leadIds = [...new Set(contacts.map((c) => c.leadId).filter((v): v is number => typeof v === 'number'))]
  const clients = new Map<number, { id: number; name: string; email: string | null }>()
  const leads = new Map<number, { id: number; name: string; status: string; email: string | null }>()
  if (clientIds.length) {
    const rows = await db
      .select({ id: schema.clients.id, name: schema.clients.name, email: schema.clients.email })
      .from(schema.clients)
      .where(and(eq(schema.clients.organizationId, orgId), inArray(schema.clients.id, clientIds)))
    for (const r of rows) clients.set(r.id, r)
  }
  if (leadIds.length) {
    const rows = await db
      .select({ id: schema.leads.id, name: schema.leads.name, status: schema.leads.status, email: schema.leads.email })
      .from(schema.leads)
      .where(and(eq(schema.leads.organizationId, orgId), inArray(schema.leads.id, leadIds)))
    for (const r of rows) leads.set(r.id, r)
  }
  return { clients, leads }
}

export function serializeContact(contact: ContactRow, crm: { clients: Map<number, any>; leads: Map<number, any> }) {
  const client = contact.clientId ? crm.clients.get(contact.clientId) : null
  const lead = contact.leadId ? crm.leads.get(contact.leadId) : null
  return {
    id: contact.id,
    phone: contact.phoneE164,
    phoneDisplay: formatPhone(contact.phoneE164),
    displayName: contact.displayName,
    /** El nombre con el que se le conoce: el del CRM si está vinculado, si no el perfil de WhatsApp, si no el teléfono. */
    name: client?.name || lead?.name || contact.displayName || formatPhone(contact.phoneE164),
    known: Boolean(client || lead),
    client: client ? { id: client.id, name: client.name, email: client.email } : null,
    lead: lead ? { id: lead.id, name: lead.name, status: lead.status, email: lead.email } : null,
    consentStatus: contact.consentStatus,
    consentSource: contact.consentSource,
    consentUpdatedAt: contact.consentUpdatedAt,
    callPermissionStatus: contact.callPermissionStatus,
    callPermissionExpiresAt: contact.callPermissionExpiresAt,
    lastInboundAt: contact.lastInboundAt,
    clickToChatUrl: whatsappClickToChatUrl(contact.phoneE164),
    createdAt: contact.createdAt,
  }
}

export function serializeConversation(row: ConversationRow, contact: ContactRow, crm: { clients: Map<number, any>; leads: Map<number, any> }, channel?: { id: number; label: string; provider: string; phoneE164: string } | null, agentName?: string | null) {
  return {
    id: row.id,
    status: row.status,
    channel: channel ? { id: channel.id, label: channel.label, provider: channel.provider, phone: formatPhone(channel.phoneE164) } : { id: row.channelId },
    contact: serializeContact(contact, crm),
    assignedAgentId: row.assignedAgentId,
    assignedAgentName: agentName ?? null,
    propertyId: row.propertyId,
    propertyKind: row.propertyId ? (row.propertyKind ?? 'developer') : null,
    lastMessageAt: row.lastMessageAt,
    lastMessagePreview: row.lastMessagePreview,
    lastInboundAt: row.lastInboundAt,
    unreadCount: row.unreadCount,
    window: serviceWindow(row.lastInboundAt),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function serializeMessage(row: MessageRow) {
  const payload: any = safeJson(row.payloadJson)
  const hasMedia = Boolean(row.mediaKey || payload?.media)
  return {
    id: row.id,
    conversationId: row.conversationId,
    direction: row.direction,
    type: row.type,
    body: row.body,
    preview: previewOf({ type: row.type, body: row.body, mediaFilename: row.mediaFilename, templateName: row.templateName }),
    media: hasMedia
      ? {
          available: Boolean(row.mediaKey),
          mime: row.mediaMime || payload?.media?.mime || null,
          filename: row.mediaFilename || payload?.media?.filename || null,
          caption: payload?.media?.caption ?? null,
          /** Siempre por el endpoint del panel, que descarga del proveedor la primera vez y acota por organización. */
          url: `/api/admin/comms/messages/${row.id}/media`,
        }
      : row.mediaUrl
        ? { available: true, mime: null, filename: row.mediaFilename, caption: null, url: row.mediaUrl }
        : null,
    location: payload?.location ?? null,
    interactive: payload?.interactive ?? null,
    callId: payload?.callId ?? null,
    template: row.templateName ? { name: row.templateName, language: row.templateLanguage, params: safeJson(row.templateParamsJson) } : null,
    propertyId: row.propertyId,
    propertyKind: row.propertyId ? (row.propertyKind === 'agent' ? 'agent' : 'developer') : null,
    status: row.status,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    sentByUserId: row.sentByUserId,
    providerTimestamp: row.providerTimestamp,
    createdAt: row.createdAt,
  }
}

function safeJson(value: string | null): unknown {
  try {
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

export function serializeCall(row: CallRow, opts: { includeSession?: boolean } = {}) {
  let session: any = null
  if (opts.includeSession) {
    try {
      session = row.sessionJson ? JSON.parse(row.sessionJson) : null
    } catch {
      session = null
    }
  }
  return {
    id: row.id,
    channelId: row.channelId,
    contactId: row.contactId,
    conversationId: row.conversationId,
    direction: row.direction,
    provider: row.provider,
    status: row.status,
    outcome: row.outcome,
    notes: row.notes,
    agentId: row.agentId,
    userId: row.userId,
    propertyId: row.propertyId,
    propertyKind: row.propertyId ? (row.propertyKind === 'agent' ? 'agent' : 'developer') : null,
    followUpVisitId: row.followUpVisitId,
    startedAt: row.startedAt,
    answeredAt: row.answeredAt,
    endedAt: row.endedAt,
    durationSeconds: row.durationSeconds,
    errorMessage: row.errorMessage,
    session,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Origen público de la web de la agencia: su dominio propio si lo tiene, si no el de la petición (el *.workers.dev del inquilino por defecto). */
export async function publicSiteOrigin(db: any, orgId: number, event: H3Event): Promise<string> {
  const rows = await db.select({ domain: schema.organizations.domain }).from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1)
  const domain = rows[0]?.domain
  return domain ? `https://${domain}` : getRequestURL(event).origin
}

export interface PropertyShare {
  id: number
  kind: PropertyKind
  name: string
  /** Sólo developer-properties tiene página pública (agent-properties/2ª mano no se publica en la web — ver auditoría FASE 26/28). */
  url: string | null
  text: string
  imageLink: string | null
}

function formatPriceEs(value: number | null | undefined): string | null {
  if (value == null) return null
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value)} €`
}

function toMediaLink(key: string, origin: string): string {
  return key.startsWith('http') ? key : `${origin.replace(/\/$/, '')}${key.startsWith('/') ? key : `/api/media/${key}`}`
}

/**
 * El texto (y la foto) con los que se comparte una propiedad por WhatsApp —
 * de cualquiera de los dos catálogos (FASE 29 §124/§143: el picker de
 * Comunicaciones no puede ser el único sitio del panel que sólo conoce
 * developer-properties). Nunca datos internos: reutiliza
 * `toPublicProperty()` (mismo filtro que ya protege la ficha pública), así
 * que un `minimumAuthorizedPrice`/comisión/nota interna que se añada mañana
 * queda fuera aquí también sin tocar este archivo.
 */
export async function buildPropertyShare(db: any, orgId: number, propertyId: number, kind: PropertyKind, origin: string, note?: string | null): Promise<PropertyShare> {
  if (kind === 'developer') {
    const rows = await db
      .select({
        id: schema.developerProperties.id,
        name: schema.developerProperties.name,
        slug: schema.developerProperties.slug,
        price: schema.developerProperties.price,
        community: schema.developerProperties.community,
        coverImage: schema.developerProperties.coverImage,
        bedrooms: schema.developerProperties.bedrooms,
        area: schema.developerProperties.area,
        locationPrivacy: schema.developerProperties.locationPrivacy,
      })
      .from(schema.developerProperties)
      .where(and(eq(schema.developerProperties.id, propertyId), eq(schema.developerProperties.organizationId, orgId)))
      .limit(1)
    const raw = rows[0]
    if (!raw) throw createError({ statusCode: 404, statusMessage: 'Propiedad no encontrada' })
    const p = toPublicProperty(raw)
    const url = `${origin.replace(/\/$/, '')}/propiedades/${p.slug || p.id}`
    const facts = [formatPriceEs(p.price), p.bedrooms ? `${p.bedrooms} dorm.` : null, p.area ? `${Math.round(p.area)} m²` : null].filter(Boolean).join(' · ')
    const lines = [`🏠 ${p.name}`, p.community || null, facts || null, note?.trim() || null, url].filter(Boolean)
    return { id: p.id, kind, name: p.name, url, text: lines.join('\n'), imageLink: p.coverImage ? toMediaLink(String(p.coverImage), origin) : null }
  }

  // 2ª mano no tiene página pública (§124: "sólo datos publicables" no
  // implica que exista un enlace — sin uno, el mensaje sólo lleva texto y
  // foto, nunca un enlace inventado a una página que no existe).
  const rows = await db
    .select({
      id: schema.agentProperties.id,
      price: schema.agentProperties.price,
      city: schema.agentProperties.city,
      street: schema.agentProperties.street,
      mainImage: schema.agentProperties.mainImage,
      bedrooms: schema.agentProperties.bedrooms,
      area: schema.agentProperties.area,
      locationPrivacy: schema.agentProperties.locationPrivacy,
    })
    .from(schema.agentProperties)
    .where(and(eq(schema.agentProperties.id, propertyId), eq(schema.agentProperties.organizationId, orgId)))
    .limit(1)
  const raw = rows[0]
  if (!raw) throw createError({ statusCode: 404, statusMessage: 'Propiedad no encontrada' })
  const p = toPublicProperty(raw) as typeof raw
  const name = p.street || p.city || `Inmueble #${p.id}`
  const facts = [formatPriceEs(p.price), p.bedrooms ? `${p.bedrooms} dorm.` : null, p.area ? `${Math.round(p.area)} m²` : null].filter(Boolean).join(' · ')
  const lines = [`🏠 ${name}`, p.city || null, facts || null, note?.trim() || null].filter(Boolean)
  return { id: p.id, kind, name, url: null, text: lines.join('\n'), imageLink: p.mainImage ? toMediaLink(String(p.mainImage), origin) : null }
}

/**
 * FASE 29 §136 — reintenta un envío saliente que quedó `failed` (el
 * proveedor ya lo rechazó de verdad: `sendOutbound()` sólo guarda fila una
 * vez que llamó al proveedor, nunca antes). No reescribe la fila fallida:
 * crea un mensaje nuevo, igual que un reenvío real — el fallido se queda en
 * el hilo como lo que fue, para que el historial no mienta.
 *
 * `property_share` reconstruye la ficha **en vivo** con `buildPropertyShare`
 * en vez de reusar el texto guardado — si el precio cambió entre el intento
 * fallido y el reintento, sale el precio real, no uno viejo.
 */
export async function retryOutboundMessage(
  db: any,
  env: Record<string, any>,
  input: { channel: LoadedChannel; conversation: ConversationRow; contact: ContactRow; failed: MessageRow; userId: number; origin: string; statusCallbackUrl?: string | null; fetchImpl?: typeof fetch },
): Promise<SendOutboundResult> {
  const { channel, conversation, contact, failed, userId, origin } = input
  if (failed.direction !== 'out' || failed.status !== 'failed') throw createError({ statusCode: 409, statusMessage: 'Sólo se puede reintentar un envío que quedó fallido.' })

  let message: OutboundMessage
  let displayBody: string | null = failed.body
  let storeAs: string | null = null
  let propertyId: number | null = null
  let propertyKind: PropertyKind | null = null

  if (failed.type === 'property_share' && failed.propertyId) {
    const kind: PropertyKind = failed.propertyKind === 'agent' ? 'agent' : 'developer'
    const share = await buildPropertyShare(db, channel.organizationId, failed.propertyId, kind, origin)
    const useImage = Boolean(share.imageLink) && PROVIDERS[channel.provider].capabilities.media && share.text.length <= 1024
    message = useImage ? { kind: 'image', link: share.imageLink!, caption: share.text } : { kind: 'text', body: share.text, previewUrl: Boolean(share.url) }
    displayBody = share.text
    storeAs = 'property_share'
    propertyId = share.id
    propertyKind = kind
  } else if (failed.type === 'template' && failed.templateName) {
    const tpl = await db
      .select()
      .from(schema.commsTemplates)
      .where(and(eq(schema.commsTemplates.channelId, channel.id), eq(schema.commsTemplates.organizationId, channel.organizationId), eq(schema.commsTemplates.name, failed.templateName), eq(schema.commsTemplates.language, failed.templateLanguage || '')))
      .limit(1)
    const template = tpl[0]
    if (!template) throw createError({ statusCode: 409, statusMessage: 'Esta plantilla ya no existe en el canal: no se puede reintentar tal cual.' })
    const params = failed.templateParamsJson ? JSON.parse(failed.templateParamsJson) : []
    message = { kind: 'template', name: template.name, language: template.language, params, contentSid: channel.provider === 'twilio' ? template.externalId : null }
  } else if (failed.type === 'image' || failed.type === 'document') {
    if (!failed.mediaUrl) throw createError({ statusCode: 409, statusMessage: 'Este mensaje no tiene archivo guardado: no se puede reintentar.' })
    message = failed.type === 'image' ? { kind: 'image', link: failed.mediaUrl, caption: failed.body } : { kind: 'document', link: failed.mediaUrl, caption: failed.body, filename: failed.mediaFilename }
  } else if (failed.type === 'text') {
    if (!failed.body) throw createError({ statusCode: 409, statusMessage: 'Este mensaje no tiene texto guardado: no se puede reintentar.' })
    message = { kind: 'text', body: failed.body }
  } else {
    throw createError({ statusCode: 422, statusMessage: 'Este tipo de mensaje no se puede reintentar desde aquí.' })
  }

  const result = await sendOutbound(db, { channel, env, conversation, contact, message, displayBody, storeAs, propertyId, propertyKind, userId, statusCallbackUrl: input.statusCallbackUrl ?? null, fetchImpl: input.fetchImpl })
  if (result.ok && propertyId && (conversation.propertyId !== propertyId || conversation.propertyKind !== propertyKind)) {
    await db.update(schema.commsConversations).set({ propertyId, propertyKind, updatedAt: now() }).where(eq(schema.commsConversations.id, conversation.id))
  }
  return result
}

/** Capacidades efectivas de la agencia: las del canal por defecto, o ninguna si no hay canal activo. */
export async function orgCapabilities(db: any, env: Record<string, any>, orgId: number): Promise<{ channels: ChannelView[]; defaultChannel: ChannelView | null; capabilities: ProviderCapabilities }> {
  const channels = await listChannels(db, env, orgId)
  const active = channels.filter((c) => c.status === 'active')
  const defaultChannel = active.find((c) => c.isDefault) || active[0] || null
  const capabilities = defaultChannel ? { ...PROVIDERS[defaultChannel.provider].capabilities, calling: PROVIDERS[defaultChannel.provider].capabilities.calling && defaultChannel.callingStatus === 'enabled' } : NO_CAPABILITIES
  return { channels, defaultChannel, capabilities }
}

const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

export interface FollowUpInput {
  orgId: number
  contact: ContactRow
  contactName: string
  agentId: number
  /** 'YYYY-MM-DD HH:MM:SS' */
  scheduledAt: string
  channel?: 'in_person' | 'video' | 'phone'
  propertyId?: number | null
  /** De qué catálogo es `propertyId` — la propiedad de contexto de un hilo puede ser de 2ª mano desde el incremento 1 de FASE 29. */
  propertyKind?: PropertyKind | null
  notes?: string | null
}

/** Una visita/llamada de seguimiento en la agenda del comercial, con la misma comprobación de solapes que la reserva pública. */
export async function createFollowUpVisit(db: any, input: FollowUpInput): Promise<{ id: number; scheduledAt: string; agentName: string; propertyName: string | null }> {
  if (!DATETIME_RE.test(input.scheduledAt)) throw createError({ statusCode: 422, statusMessage: 'Fecha y hora no válidas (YYYY-MM-DD HH:MM:SS).' })
  const agents = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, slotDurationMinutes: schema.teamMembers.slotDurationMinutes })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.id, input.agentId), eq(schema.teamMembers.organizationId, input.orgId)))
    .limit(1)
  const agent = agents[0]
  if (!agent) throw createError({ statusCode: 404, statusMessage: 'Comercial no encontrado' })

  // Mismo criterio que appointments/adminCreate.ts: la propiedad se resuelve
  // en SU catálogo y dentro de la organización. Antes sólo se buscaba en
  // obra nueva y sin comprobar que existiera, así que un seguimiento sobre
  // una propiedad de 2ª mano quedaba apuntando a la de obra nueva con el
  // mismo id (o a ninguna).
  let propertyName: string | null = null
  const propertyKind: PropertyKind | null = input.propertyId ? input.propertyKind || 'developer' : null
  if (input.propertyId) {
    if (propertyKind === 'agent') {
      const rows = await db
        .select({ reference: schema.agentProperties.reference, street: schema.agentProperties.street, streetNumber: schema.agentProperties.streetNumber })
        .from(schema.agentProperties)
        .where(and(eq(schema.agentProperties.id, input.propertyId), eq(schema.agentProperties.organizationId, input.orgId)))
        .limit(1)
      if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Inmueble no encontrado' })
      propertyName = rows[0].reference || [rows[0].street, rows[0].streetNumber].filter(Boolean).join(' ') || null
    } else {
      const rows = await db
        .select({ name: schema.developerProperties.name })
        .from(schema.developerProperties)
        .where(and(eq(schema.developerProperties.id, input.propertyId), eq(schema.developerProperties.organizationId, input.orgId)))
        .limit(1)
      if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Inmueble no encontrado' })
      propertyName = rows[0].name
    }
  }

  const endsAt = shiftDateTime(input.scheduledAt, agent.slotDurationMinutes)
  if (await hasOverlappingVisit(db, input.orgId, agent.id, input.scheduledAt, endsAt)) {
    throw createError({ statusCode: 409, statusMessage: 'Ese comercial ya tiene otra cita en ese horario.' })
  }
  const nowTs = now()
  // FASE 17 (migración 0072): un seguimiento con inmueble adjunto es una
  // visita de verdad (el cliente va a ver algo concreto); sin inmueble es
  // sólo contacto (llamada o videollamada de seguimiento) — `type` es el
  // PARA QUÉ, independiente del canal (`channel`, el CÓMO) que ya elige quien
  // programa el seguimiento.
  const type = input.propertyId ? 'property_viewing' : 'call'
  try {
    const [visit] = await db
      .insert(schema.visits)
      .values({
        organizationId: input.orgId,
        clientName: input.contactName,
        propertyId: input.propertyId ?? null,
        propertyKind,
        propertyName,
        agentId: agent.id,
        agentName: agent.name,
        scheduledAt: input.scheduledAt,
        durationMinutes: agent.slotDurationMinutes,
        endsAt,
        status: 'scheduled',
        channel: input.channel || 'phone',
        type,
        notes: [`Seguimiento creado desde Comunicaciones (WhatsApp ${formatPhone(input.contact.phoneE164)})`, input.notes?.trim() || null].filter(Boolean).join('\n'),
        clientPhone: input.contact.phoneE164,
        // FK real desde FASE 17 (migración 0072) — mismo criterio que adminCreate.ts/tours.ts/book.post.ts.
        leadId: input.contact.leadId ?? null,
        managementToken: generateManagementToken(),
        createdAt: nowTs,
      })
      .returning({ id: schema.visits.id, scheduledAt: schema.visits.scheduledAt })
    if (input.contact.leadId) await syncLeadNextAction(db, input.orgId, input.contact.leadId)
    return { id: visit.id, scheduledAt: visit.scheduledAt, agentName: agent.name, propertyName }
  } catch (e: any) {
    if (isUniqueConstraintError(e)) throw createError({ statusCode: 409, statusMessage: 'Ese comercial ya tiene otra cita en ese horario.' })
    throw e
  }
}

/** Ids de las conversaciones abiertas con no leídos, para el contador global. */
export async function unreadTotal(db: any, orgId: number): Promise<number> {
  const rows = await db
    .select({ unread: schema.commsConversations.unreadCount })
    .from(schema.commsConversations)
    .where(and(eq(schema.commsConversations.organizationId, orgId), isNotNull(schema.commsConversations.lastMessageAt)))
  return rows.reduce((sum: number, r: any) => sum + (r.unread || 0), 0)
}

export async function agentNames(db: any, orgId: number, ids: (number | null)[]): Promise<Map<number, string>> {
  const clean = [...new Set(ids.filter((v): v is number => typeof v === 'number'))]
  const map = new Map<number, string>()
  if (!clean.length) return map
  const rows = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.organizationId, orgId), inArray(schema.teamMembers.id, clean)))
  for (const r of rows) map.set(r.id, r.name)
  return map
}
