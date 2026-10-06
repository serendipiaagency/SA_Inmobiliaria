import { and, desc, eq, gt, inArray, isNotNull, isNull, like, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import { recordActivity } from '../activity/service'
import { markLeadContacted } from '../leads/sla'
import { sendTransactionalEmail } from '../email/send'
import type { PropertyKind } from '../matching/service'
import { assertLiveProperty } from '../properties/trash'
import { agentNames, buildPropertyShare } from './admin'
import { normalizePhone } from './phone'
import { PREVIEW_MAX } from './inbox'
import { createPropertyShareLink, personalPropertyUrl, randomUrlToken, sha256OfText } from './shareLinks'
import { threadReplyAddress } from './inboundAddress'
import { inJsonList } from '../sqlChunks'

/**
 * Hilos web de la bandeja de Comunicaciones (bloque N8a, FASE 29;
 * migración 0087): cada envío de un formulario público y cada conversación
 * del chat de la web es un hilo, con su Contact, Lead y Property GUARDADOS.
 *
 *   - Formulario web (`kind = form`): contacto, formulario de captación del
 *     Constructor Web, solicitud de visita, verificación de visitante y
 *     referidos. Los envíos de la misma persona (mismo lead, mismo Contact o
 *     mismo email) se acumulan en un mismo hilo.
 *   - Chat web (`kind = chat`): el widget de la web pública. El visitante
 *     recibe un token opaco (sólo se guarda su SHA-256) que es la única
 *     credencial para leer y escribir en SU hilo; con él no se puede llegar
 *     a ningún otro dato.
 *
 * Responder sólo por canales reales: el chat (si el visitante tiene la
 * sesión abierta), el email transaccional existente (si dejó email y la
 * plataforma tiene el email conectado) o WhatsApp (la bandeja abre el hilo
 * de WhatsApp con su teléfono, que exige un número conectado). Si no hay
 * canal, se dice — nunca se simula un envío.
 *
 * Email entrante (FASE 29): con la plataforma configurada
 * (server/utils/comms/inboundAddress.ts), el email de un hilo sale con un
 * Reply-To firmado de ese hilo y la respuesta del cliente vuelve a él
 * (`appendInboundEmailMessage`, desde server/utils/comms/inboundEmail.ts).
 *
 * Igual que inbox.ts, no depende del evento H3 salvo para lanzar errores:
 * el alta de leads (`upsertLead`, que sí lo necesita) se inyecta.
 */

export const WEB_THREAD_KINDS = ['form', 'chat'] as const
export type WebThreadKind = (typeof WEB_THREAD_KINDS)[number]

export const WEB_FORM_TYPES = ['contact', 'lead_form', 'visit_request', 'visitor', 'referral'] as const
export type WebFormType = (typeof WEB_FORM_TYPES)[number]
export const WEB_FORM_TYPE_LABELS: Record<WebFormType, string> = {
  contact: 'Formulario de contacto',
  lead_form: 'Formulario de captación',
  visit_request: 'Solicitud de visita',
  visitor: 'Verificación de visitante',
  referral: 'Referido',
}

export const WEB_CHANNEL_LABELS: Record<WebThreadKind, string> = { form: 'Formulario web', chat: 'Chat web' }

/** Días que dura la sesión del chat desde la última vez que el visitante escribió. */
export const CHAT_SESSION_DAYS = 30
export const CHAT_MESSAGE_MAX = 2000
export const CHAT_NAME_MAX = 120
/** Enlaces como máximo por mensaje del visitante (spam). */
export const CHAT_MAX_LINKS = 3
/** Mensajes seguidos del visitante sin respuesta del equipo antes de pedirle que espere. */
export const CHAT_MAX_UNANSWERED = 15
export const WEB_REPLY_MAX = 4000

type WebThreadRow = typeof schema.commsWebThreads.$inferSelect
type WebMessageRow = typeof schema.commsWebMessages.$inferSelect

// --- utilidades ------------------------------------------------------------------

/** La clave con la que la bandeja (URL `?conversation=` y rutas `/conversations/:id`) distingue un hilo web de uno de WhatsApp. */
export function webThreadKey(id: number): string {
  return `w${id}`
}

/** `w12` → 12; cualquier otra cosa → null (incluidos los ids numéricos de WhatsApp). */
export function parseWebThreadKey(raw: unknown): number | null {
  const m = /^w([1-9]\d{0,9})$/.exec(String(raw ?? ''))
  return m ? Number(m[1]) : null
}

function addDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().replace('T', ' ').slice(0, 19)
}

function preview(text: string | null | undefined): string {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX - 1)}…` : t
}

function stripControl(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

function invalid(message: string, statusCode = 422): never {
  throw createError({ statusCode, statusMessage: message })
}

/** Texto de un mensaje del visitante: obligatorio, acotado y sin ráfagas de enlaces. */
export function validateVisitorText(raw: unknown): string {
  const text = stripControl(String(raw ?? '').replace(/\r\n/g, '\n')).trim()
  if (!text) invalid('Escribe un mensaje.')
  if (text.length > CHAT_MESSAGE_MAX) invalid(`El mensaje admite como máximo ${CHAT_MESSAGE_MAX} caracteres.`)
  if ((text.match(/https?:\/\/|www\./gi) || []).length > CHAT_MAX_LINKS) invalid('El mensaje tiene demasiados enlaces.')
  return text
}

// --- formularios ------------------------------------------------------------------

export interface WebFormSubmissionInput {
  orgId: number
  formType: WebFormType
  /** El lead que acaba de crear/actualizar `upsertLead()` para este envío. */
  leadId?: number | null
  name: string
  email?: string | null
  phone?: string | null
  /** Lo que la persona escribió (o un resumen fiel del formulario cuando no hay campo de mensaje). */
  message: string
  /** Campos de texto del formulario tal cual (nunca ficheros). */
  fields?: Record<string, string | number | null | undefined>
  propertyId?: number | null
  propertyKind?: PropertyKind | null
  pageUrl?: string | null
}

async function leadPerson(db: any, orgId: number, leadId: number | null | undefined): Promise<{ leadId: number | null; contactId: number | null; agentId: number | null }> {
  if (!leadId) return { leadId: null, contactId: null, agentId: null }
  const [lead] = await db
    .select({ id: schema.leads.id, contactId: schema.leads.contactId, agentId: schema.leads.agentId })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))
    .limit(1)
  return lead ? { leadId: lead.id, contactId: lead.contactId ?? null, agentId: lead.agentId ?? null } : { leadId: null, contactId: null, agentId: null }
}

/**
 * Deja un envío de formulario como hilo «Formulario web» de la bandeja,
 * vinculado a su Lead, al Contact de ese lead y a la propiedad. Reutiliza el
 * hilo de formulario de la misma persona (lead → Contact → email) y lo
 * reabre. Lo llaman las rutas públicas DESPUÉS de guardar lo suyo, dentro de
 * un try/catch: el formulario nunca falla por esto.
 */
export async function recordWebFormSubmission(db: any, input: WebFormSubmissionInput): Promise<{ threadId: number; created: boolean; messageId: number }> {
  const orgId = input.orgId
  const person = await leadPerson(db, orgId, input.leadId)
  const email = input.email ? String(input.email).trim().toLowerCase().slice(0, 200) : null
  const phone = input.phone ? String(input.phone).trim().slice(0, 50) : null
  const body = stripControl(String(input.message || '').trim()).slice(0, 5000) || WEB_FORM_TYPE_LABELS[input.formType]
  const ts = now()
  const T = schema.commsWebThreads

  const owner = person.leadId ? eq(T.leadId, person.leadId) : person.contactId ? eq(T.contactId, person.contactId) : email ? sql`lower(${T.visitorEmail}) = ${email}` : null
  const [existing]: WebThreadRow[] = owner
    ? await db
        .select()
        .from(T)
        .where(and(eq(T.organizationId, orgId), eq(T.kind, 'form'), owner))
        .orderBy(desc(T.id))
        .limit(1)
    : []

  let threadId: number
  let created = false
  const touch = {
    status: 'open',
    formType: input.formType,
    lastMessageAt: ts,
    lastMessagePreview: preview(body),
    lastInboundAt: ts,
    updatedAt: ts,
  }
  if (existing) {
    threadId = existing.id
    await db
      .update(T)
      .set({
        ...touch,
        unreadCount: sql`${T.unreadCount} + 1`,
        ...(person.leadId && !existing.leadId ? { leadId: person.leadId } : {}),
        ...(person.contactId && !existing.contactId ? { contactId: person.contactId } : {}),
        ...(person.agentId && !existing.assignedAgentId ? { assignedAgentId: person.agentId } : {}),
        ...(email && !existing.visitorEmail ? { visitorEmail: email } : {}),
        ...(phone && !existing.visitorPhone ? { visitorPhone: phone } : {}),
        ...(input.propertyId ? { propertyId: input.propertyId, propertyKind: input.propertyKind || 'developer' } : {}),
        ...(input.pageUrl ? { pageUrl: String(input.pageUrl).slice(0, 500) } : {}),
      })
      .where(eq(T.id, existing.id))
  } else {
    const [row] = await db
      .insert(T)
      .values({
        organizationId: orgId,
        kind: 'form',
        assignedAgentId: person.agentId,
        contactId: person.contactId,
        leadId: person.leadId,
        propertyId: input.propertyId ?? null,
        propertyKind: input.propertyId ? input.propertyKind || 'developer' : null,
        visitorName: String(input.name || '').trim().slice(0, CHAT_NAME_MAX) || null,
        visitorEmail: email,
        visitorPhone: phone,
        pageUrl: input.pageUrl ? String(input.pageUrl).slice(0, 500) : null,
        unreadCount: 1,
        createdAt: ts,
        ...touch,
      })
      .returning({ id: T.id })
    threadId = row.id
    created = true
  }

  const fields = Object.fromEntries(
    Object.entries(input.fields || {})
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
      .map(([k, v]) => [k.slice(0, 60), String(v).slice(0, 500)]),
  )
  const [message] = await db
    .insert(schema.commsWebMessages)
    .values({
      organizationId: orgId,
      threadId,
      direction: 'in',
      via: 'form',
      body,
      fieldsJson: Object.keys(fields).length ? JSON.stringify({ formType: input.formType, ...fields }) : JSON.stringify({ formType: input.formType }),
      propertyId: input.propertyId ?? null,
      propertyKind: input.propertyId ? input.propertyKind || 'developer' : null,
      status: 'received',
      createdAt: ts,
    })
    .returning({ id: schema.commsWebMessages.id })
  return { threadId, created, messageId: message.id }
}

// --- chat web (lado del visitante) -------------------------------------------------

/** Lo único que ve el visitante de un mensaje: quién, qué y cuándo. Nunca notas internas, ni quién del equipo, ni ids de otros hilos. */
export interface PublicChatMessage {
  id: number
  from: 'visitor' | 'agency'
  body: string
  createdAt: string
}

function toPublicMessage(row: WebMessageRow): PublicChatMessage {
  return { id: row.id, from: row.direction === 'in' ? 'visitor' : 'agency', body: row.body || '', createdAt: row.createdAt }
}

/** Lo que el lead del chat necesita del pipeline central (`upsertLead`): lo inyecta la ruta pública. */
export type ChatCreateLeadFn = (input: { name: string; email: string | null; phone: string | null; message: string; propertyId: number | null; propertyName: string | null }) => Promise<{ id: number } | null>

export interface ChatStartInput {
  orgId: number
  name: string
  email?: string | null
  phone?: string | null
  message: string
  propertyId?: number | null
  propertyName?: string | null
  pageUrl?: string | null
}

export interface ChatSessionView {
  token: string
  expiresAt: string
  status: string
  messages: PublicChatMessage[]
}

async function visibleMessages(db: any, thread: WebThreadRow, afterId = 0, limit = 50): Promise<WebMessageRow[]> {
  const M = schema.commsWebMessages
  return db
    .select()
    .from(M)
    .where(and(eq(M.threadId, thread.id), eq(M.organizationId, thread.organizationId), ne(M.direction, 'note'), gt(M.id, afterId)))
    .orderBy(M.id)
    .limit(limit)
}

/** El hilo de chat de este token en esta agencia, o null (no existe, es de otra agencia o caducó). */
export async function findChatThreadByToken(db: any, orgId: number, token: unknown): Promise<WebThreadRow | null> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null
  const T = schema.commsWebThreads
  const [row] = await db
    .select()
    .from(T)
    .where(and(eq(T.sessionTokenHash, await sha256OfText(token)), eq(T.organizationId, orgId), eq(T.kind, 'chat')))
    .limit(1)
  if (!row) return null
  if (!row.sessionExpiresAt || row.sessionExpiresAt <= now()) return null
  return row
}

async function appendVisitorMessage(db: any, thread: WebThreadRow, text: string): Promise<WebMessageRow> {
  const M = schema.commsWebMessages
  // Anti-abuso: un visitante no puede llenar el hilo de mensajes sin que nadie le conteste.
  const [lastOut] = await db
    .select({ id: M.id })
    .from(M)
    .where(and(eq(M.threadId, thread.id), eq(M.direction, 'out')))
    .orderBy(desc(M.id))
    .limit(1)
  const [pending] = await db
    .select({ n: sql<number>`count(*)` })
    .from(M)
    .where(and(eq(M.threadId, thread.id), eq(M.direction, 'in'), gt(M.id, lastOut?.id ?? 0)))
  if (Number(pending?.n ?? 0) >= CHAT_MAX_UNANSWERED) invalid('Has enviado muchos mensajes seguidos. Espera a que el equipo te responda.', 429)

  const ts = now()
  const [row] = await db
    .insert(M)
    .values({ organizationId: thread.organizationId, threadId: thread.id, direction: 'in', via: 'chat', body: text, status: 'received', createdAt: ts })
    .returning()
  const T = schema.commsWebThreads
  await db
    .update(T)
    .set({
      status: thread.status === 'closed' ? 'open' : thread.status,
      lastMessageAt: ts,
      lastMessagePreview: preview(text),
      lastInboundAt: ts,
      unreadCount: sql`${T.unreadCount} + 1`,
      sessionExpiresAt: addDays(CHAT_SESSION_DAYS),
      updatedAt: ts,
    })
    .where(eq(T.id, thread.id))
  return row
}

/**
 * El visitante abre una conversación (o, si su token sigue vivo, escribe en
 * la que ya tenía). Con email o teléfono se crea/reutiliza su lead por el
 * pipeline central (origen web, detalle «Chat web»); sin ellos es un
 * visitante anónimo al que sólo se le puede responder por el chat.
 */
export async function startWebChat(db: any, input: ChatStartInput, deps: { token?: unknown; createLead?: ChatCreateLeadFn } = {}): Promise<ChatSessionView & { threadId: number; created: boolean }> {
  const text = validateVisitorText(input.message)
  const reused = await findChatThreadByToken(db, input.orgId, deps.token)
  if (reused) {
    await appendVisitorMessage(db, reused, text)
    const fresh = (await db.select().from(schema.commsWebThreads).where(eq(schema.commsWebThreads.id, reused.id)).limit(1))[0] as WebThreadRow
    const rows = await visibleMessages(db, fresh, 0, 200)
    return { token: String(deps.token), expiresAt: fresh.sessionExpiresAt!, status: fresh.status, messages: rows.map(toPublicMessage), threadId: fresh.id, created: false }
  }

  const name = stripControl(String(input.name || '')).trim().slice(0, CHAT_NAME_MAX)
  if (!name) invalid('Dinos tu nombre para empezar.')
  const email = input.email ? String(input.email).trim().toLowerCase().slice(0, 200) : null
  const phone = input.phone ? String(input.phone).trim().slice(0, 50) : null

  let person = { leadId: null as number | null, contactId: null as number | null, agentId: null as number | null }
  if ((email || phone) && deps.createLead) {
    try {
      const lead = await deps.createLead({ name, email, phone, message: text, propertyId: input.propertyId ?? null, propertyName: input.propertyName ?? null })
      if (lead?.id) person = await leadPerson(db, input.orgId, lead.id)
    } catch {
      // El chat no se bloquea por el pipeline de leads: el hilo se crea igual, sin lead.
    }
  }

  const token = randomUrlToken(32)
  const ts = now()
  const expiresAt = addDays(CHAT_SESSION_DAYS)
  const T = schema.commsWebThreads
  const [thread] = await db
    .insert(T)
    .values({
      organizationId: input.orgId,
      kind: 'chat',
      status: 'open',
      assignedAgentId: person.agentId,
      contactId: person.contactId,
      leadId: person.leadId,
      propertyId: input.propertyId ?? null,
      propertyKind: input.propertyId ? 'developer' : null,
      visitorName: name,
      visitorEmail: email,
      visitorPhone: phone,
      pageUrl: input.pageUrl ? String(input.pageUrl).slice(0, 500) : null,
      sessionTokenHash: await sha256OfText(token),
      sessionExpiresAt: expiresAt,
      lastMessageAt: ts,
      lastMessagePreview: preview(text),
      lastInboundAt: ts,
      unreadCount: 1,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
  const [message] = await db
    .insert(schema.commsWebMessages)
    .values({ organizationId: input.orgId, threadId: thread.id, direction: 'in', via: 'chat', body: text, propertyId: input.propertyId ?? null, propertyKind: input.propertyId ? 'developer' : null, status: 'received', createdAt: ts })
    .returning()
  return { token, expiresAt, status: 'open', messages: [toPublicMessage(message)], threadId: thread.id, created: true }
}

/** Un mensaje más del visitante en su hilo. 404 si el token no vale en esta agencia. */
export async function postWebChatMessage(db: any, orgId: number, token: unknown, rawText: unknown): Promise<PublicChatMessage> {
  const thread = await findChatThreadByToken(db, orgId, token)
  if (!thread) invalid('Esta conversación ya no está disponible. Empieza una nueva.', 404)
  const text = validateVisitorText(rawText)
  return toPublicMessage(await appendVisitorMessage(db, thread, text))
}

/**
 * Sondeo del widget: los mensajes de SU hilo posteriores a `afterId` (sin
 * notas internas). Las respuestas del equipo que llegan al navegador pasan a
 * `delivered` — es lo único que se sabe con certeza (no si las leyó).
 */
export async function pollWebChat(db: any, orgId: number, token: unknown, afterId: unknown): Promise<{ status: string; messages: PublicChatMessage[] }> {
  const thread = await findChatThreadByToken(db, orgId, token)
  if (!thread) invalid('Esta conversación ya no está disponible. Empieza una nueva.', 404)
  const after = Number.isInteger(Number(afterId)) && Number(afterId) > 0 ? Number(afterId) : 0
  const rows = await visibleMessages(db, thread, after)
  const delivered = rows.filter((r) => r.direction === 'out' && r.via === 'chat' && r.status === 'sent').map((r) => r.id)
  if (delivered.length) {
    await db
      .update(schema.commsWebMessages)
      .set({ status: 'delivered' })
      .where(and(eq(schema.commsWebMessages.threadId, thread.id), inJsonList(schema.commsWebMessages.id, delivered)))
  }
  return { status: thread.status, messages: rows.map(toPublicMessage) }
}

// --- email entrante (FASE 29) -----------------------------------------------------

export interface InboundEmailReplyInput {
  /** Texto ya extraído del correo, sin la cita del mensaje anterior y acotado (server/utils/comms/inboundEmail.ts). */
  body: string
  /** Lo que enseña la burbuja junto al texto: asunto, remitente, adjuntos no guardados… Nunca el HTML ni el correo crudo. */
  fields: Record<string, string>
}

/**
 * La respuesta del cliente por email entra en SU hilo (FASE 29): un mensaje
 * `in` por `email` y, como un mensaje entrante del chat, el hilo se reabre si
 * estaba cerrado, pasa a ser el último mensaje y suma un no leído en la
 * bandeja. Los efectos sobre la persona (último contacto del lead, Actividad,
 * Lead Score) los aplica quien llama, después de guardarlo.
 */
export async function appendInboundEmailMessage(db: any, thread: WebThreadRow, input: InboundEmailReplyInput): Promise<WebMessageRow> {
  const ts = now()
  const body = stripControl(String(input.body || '')).trim()
  const [row] = await db
    .insert(schema.commsWebMessages)
    .values({ organizationId: thread.organizationId, threadId: thread.id, direction: 'in', via: 'email', body, fieldsJson: JSON.stringify(input.fields || {}), status: 'received', createdAt: ts })
    .returning()
  const T = schema.commsWebThreads
  await db
    .update(T)
    .set({
      status: thread.status === 'closed' ? 'open' : thread.status,
      lastMessageAt: ts,
      lastMessagePreview: preview(body),
      lastInboundAt: ts,
      unreadCount: sql`${T.unreadCount} + 1`,
      updatedAt: ts,
    })
    .where(and(eq(T.id, thread.id), eq(T.organizationId, thread.organizationId)))
  return row
}

// --- panel: carga, listado y serialización --------------------------------------

export async function loadWebThreadForOrg(db: any, orgId: number, id: number): Promise<WebThreadRow> {
  if (!Number.isInteger(id) || id <= 0) invalid('Invalid id', 400)
  const [row] = await db
    .select()
    .from(schema.commsWebThreads)
    .where(and(eq(schema.commsWebThreads.id, id), eq(schema.commsWebThreads.organizationId, orgId)))
    .limit(1)
  if (!row) invalid('Conversación no encontrada', 404)
  return row
}

interface PeopleMaps {
  contacts: Map<number, { id: number; name: string; email: string | null; phone: string | null }>
  leads: Map<number, { id: number; name: string; status: string; email: string | null }>
  agents: Map<number, string>
}

async function peopleFor(db: any, orgId: number, rows: WebThreadRow[]): Promise<PeopleMaps> {
  const contactIds = [...new Set(rows.map((r) => r.contactId).filter((v): v is number => typeof v === 'number'))]
  const leadIds = [...new Set(rows.map((r) => r.leadId).filter((v): v is number => typeof v === 'number'))]
  const contacts = new Map<number, any>()
  const leads = new Map<number, any>()
  if (contactIds.length) {
    const found = await db
      .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.organizationId, orgId), inJsonList(schema.contacts.id, contactIds)))
    for (const c of found) contacts.set(c.id, c)
  }
  if (leadIds.length) {
    const found = await db
      .select({ id: schema.leads.id, name: schema.leads.name, status: schema.leads.status, email: schema.leads.email })
      .from(schema.leads)
      .where(and(eq(schema.leads.organizationId, orgId), inJsonList(schema.leads.id, leadIds)))
    for (const l of found) leads.set(l.id, l)
  }
  const agents = await agentNames(
    db,
    orgId,
    rows.map((r) => r.assignedAgentId),
  )
  return { contacts, leads, agents }
}

/** Un hilo web con la misma forma que una conversación de WhatsApp en la lista de la bandeja (más `source`, `kind` y `formType`). */
export function serializeWebThread(row: WebThreadRow, people: PeopleMaps) {
  const contact = row.contactId ? people.contacts.get(row.contactId) : null
  const lead = row.leadId ? people.leads.get(row.leadId) : null
  const name = contact?.name || lead?.name || row.visitorName || (row.kind === 'chat' ? 'Visitante del chat' : 'Visitante web')
  const sessionOpen = row.kind === 'chat' && Boolean(row.sessionExpiresAt && row.sessionExpiresAt > now())
  return {
    id: webThreadKey(row.id),
    webId: row.id,
    source: row.kind === 'chat' ? ('web_chat' as const) : ('web_form' as const),
    kind: row.kind as WebThreadKind,
    formType: row.formType,
    formTypeLabel: row.formType ? (WEB_FORM_TYPE_LABELS as Record<string, string>)[row.formType] || row.formType : null,
    status: row.status,
    channel: { id: null, label: WEB_CHANNEL_LABELS[row.kind as WebThreadKind] || 'Web', provider: row.kind === 'chat' ? 'web_chat' : 'web_form', phone: null },
    contact: {
      id: null,
      name,
      known: Boolean(contact || lead),
      phone: row.visitorPhone,
      phoneDisplay: row.visitorPhone || row.visitorEmail || '',
      email: row.visitorEmail,
      displayName: row.visitorName,
      client: null,
      lead: lead ? { id: lead.id, name: lead.name, status: lead.status, email: lead.email } : null,
      crmContact: contact ? { id: contact.id, name: contact.name } : null,
      consentStatus: 'unknown',
    },
    crmContactId: row.contactId,
    leadId: row.leadId,
    assignedAgentId: row.assignedAgentId,
    assignedAgentName: row.assignedAgentId ? (people.agents.get(row.assignedAgentId) ?? null) : null,
    propertyId: row.propertyId,
    propertyKind: row.propertyId ? (row.propertyKind === 'agent' ? 'agent' : 'developer') : null,
    lastMessageAt: row.lastMessageAt,
    lastMessagePreview: row.lastMessagePreview,
    lastInboundAt: row.lastInboundAt,
    unreadCount: row.unreadCount,
    /** Sólo chat: si el visitante todavía puede ver respuestas en el widget. */
    chatSessionOpen: sessionOpen,
    chatSessionExpiresAt: row.kind === 'chat' ? row.sessionExpiresAt : null,
    /** Los hilos web no tienen ventana de 24 h (eso es de WhatsApp). */
    window: null,
    pageUrl: row.pageUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function serializeWebThreads(db: any, orgId: number, rows: WebThreadRow[]) {
  const people = await peopleFor(db, orgId, rows)
  return rows.map((r) => serializeWebThread(r, people))
}

export function serializeWebMessage(row: WebMessageRow, emailStatus?: { status: string; errorMessage: string | null } | null) {
  let fields: Record<string, string> | null
  try {
    fields = row.fieldsJson ? JSON.parse(row.fieldsJson) : null
  } catch {
    fields = null
  }
  // Una respuesta por email lleva el estado real de su fila de email_log (entregado/rebotado lo escribe el webhook de Resend).
  const status = emailStatus?.status || row.status
  return {
    id: row.id,
    threadId: row.threadId,
    direction: row.direction,
    via: row.via,
    type: row.direction === 'note' ? 'note' : row.propertyId && row.direction === 'out' ? 'property_share' : 'text',
    body: row.body,
    preview: preview(row.body),
    fields,
    media: null,
    location: null,
    propertyId: row.propertyId,
    propertyKind: row.propertyId ? (row.propertyKind === 'agent' ? 'agent' : 'developer') : null,
    status,
    errorMessage: row.errorMessage || emailStatus?.errorMessage || null,
    sentByUserId: row.sentByUserId,
    createdAt: row.createdAt,
  }
}

export async function webThreadMessages(db: any, thread: WebThreadRow, limit = 200) {
  const rows: WebMessageRow[] = await db
    .select()
    .from(schema.commsWebMessages)
    .where(and(eq(schema.commsWebMessages.threadId, thread.id), eq(schema.commsWebMessages.organizationId, thread.organizationId)))
    .orderBy(schema.commsWebMessages.id)
    .limit(limit)
  const logIds = rows.map((r) => r.emailLogId).filter((v): v is number => typeof v === 'number')
  const logs = new Map<number, { status: string; errorMessage: string | null }>()
  if (logIds.length) {
    const found = await db
      .select({ id: schema.emailLog.id, status: schema.emailLog.status, errorMessage: schema.emailLog.errorMessage })
      .from(schema.emailLog)
      .where(and(eq(schema.emailLog.organizationId, thread.organizationId), inJsonList(schema.emailLog.id, logIds)))
    for (const l of found) logs.set(l.id, { status: l.status, errorMessage: l.errorMessage })
  }
  return rows.map((r) => serializeWebMessage(r, r.emailLogId ? logs.get(r.emailLogId) : null))
}

export interface WebThreadListFilter {
  status?: string
  assigned?: string
  unreadOnly?: boolean
  kind?: WebThreadKind | null
  q?: string
  before?: string | null
  since?: string | null
  propertyId?: number | null
  propertyKind?: PropertyKind | null
  contactIds?: number[]
  leadIds?: number[]
}

function listConds(orgId: number, f: WebThreadListFilter, db: any): SQL[] {
  const T = schema.commsWebThreads
  const conds: SQL[] = [eq(T.organizationId, orgId), isNotNull(T.lastMessageAt)]
  if (f.status && f.status !== 'all') conds.push(eq(T.status, f.status))
  if (f.assigned === 'unassigned') conds.push(isNull(T.assignedAgentId))
  else if (f.assigned && /^\d+$/.test(f.assigned)) conds.push(eq(T.assignedAgentId, Number(f.assigned)))
  if (f.unreadOnly) conds.push(gt(T.unreadCount, 0))
  if (f.kind) conds.push(eq(T.kind, f.kind))
  if (f.before) conds.push(lt(T.lastMessageAt, f.before))
  if (f.since) conds.push(gt(T.updatedAt, f.since))
  if (f.propertyId) {
    const M = schema.commsWebMessages
    const kindIs = (col: any) => (f.propertyKind === 'agent' ? eq(col, 'agent') : or(eq(col, 'developer'), isNull(col))!)
    const sharedIn = db
      .select({ id: M.threadId })
      .from(M)
      .where(and(eq(M.organizationId, orgId), eq(M.propertyId, f.propertyId), kindIs(M.propertyKind)))
    conds.push(or(and(eq(T.propertyId, f.propertyId), kindIs(T.propertyKind)), inArray(T.id, sharedIn))!)
  }
  if (f.q) {
    const pattern = `%${f.q.replace(/[%_]/g, '')}%`
    conds.push(or(like(T.visitorName, pattern), like(T.visitorEmail, pattern), like(T.visitorPhone, pattern), like(T.lastMessagePreview, pattern))!)
  }
  const people: SQL[] = []
  if (f.contactIds?.length) people.push(inJsonList(T.contactId, f.contactIds))
  if (f.leadIds?.length) people.push(inJsonList(T.leadId, f.leadIds))
  if (f.contactIds || f.leadIds) conds.push(people.length ? or(...people)! : sql`0`)
  return conds
}

export async function listWebThreads(db: any, orgId: number, f: WebThreadListFilter, limit = 50): Promise<WebThreadRow[]> {
  const T = schema.commsWebThreads
  return db
    .select()
    .from(T)
    .where(and(...listConds(orgId, f, db)))
    .orderBy(f.since ? desc(T.updatedAt) : desc(T.lastMessageAt))
    .limit(limit)
}

export async function webThreadCounts(db: any, orgId: number): Promise<Record<string, number>> {
  const T = schema.commsWebThreads
  const rows = await db
    .select({ status: T.status, n: sql<number>`count(*)` })
    .from(T)
    .where(and(eq(T.organizationId, orgId), isNotNull(T.lastMessageAt)))
    .groupBy(T.status)
  const out: Record<string, number> = {}
  for (const r of rows) out[r.status] = Number(r.n ?? 0)
  return out
}

// --- panel: acciones -------------------------------------------------------------------

export async function markWebThreadRead(db: any, thread: WebThreadRow): Promise<void> {
  if (thread.unreadCount > 0) await db.update(schema.commsWebThreads).set({ unreadCount: 0, updatedAt: now() }).where(eq(schema.commsWebThreads.id, thread.id))
}

export async function addWebThreadNote(db: any, thread: WebThreadRow, userId: number, rawBody: unknown) {
  const body = String(rawBody ?? '').trim()
  if (!body) invalid('La nota está vacía.')
  const [row] = await db
    .insert(schema.commsWebMessages)
    .values({ organizationId: thread.organizationId, threadId: thread.id, direction: 'note', via: 'note', body: body.slice(0, 4000), status: 'sent', sentByUserId: userId, createdAt: now() })
    .returning()
  return serializeWebMessage(row)
}

/** Estado, comercial asignado y propiedad de contexto — cada referencia validada en la organización (ajena = 404). */
export async function patchWebThread(db: any, thread: WebThreadRow, body: Record<string, any>): Promise<string[]> {
  const patch: Record<string, any> = {}
  if ('status' in body) {
    if (!['open', 'pending', 'closed'].includes(String(body.status))) invalid('Estado no válido')
    patch.status = String(body.status)
  }
  if ('assignedAgentId' in body) {
    if (body.assignedAgentId == null || body.assignedAgentId === '') patch.assignedAgentId = null
    else {
      const [agent] = await db
        .select({ id: schema.teamMembers.id })
        .from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.id, Number(body.assignedAgentId)), eq(schema.teamMembers.organizationId, thread.organizationId)))
        .limit(1)
      if (!agent) invalid('Comercial no encontrado', 404)
      patch.assignedAgentId = agent.id
    }
  }
  if ('propertyId' in body) {
    if (body.propertyId == null || body.propertyId === '') {
      patch.propertyId = null
      patch.propertyKind = null
    } else {
      const kind: PropertyKind = body.propertyKind === 'agent' ? 'agent' : 'developer'
      const propertyId = Number(body.propertyId)
      if (!Number.isInteger(propertyId) || propertyId <= 0) invalid('Propiedad no encontrada', 404)
      await assertLiveProperty(db, thread.organizationId, kind, propertyId, { action: 'vincularla a la conversación' })
      patch.propertyId = propertyId
      patch.propertyKind = kind
    }
  }
  const changed = Object.keys(patch)
  if (!changed.length) invalid('Nada que actualizar')
  await db
    .update(schema.commsWebThreads)
    .set({ ...patch, updatedAt: now() })
    .where(eq(schema.commsWebThreads.id, thread.id))
  return changed
}

export interface WebReplyOptions {
  /** `repliesToThread`: con el email entrante activo (FASE 29), la respuesta del cliente vuelve a este hilo; si no, llega al «Responder a» de la agencia. */
  email: { available: boolean; to: string | null; reason: string | null; repliesToThread: boolean }
  chat: { available: boolean; reason: string | null }
  whatsapp: { available: boolean; phone: string | null; reason: string | null }
}

/**
 * Por qué canal real se puede responder a este hilo, y si no, por qué no.
 * `whatsappChannelActive` lo calcula quien llama (necesita las credenciales
 * cifradas del canal, que esto no toca); `inboundEmailActive`, también
 * (`inboundEmailStatus(env).active`, server/utils/comms/inboundAddress.ts).
 */
export function webReplyOptions(thread: WebThreadRow, ctx: { emailConnected: boolean; whatsappChannelActive: boolean; defaultCountryPrefix: string | null; inboundEmailActive?: boolean }): WebReplyOptions {
  const email = thread.visitorEmail
  const chatOpen = thread.kind === 'chat' && Boolean(thread.sessionExpiresAt && thread.sessionExpiresAt > now())
  const phone = thread.visitorPhone ? normalizePhone(thread.visitorPhone, ctx.defaultCountryPrefix) : null
  return {
    email: {
      available: Boolean(email) && ctx.emailConnected,
      to: email,
      reason: !email ? 'No dejó email.' : !ctx.emailConnected ? 'El email de la plataforma no está conectado (falta RESEND_API_KEY): no se puede enviar.' : null,
      repliesToThread: Boolean(ctx.inboundEmailActive),
    },
    chat: {
      available: chatOpen,
      reason: thread.kind !== 'chat' ? 'Escribió por un formulario, no por el chat.' : chatOpen ? null : `La sesión del chat caducó (${CHAT_SESSION_DAYS} días sin escribir): el visitante ya no verá respuestas en la web.`,
    },
    whatsapp: {
      available: Boolean(phone) && ctx.whatsappChannelActive,
      phone,
      reason: !thread.visitorPhone
        ? 'No dejó teléfono.'
        : !phone
          ? `El teléfono «${thread.visitorPhone}» no tiene prefijo internacional (configura el prefijo por defecto en Configuración → Comunicaciones).`
          : !ctx.whatsappChannelActive
            ? 'No hay ningún número de WhatsApp conectado en la agencia.'
            : null,
    },
  }
}

export interface WebReplyInput {
  orgId: number
  thread: WebThreadRow
  userId: number
  via: 'email' | 'chat'
  body?: string | null
  /** Compartir una ficha en esta respuesta (con enlace personal si es de obra nueva y la persona es conocida). */
  property?: { id: number; kind: PropertyKind } | null
  /** Origen público de la web de la agencia, para los enlaces. */
  origin: string
  emailConnected: boolean
  subject?: string | null
}

export interface WebReplyResult {
  ok: boolean
  message: ReturnType<typeof serializeWebMessage>
  error: string | null
}

/**
 * Responde a un hilo web por un canal real. Chat: queda en el hilo y el
 * widget lo recoge en su siguiente sondeo. Email: plantilla
 * `web_thread_reply` por el email transaccional (email_log con su estado
 * real). Una respuesta aceptada cuenta como contacto humano real del lead
 * (primer contacto / primera respuesta); una ficha compartida deja
 * `PROPERTY_SENT` en Activity.
 */
export async function replyToWebThread(db: any, env: Record<string, any>, input: WebReplyInput): Promise<WebReplyResult> {
  const { thread, via } = input
  const options = webReplyOptions(thread, { emailConnected: input.emailConnected, whatsappChannelActive: false, defaultCountryPrefix: null })
  if (via === 'chat' && !options.chat.available) invalid(options.chat.reason || 'No se puede responder por el chat.', 409)
  if (via === 'email' && !options.email.available) invalid(options.email.reason || 'No se puede responder por email.', 409)
  if (via !== 'chat' && via !== 'email') invalid('Canal de respuesta no válido (chat o email).')

  const text = stripControl(String(input.body ?? '').replace(/\r\n/g, '\n')).trim()
  if (text.length > WEB_REPLY_MAX) invalid(`La respuesta admite como máximo ${WEB_REPLY_MAX} caracteres.`)

  let share: { id: number; kind: PropertyKind; name: string; url: string | null; text: string } | null = null
  let personalLink = false
  if (input.property) {
    const built = await buildPropertyShare(db, input.orgId, input.property.id, input.property.kind, input.origin)
    share = { id: built.id, kind: built.kind, name: built.name, url: built.url, text: built.text }
    personalLink = Boolean(built.url && (thread.contactId || thread.leadId))
  }
  if (!text && !share) invalid('Escribe algo antes de enviar.')

  const ts = now()
  const M = schema.commsWebMessages
  // La fila se crea primero (el enlace personal necesita su id); el estado real se fija después del envío.
  const [row] = await db
    .insert(M)
    .values({
      organizationId: input.orgId,
      threadId: thread.id,
      direction: 'out',
      via,
      body: text || null,
      propertyId: share?.id ?? null,
      propertyKind: share?.kind ?? null,
      status: 'queued',
      sentByUserId: input.userId,
      createdAt: ts,
    })
    .returning()

  let propertyUrl: string | null = share?.url ?? null
  if (share && personalLink && share.url) {
    const link = await createPropertyShareLink(db, { orgId: input.orgId, propertyId: share.id, contactId: thread.contactId, leadId: thread.leadId, channel: via, webMessageId: row.id, createdBy: input.userId })
    propertyUrl = personalPropertyUrl(share.url, link.token)
  }
  const shareText = share ? (share.url && propertyUrl ? share.text.replace(share.url, propertyUrl) : share.text) : null
  const finalBody = [text, shareText].filter(Boolean).join('\n\n')

  let status = 'sent'
  let errorMessage: string | null = null
  let emailLogId: number | null = null
  if (via === 'email') {
    // En el email el enlace va en el botón: la ficha se escribe sin la URL suelta.
    const shareForEmail = share ? (share.url ? share.text.replace(share.url, '').trim() : share.text) : null
    // FASE 29 — email entrante: con INBOUND_EMAIL_DOMAIN/SECRET, el Reply-To es la
    // dirección firmada de ESTE hilo y la respuesta del cliente vuelve aquí. Sin
    // ellos, `null`: se queda el «Responder a» de la agencia, como siempre.
    const replyTo = await threadReplyAddress(env, input.orgId, thread.id)
    const [result] = await sendTransactionalEmail(db, env, {
      organizationId: input.orgId,
      template: 'web_thread_reply',
      to: thread.visitorEmail!,
      data: { subject: input.subject || null, body: [text, shareForEmail].filter(Boolean).join('\n\n'), propertyUrl, propertyName: share?.name ?? null },
      replyTo,
    })
    emailLogId = result?.logId ?? null
    status = result?.status ?? 'failed'
    errorMessage = result && !result.ok ? result.message : null
  }
  await db.update(M).set({ body: finalBody, status, errorMessage, emailLogId }).where(eq(M.id, row.id))

  const accepted = status === 'sent'
  await db
    .update(schema.commsWebThreads)
    .set({ lastMessageAt: ts, lastMessagePreview: preview(finalBody), status: thread.status === 'closed' ? 'open' : thread.status, updatedAt: ts })
    .where(eq(schema.commsWebThreads.id, thread.id))

  if (accepted) {
    if (thread.leadId || thread.contactId) await markLeadContacted(db, input.orgId, { leadId: thread.leadId, contactId: thread.contactId }, { human: true, at: ts })
    if (share) {
      await recordActivity(db, input.orgId, {
        eventType: 'PROPERTY_SENT',
        entityType: 'comms_web_message',
        entityId: row.id,
        contactId: thread.contactId,
        leadId: thread.leadId,
        propertyId: share.id,
        propertyKind: share.kind,
        actorType: 'user',
        actorId: input.userId,
        metadata: { channel: via, personalLink },
      })
    }
  }

  const [saved] = await db.select().from(M).where(eq(M.id, row.id)).limit(1)
  return { ok: accepted, message: serializeWebMessage(saved), error: accepted ? null : errorMessage || 'No se pudo enviar.' }
}
