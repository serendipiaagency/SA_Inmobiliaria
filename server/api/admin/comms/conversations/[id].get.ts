import { and, asc, desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { cfEnv, schema, useDb } from '../../../../utils/db'
import { agentNames, crmNamesFor, loadConversationForOrg, serializeCall, serializeConversation, serializeMessage } from '../../../../utils/comms/admin'
import { channelView } from '../../../../utils/comms/credentials'
import { PROVIDERS } from '../../../../utils/comms/providers/registry'

/** GET /api/admin/comms/conversations/:id — el hilo completo: conversación, contacto, canal (sin secretos), mensajes, llamadas, plantillas y comerciales. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const id = Number(getRouterParam(event, 'id'))
  const { conversation, contact, channelRow } = await loadConversationForOrg(db, orgId, id)
  const crm = await crmNamesFor(db, orgId, [contact])
  const agents = await agentNames(db, orgId, [conversation.assignedAgentId])

  const messages = await db
    .select()
    .from(schema.commsMessages)
    .where(eq(schema.commsMessages.conversationId, conversation.id))
    .orderBy(asc(schema.commsMessages.id))
    .limit(200)
  const calls = await db
    .select()
    .from(schema.commsCalls)
    .where(and(eq(schema.commsCalls.contactId, contact.id), eq(schema.commsCalls.organizationId, orgId)))
    .orderBy(desc(schema.commsCalls.id))
    .limit(20)
  const templates = await db
    .select()
    .from(schema.commsTemplates)
    .where(and(eq(schema.commsTemplates.channelId, channelRow.id), eq(schema.commsTemplates.organizationId, orgId)))
    .orderBy(asc(schema.commsTemplates.name))
  const team = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.organizationId, orgId))
    .orderBy(asc(schema.teamMembers.name))

  let property: { id: number; name: string; slug: string | null; coverImage: string | null } | null = null
  if (conversation.propertyId) {
    const rows = await db
      .select({ id: schema.developerProperties.id, name: schema.developerProperties.name, slug: schema.developerProperties.slug, coverImage: schema.developerProperties.coverImage })
      .from(schema.developerProperties)
      .where(and(eq(schema.developerProperties.id, conversation.propertyId), eq(schema.developerProperties.organizationId, orgId)))
      .limit(1)
    property = rows[0] ?? null
  }

  const channel = channelView(channelRow, null)
  const providerCaps = PROVIDERS[channel.provider].capabilities
  return {
    conversation: serializeConversation(conversation, contact, crm, channelRow, conversation.assignedAgentId ? (agents.get(conversation.assignedAgentId) ?? null) : null),
    channel: { id: channel.id, label: channel.label, provider: channel.provider, phone: channel.phoneE164, callingStatus: channel.callingStatus, status: channel.status },
    capabilities: { ...providerCaps, calling: providerCaps.calling && channel.callingStatus === 'enabled' },
    encryptionAvailable: Boolean((cfEnv(event) as Record<string, any>).COMMS_CREDENTIALS_ENCRYPTION_KEY),
    messages: messages.map(serializeMessage),
    calls: calls.map((c: any) => serializeCall(c)),
    templates: templates.map((t: any) => ({ id: t.id, name: t.name, language: t.language, category: t.category, body: t.body, status: t.status, contentSid: channel.provider === 'twilio' ? t.externalId : null })),
    team,
    property,
  }
})
