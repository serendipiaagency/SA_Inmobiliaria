import { and, desc, eq, inArray, isNotNull, isNull, like, lt, or } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { schema, useDb } from '../../../../utils/db'
import { agentNames, crmNamesFor, serializeConversation } from '../../../../utils/comms/admin'

/**
 * GET /api/admin/comms/conversations?status=open|pending|closed|all&assigned=<agentId>|unassigned|all&q=&before=<lastMessageAt>
 * La lista de la bandeja, más reciente primero. `q` busca por teléfono,
 * nombre de perfil y último mensaje; los nombres del CRM salen aparte.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const q = getQuery(event)
  const status = String(q.status || 'open')
  const assigned = String(q.assigned || 'all')
  const search = String(q.q || '').trim()
  const before = typeof q.before === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(q.before) ? q.before : null

  const conds = [eq(schema.commsConversations.organizationId, orgId), isNotNull(schema.commsConversations.lastMessageAt)]
  if (status !== 'all') conds.push(eq(schema.commsConversations.status, status))
  if (assigned === 'unassigned') conds.push(isNull(schema.commsConversations.assignedAgentId))
  else if (/^\d+$/.test(assigned)) conds.push(eq(schema.commsConversations.assignedAgentId, Number(assigned)))
  if (before) conds.push(lt(schema.commsConversations.lastMessageAt, before))

  let contactFilterIds: number[] | null = null
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
    contactFilterIds = [...new Set([...matches, ...crmClients, ...crmLeads].map((r: any) => r.id as number))]
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

  const counts: Record<string, number> = { open: 0, pending: 0, closed: 0 }
  const countRows = await db
    .select({ status: schema.commsConversations.status, id: schema.commsConversations.id })
    .from(schema.commsConversations)
    .where(and(eq(schema.commsConversations.organizationId, orgId), isNotNull(schema.commsConversations.lastMessageAt)))
  for (const r of countRows) counts[r.status] = (counts[r.status] || 0) + 1

  return {
    rows: rows
      .filter((r: any) => contactById.has(r.contactId))
      .map((r: any) => serializeConversation(r, contactById.get(r.contactId)!, crm, channelById.get(r.channelId) ?? null, r.assignedAgentId ? (agents.get(r.assignedAgentId) ?? null) : null)),
    counts,
    nextBefore: rows.length === 50 ? rows[rows.length - 1].lastMessageAt : null,
  }
})
