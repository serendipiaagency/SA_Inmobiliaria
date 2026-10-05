import { and, asc, desc, eq, gte, sql } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { cfEnv, now, schema, useDb } from '../../../../utils/db'
import { agentNames, crmNamesFor, loadConversationForOrg, serializeCall, serializeConversation, serializeMessage } from '../../../../utils/comms/admin'
import { channelView } from '../../../../utils/comms/credentials'
import { resolveActivityContact } from '../../../../utils/comms/inbox'
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

  // Historia: la propiedad de contexto se sigue enseñando aunque esté en la
  // papelera (el hilo ya hablaba de ella); `deletedAt` deja que el panel lo diga.
  let property: { id: number; name: string; slug: string | null; coverImage: string | null; kind: 'agent' | 'developer'; deletedAt: string | null } | null = null
  if (conversation.propertyId) {
    const kind = conversation.propertyKind === 'agent' ? 'agent' : 'developer'
    if (kind === 'developer') {
      const rows = await db
        .select({ id: schema.developerProperties.id, name: schema.developerProperties.name, slug: schema.developerProperties.slug, coverImage: schema.developerProperties.coverImage, deletedAt: schema.developerProperties.deletedAt })
        .from(schema.developerProperties)
        .where(and(eq(schema.developerProperties.id, conversation.propertyId), eq(schema.developerProperties.organizationId, orgId)))
        .limit(1)
      property = rows[0] ? { ...rows[0], kind } : null
    } else {
      const rows = await db
        .select({ id: schema.agentProperties.id, street: schema.agentProperties.street, city: schema.agentProperties.city, mainImage: schema.agentProperties.mainImage, deletedAt: schema.agentProperties.deletedAt })
        .from(schema.agentProperties)
        .where(and(eq(schema.agentProperties.id, conversation.propertyId), eq(schema.agentProperties.organizationId, orgId)))
        .limit(1)
      property = rows[0] ? { id: rows[0].id, name: rows[0].street || rows[0].city || `Inmueble #${rows[0].id}`, slug: null, coverImage: rows[0].mainImage, kind, deletedAt: rows[0].deletedAt } : null
    }
  }

  // --- Contexto (FASE 29 §123): BuyerRequirement, próxima acción y citas del
  // lead/contacto detrás de esta conversación — nunca se copian dentro de
  // Conversation, se resuelven en vivo cada vez que se abre el hilo.
  const { contactId: propertyContactId, leadId } = await resolveActivityContact(db, contact.id)
  const [lead, buyerRequirements, appointments] = await Promise.all([
    leadId
      ? db
          .select({ id: schema.leads.id, name: schema.leads.name, stage: schema.leads.stage, status: schema.leads.status, nextActionAt: schema.leads.nextActionAt, nextActionType: schema.leads.nextActionType })
          .from(schema.leads)
          .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))
          .limit(1)
          .then((r: any[]) => r[0] ?? null)
      : null,
    propertyContactId
      ? db
          .select({ id: schema.buyerRequirements.id, title: schema.buyerRequirements.title, status: schema.buyerRequirements.status, operation: schema.buyerRequirements.operation, priceMin: schema.buyerRequirements.priceMin, priceMax: schema.buyerRequirements.priceMax, updatedAt: schema.buyerRequirements.updatedAt })
          .from(schema.buyerRequirements)
          .where(and(eq(schema.buyerRequirements.organizationId, orgId), eq(schema.buyerRequirements.contactId, propertyContactId), eq(schema.buyerRequirements.status, 'active'), sql`${schema.buyerRequirements.deletedAt} is null`))
          .orderBy(desc(schema.buyerRequirements.updatedAt))
          .limit(5)
      : [],
    leadId
      ? db
          .select({ id: schema.visits.id, scheduledAt: schema.visits.scheduledAt, status: schema.visits.status, type: schema.visits.type, channel: schema.visits.channel, propertyName: schema.visits.propertyName })
          .from(schema.visits)
          .where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.leadId, leadId), eq(schema.visits.status, 'scheduled'), gte(schema.visits.scheduledAt, now())))
          .orderBy(asc(schema.visits.scheduledAt))
          .limit(5)
      : [],
  ])

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
    lead: lead ? { id: lead.id, name: lead.name, stage: lead.stage, status: lead.status, nextActionAt: lead.nextActionAt, nextActionType: lead.nextActionType } : null,
    buyerRequirements,
    appointments,
  }
})
