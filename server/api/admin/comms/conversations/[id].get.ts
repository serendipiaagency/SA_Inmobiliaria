import { and, asc, desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { cfEnv, schema, useDb } from '../../../../utils/db'
import { agentNames, contextPropertyFor, crmContactRef, crmNamesFor, loadConversationForOrg, orgCapabilities, personContextFor, serializeCall, serializeConversation, serializeMessage } from '../../../../utils/comms/admin'
import { channelView } from '../../../../utils/comms/credentials'
import { getCommsSettings, syncConversationCrmContact } from '../../../../utils/comms/inbox'
import { NO_CAPABILITIES, PROVIDERS } from '../../../../utils/comms/providers/registry'
import { loadWebThreadForOrg, parseWebThreadKey, serializeWebThreads, webReplyOptions, webThreadMessages } from '../../../../utils/comms/web'
import { inboundEmailStatus } from '../../../../utils/comms/inboundAddress'

/**
 * GET /api/admin/comms/conversations/:id — el hilo completo: conversación, contacto, canal (sin secretos), mensajes, llamadas, plantillas y comerciales.
 *
 * Núcleo N8a: con `:id = w<n>` es un hilo web (formulario o chat): mismos
 * bloques de contexto (lead, necesidades, citas, propiedad) más `reply`, por
 * qué canal real se le puede responder y, si no, por qué no (y, FASE 29, si
 * la respuesta del cliente a un email volverá a este hilo). En los hilos de
 * WhatsApp, el Contact se GUARDA en el hilo (`crm_contact_id`) la primera
 * vez que se conoce, en vez de deducirse en cada lectura.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const team = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.organizationId, orgId))
    .orderBy(asc(schema.teamMembers.name))

  const webId = parseWebThreadKey(getRouterParam(event, 'id'))
  if (webId) {
    const env = cfEnv(event) as Record<string, any>
    const thread = await loadWebThreadForOrg(db, orgId, webId)
    const [serialized] = await serializeWebThreads(db, orgId, [thread])
    const [settings, caps] = await Promise.all([getCommsSettings(db, orgId), orgCapabilities(db, env, orgId).catch(() => null)])
    const context = await personContextFor(db, orgId, { contactId: thread.contactId, leadId: thread.leadId })
    return {
      kind: 'web',
      conversation: serialized,
      channel: { id: null, label: serialized.channel.label, provider: serialized.channel.provider, phone: null, callingStatus: 'unavailable', status: 'active' },
      capabilities: NO_CAPABILITIES,
      encryptionAvailable: Boolean(env.COMMS_CREDENTIALS_ENCRYPTION_KEY),
      messages: await webThreadMessages(db, thread),
      calls: [],
      templates: [],
      team,
      property: await contextPropertyFor(db, orgId, thread.propertyId, thread.propertyKind),
      crmContact: await crmContactRef(db, orgId, thread.contactId),
      reply: webReplyOptions(thread, { emailConnected: Boolean(env.RESEND_API_KEY), whatsappChannelActive: Boolean(caps?.defaultChannel), defaultCountryPrefix: settings.defaultCountryPrefix, inboundEmailActive: inboundEmailStatus(env).active }),
      ...context,
    }
  }

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

  const property = await contextPropertyFor(db, orgId, conversation.propertyId, conversation.propertyKind)

  // --- Contexto (FASE 29 §123): BuyerRequirement, próxima acción y citas del
  // lead/contacto detrás de esta conversación. El Contact se guarda en el
  // hilo la primera vez que se conoce (núcleo N8a); el lead sigue saliendo
  // del vínculo guardado del contacto de WhatsApp.
  const synced = await syncConversationCrmContact(db, orgId, contact.id)
  const crmContactId = synced.contactId ?? conversation.crmContactId ?? null
  const context = await personContextFor(db, orgId, { contactId: crmContactId, leadId: synced.leadId })

  const channel = channelView(channelRow, null)
  const providerCaps = PROVIDERS[channel.provider].capabilities
  return {
    kind: 'whatsapp',
    conversation: { ...serializeConversation({ ...conversation, crmContactId }, contact, crm, channelRow, conversation.assignedAgentId ? (agents.get(conversation.assignedAgentId) ?? null) : null), source: 'whatsapp' },
    channel: { id: channel.id, label: channel.label, provider: channel.provider, phone: channel.phoneE164, callingStatus: channel.callingStatus, status: channel.status },
    capabilities: { ...providerCaps, calling: providerCaps.calling && channel.callingStatus === 'enabled' },
    encryptionAvailable: Boolean((cfEnv(event) as Record<string, any>).COMMS_CREDENTIALS_ENCRYPTION_KEY),
    messages: messages.map(serializeMessage),
    calls: calls.map((c: any) => serializeCall(c)),
    templates: templates.map((t: any) => ({ id: t.id, name: t.name, language: t.language, category: t.category, body: t.body, status: t.status, contentSid: channel.provider === 'twilio' ? t.externalId : null })),
    team,
    property,
    crmContact: await crmContactRef(db, orgId, crmContactId),
    ...context,
  }
})
