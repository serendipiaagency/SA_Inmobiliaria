import { and, desc, eq, gt, inArray, isNotNull, isNull, like, lt, or } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { schema, useDb } from '../../../../utils/db'
import { agentNames, crmNamesFor, serializeConversation } from '../../../../utils/comms/admin'
import { listWebThreads, serializeWebThreads, webThreadCounts } from '../../../../utils/comms/web'

const SOURCES = ['all', 'whatsapp', 'web', 'web_form', 'web_chat'] as const
type Source = (typeof SOURCES)[number]

/**
 * GET /api/admin/comms/conversations?status=open|pending|closed|all&assigned=<agentId>|unassigned|all&channel=<channelId>&unread=1&propertyId=&propertyKind=&q=&before=<lastMessageAt>&source=all|whatsapp|web|web_form|web_chat
 * La lista de la bandeja, más reciente primero. `q` busca por teléfono,
 * nombre de perfil y último mensaje; los nombres del CRM salen aparte.
 * Con `propertyId` es también la lista de "comunicaciones relacionadas" de
 * la ficha de una propiedad (PropertyCommunications.vue, FASE 29 §141).
 *
 * Núcleo N8a: la bandeja junta los hilos de WhatsApp con los hilos web
 * (formularios y chat, server/utils/comms/web.ts). Un hilo web tiene
 * `id: "w<n>"` y `source: web_form | web_chat`; `source` filtra por canal.
 * Elegir un número de WhatsApp concreto (`channel`) deja fuera los web.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const q = getQuery(event)
  const status = String(q.status || 'open')
  const assigned = String(q.assigned || 'all')
  const search = String(q.q || '').trim()
  const before = typeof q.before === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(q.before) ? q.before : null
  const channelId = /^\d+$/.test(String(q.channel || '')) ? Number(q.channel) : null
  const unreadOnly = String(q.unread || '') === '1'
  const propertyId = /^\d+$/.test(String(q.propertyId || '')) ? Number(q.propertyId) : null
  const propertyKind = q.propertyKind === 'agent' || q.propertyKind === 'developer' ? q.propertyKind : null
  const source: Source = (SOURCES as readonly string[]).includes(String(q.source)) ? (String(q.source) as Source) : 'all'
  const wantWhatsapp = source === 'all' || source === 'whatsapp'
  const wantWeb = (source === 'all' || source.startsWith('web')) && !channelId

  let waRows: any[] = []
  if (wantWhatsapp) {
    const conds = [eq(schema.commsConversations.organizationId, orgId), isNotNull(schema.commsConversations.lastMessageAt)]
    if (status !== 'all') conds.push(eq(schema.commsConversations.status, status))
    if (assigned === 'unassigned') conds.push(isNull(schema.commsConversations.assignedAgentId))
    else if (/^\d+$/.test(assigned)) conds.push(eq(schema.commsConversations.assignedAgentId, Number(assigned)))
    if (before) conds.push(lt(schema.commsConversations.lastMessageAt, before))
    if (channelId) conds.push(eq(schema.commsConversations.channelId, channelId))
    if (unreadOnly) conds.push(gt(schema.commsConversations.unreadCount, 0))
    if (propertyId) {
      // Relacionada con la propiedad = es su contexto ahora, o se envió en ese hilo alguna vez (comms_messages.property_id).
      // NULL en property_kind de filas anteriores a la migración 0082 significa 'developer' — el único catálogo que existía entonces.
      const kindIs = (col: typeof schema.commsConversations.propertyKind | typeof schema.commsMessages.propertyKind) => (propertyKind === 'agent' ? eq(col, 'agent') : or(eq(col, 'developer'), isNull(col))!)
      const sharedIn = db
        .select({ id: schema.commsMessages.conversationId })
        .from(schema.commsMessages)
        .where(and(eq(schema.commsMessages.organizationId, orgId), eq(schema.commsMessages.propertyId, propertyId), kindIs(schema.commsMessages.propertyKind)))
      conds.push(or(and(eq(schema.commsConversations.propertyId, propertyId), kindIs(schema.commsConversations.propertyKind)), inArray(schema.commsConversations.id, sharedIn))!)
    }

    if (search) {
      const pattern = `%${search.replace(/[%_]/g, '')}%`
      const matches = await db
        .select({ id: schema.commsContacts.id })
        .from(schema.commsContacts)
        .where(and(eq(schema.commsContacts.organizationId, orgId), or(like(schema.commsContacts.phoneE164, pattern), like(schema.commsContacts.displayName, pattern))))
        .limit(200)
      const crmClients = await db
        .select({ id: schema.commsContacts.id })
        .from(schema.commsContacts)
        .innerJoin(schema.clients, eq(schema.clients.id, schema.commsContacts.clientId))
        .where(and(eq(schema.commsContacts.organizationId, orgId), like(schema.clients.name, pattern)))
        .limit(200)
      const crmLeads = await db
        .select({ id: schema.commsContacts.id })
        .from(schema.commsContacts)
        .innerJoin(schema.leads, eq(schema.leads.id, schema.commsContacts.leadId))
        .where(and(eq(schema.commsContacts.organizationId, orgId), like(schema.leads.name, pattern)))
        .limit(200)
      const contactFilterIds = [...new Set([...matches, ...crmClients, ...crmLeads].map((r: any) => r.id as number))]
      conds.push(contactFilterIds.length ? or(inArray(schema.commsConversations.contactId, contactFilterIds), like(schema.commsConversations.lastMessagePreview, pattern))! : like(schema.commsConversations.lastMessagePreview, pattern))
    }

    const rows = await db
      .select()
      .from(schema.commsConversations)
      .where(and(...conds))
      .orderBy(desc(schema.commsConversations.lastMessageAt))
      .limit(50)

    const contactIds = [...new Set(rows.map((r: any) => r.contactId as number))]
    const contacts = contactIds.length ? await db.select().from(schema.commsContacts).where(inArray(schema.commsContacts.id, contactIds)) : []
    const contactById = new Map(contacts.map((c: any) => [c.id, c]))
    const crm = await crmNamesFor(db, orgId, contacts)
    const agents = await agentNames(
      db,
      orgId,
      rows.map((r: any) => r.assignedAgentId),
    )
    const channelIds = [...new Set(rows.map((r: any) => r.channelId as number))]
    const channels = channelIds.length
      ? await db
          .select({ id: schema.commsChannels.id, label: schema.commsChannels.label, provider: schema.commsChannels.provider, phoneE164: schema.commsChannels.phoneE164 })
          .from(schema.commsChannels)
          .where(inArray(schema.commsChannels.id, channelIds))
      : []
    const channelById = new Map(channels.map((c: any) => [c.id, c]))
    waRows = rows
      .filter((r: any) => contactById.has(r.contactId))
      .map((r: any) => ({ ...serializeConversation(r, contactById.get(r.contactId)!, crm, channelById.get(r.channelId) ?? null, r.assignedAgentId ? (agents.get(r.assignedAgentId) ?? null) : null), source: 'whatsapp' as const }))
  }

  let webRows: any[] = []
  if (wantWeb) {
    const rows = await listWebThreads(db, orgId, {
      status,
      assigned,
      unreadOnly,
      kind: source === 'web_form' ? 'form' : source === 'web_chat' ? 'chat' : null,
      q: search || undefined,
      before,
      propertyId,
      propertyKind,
    })
    webRows = await serializeWebThreads(db, orgId, rows)
  }

  const counts: Record<string, number> = { open: 0, pending: 0, closed: 0 }
  if (wantWhatsapp) {
    const countRows = await db
      .select({ status: schema.commsConversations.status, id: schema.commsConversations.id })
      .from(schema.commsConversations)
      .where(and(eq(schema.commsConversations.organizationId, orgId), isNotNull(schema.commsConversations.lastMessageAt)))
    for (const r of countRows) counts[r.status] = (counts[r.status] || 0) + 1
  }
  if (wantWeb) for (const [k, n] of Object.entries(await webThreadCounts(db, orgId))) counts[k] = (counts[k] || 0) + n

  const merged = [...waRows, ...webRows].sort((x, y) => String(y.lastMessageAt || '').localeCompare(String(x.lastMessageAt || '')))
  const page = merged.slice(0, 50)
  const hasMore = waRows.length === 50 || webRows.length === 50 || merged.length > 50
  return {
    rows: page,
    counts,
    nextBefore: hasMore && page.length ? page[page.length - 1].lastMessageAt : null,
  }
})
