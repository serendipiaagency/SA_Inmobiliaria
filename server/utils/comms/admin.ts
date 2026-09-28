import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { createError, getRequestURL, type H3Event } from 'h3'
import * as schema from '../../db/schema'
import { isUniqueConstraintError, now } from '../db'
import { hasOverlappingVisit, shiftDateTime } from '../appointments/availability'
import { generateManagementToken } from '../appointments/managementToken'
import { listChannels } from './credentials'
import { previewOf, serviceWindow } from './inbox'
import { formatPhone, whatsappClickToChatUrl } from './phone'
import { NO_CAPABILITIES, PROVIDERS } from './providers/registry'
import type { ChannelView, ProviderCapabilities } from './types'

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
  name: string
  url: string
  text: string
  imageLink: string | null
}

function formatPriceEs(value: number | null | undefined): string | null {
  if (value == null) return null
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value)} €`
}

/** El texto (y la foto de portada) con los que se comparte una propiedad de la web por WhatsApp, con su enlace público. */
export async function buildPropertyShare(db: any, orgId: number, propertyId: number, origin: string, note?: string | null): Promise<PropertyShare> {
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
    })
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.id, propertyId), eq(schema.developerProperties.organizationId, orgId)))
    .limit(1)
  const p = rows[0]
  if (!p) throw createError({ statusCode: 404, statusMessage: 'Propiedad no encontrada' })
  const url = `${origin.replace(/\/$/, '')}/propiedades/${p.slug || p.id}`
  const facts = [formatPriceEs(p.price), p.bedrooms ? `${p.bedrooms} dorm.` : null, p.area ? `${Math.round(p.area)} m²` : null].filter(Boolean).join(' · ')
  const lines = [`🏠 ${p.name}`, p.community || null, facts || null, note?.trim() || null, url].filter(Boolean)
  let imageLink: string | null = null
  if (p.coverImage) {
    const key = String(p.coverImage)
    imageLink = key.startsWith('http') ? key : `${origin.replace(/\/$/, '')}${key.startsWith('/') ? key : `/api/media/${key}`}`
  }
  return { id: p.id, name: p.name, url, text: lines.join('\n'), imageLink }
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

  let propertyName: string | null = null
  if (input.propertyId) {
    const props = await db
      .select({ name: schema.developerProperties.name })
      .from(schema.developerProperties)
      .where(and(eq(schema.developerProperties.id, input.propertyId), eq(schema.developerProperties.organizationId, input.orgId)))
      .limit(1)
    propertyName = props[0]?.name ?? null
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
        managementToken: generateManagementToken(),
        createdAt: nowTs,
      })
      .returning({ id: schema.visits.id, scheduledAt: schema.visits.scheduledAt })
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
