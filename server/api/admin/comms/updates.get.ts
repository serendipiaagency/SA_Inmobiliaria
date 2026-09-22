import { and, desc, eq, gt, inArray } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { now, schema, useDb } from '../../../utils/db'
import { agentNames, crmNamesFor, serializeCall, serializeConversation, unreadTotal } from '../../../utils/comms/admin'

/**
 * GET /api/admin/comms/updates?since=YYYY-MM-DD HH:MM:SS — el "tiempo real"
 * de la bandeja. No hay WebSockets ni SSE en este despliegue (Workers +
 * D1 sin Durable Objects), así que el panel pregunta cada pocos segundos
 * qué cambió desde `since`: conversaciones tocadas, llamadas que cambiaron
 * de estado (con la respuesta SDP de Meta cuando llega) y llamadas
 * entrantes sonando. Responde con `now` para la siguiente vuelta.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const q = getQuery(event)
  const since = typeof q.since === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(q.since) ? q.since : null
  const nowTs = now()

  const conversationRows = since
    ? await db
        .select()
        .from(schema.commsConversations)
        .where(and(eq(schema.commsConversations.organizationId, orgId), gt(schema.commsConversations.updatedAt, since)))
        .orderBy(desc(schema.commsConversations.updatedAt))
        .limit(50)
    : []
  const contactIds = [...new Set(conversationRows.map((c: any) => c.contactId as number))]
  const contacts = contactIds.length ? await db.select().from(schema.commsContacts).where(inArray(schema.commsContacts.id, contactIds)) : []
  const contactById = new Map(contacts.map((c: any) => [c.id, c]))
  const crm = await crmNamesFor(db, orgId, contacts)
  const agents = await agentNames(
    db,
    orgId,
    conversationRows.map((c: any) => c.assignedAgentId),
  )
  const channelIds = [...new Set(conversationRows.map((c: any) => c.channelId as number))]
  const channels = channelIds.length
    ? await db
        .select({ id: schema.commsChannels.id, label: schema.commsChannels.label, provider: schema.commsChannels.provider, phoneE164: schema.commsChannels.phoneE164 })
        .from(schema.commsChannels)
        .where(inArray(schema.commsChannels.id, channelIds))
    : []
  const channelById = new Map(channels.map((c: any) => [c.id, c]))

  const conversations = conversationRows
    .filter((c: any) => contactById.has(c.contactId))
    .map((c: any) => serializeConversation(c, contactById.get(c.contactId)!, crm, channelById.get(c.channelId) ?? null, c.assignedAgentId ? (agents.get(c.assignedAgentId) ?? null) : null))

  const callRows = since
    ? await db
        .select()
        .from(schema.commsCalls)
        .where(and(eq(schema.commsCalls.organizationId, orgId), gt(schema.commsCalls.updatedAt, since)))
        .orderBy(desc(schema.commsCalls.updatedAt))
        .limit(20)
    : []
  const incomingRows = await db
    .select()
    .from(schema.commsCalls)
    .where(and(eq(schema.commsCalls.organizationId, orgId), eq(schema.commsCalls.direction, 'inbound'), eq(schema.commsCalls.status, 'ringing'), eq(schema.commsCalls.provider, 'meta_cloud')))
    .orderBy(desc(schema.commsCalls.id))
    .limit(5)
  const incomingContacts = incomingRows.length ? await db.select().from(schema.commsContacts).where(inArray(schema.commsContacts.id, incomingRows.map((c: any) => c.contactId))) : []
  const incomingCrm = await crmNamesFor(db, orgId, incomingContacts)
  const incomingContactById = new Map(incomingContacts.map((c: any) => [c.id, c]))

  return {
    now: nowTs,
    unread: await unreadTotal(db, orgId),
    conversations,
    calls: callRows.map((c: any) => serializeCall(c, { includeSession: true })),
    incomingCalls: incomingRows.map((c: any) => {
      const contact = incomingContactById.get(c.contactId)
      const client = contact?.clientId ? incomingCrm.clients.get(contact.clientId) : null
      const lead = contact?.leadId ? incomingCrm.leads.get(contact.leadId) : null
      return { ...serializeCall(c, { includeSession: true }), contactName: client?.name || lead?.name || contact?.displayName || contact?.phoneE164 || 'Desconocido', contactPhone: contact?.phoneE164 ?? null }
    }),
  }
})
