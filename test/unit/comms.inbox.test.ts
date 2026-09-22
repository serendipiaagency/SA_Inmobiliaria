import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'
import { ingestCallEvent, logManualCall, startOutboundCall } from '../../server/utils/comms/calls'
import { ingestParsedWebhook } from '../../server/utils/comms/ingest'
import { isOptOutText, previewOf, renderTemplateBody, sendOutbound, serviceWindow, templateParamCount, upsertContact } from '../../server/utils/comms/inbox'
import { NO_CAPABILITIES, PROVIDERS } from '../../server/utils/comms/providers/registry'
import type { InboundMessageEvent, LoadedChannel, ParsedWebhook } from '../../server/utils/comms/types'

/**
 * La bandeja sobre una SQLite real con las migraciones reales: contactos,
 * conversaciones, mensajes, idempotencia, cruce con el CRM, ventana de 24 h,
 * consentimiento, llamadas — y el aislamiento entre agencias, que es lo
 * único que de verdad no puede fallar.
 */
let db: any
let a: TenantFixture
let b: TenantFixture
let channelA: LoadedChannel
let channelB: LoadedChannel

async function insertChannel(orgId: number, phoneNumberId: string): Promise<LoadedChannel> {
  const [row] = await db
    .insert(schema.commsChannels)
    .values({ organizationId: orgId, provider: 'meta_cloud', label: 'Meta', phoneE164: `+3490000${phoneNumberId.slice(-4)}`, externalPhoneId: phoneNumberId, credentialsCiphertext: 'x', credentialsIv: 'y', status: 'active', isDefault: 1, callingStatus: 'enabled', createdAt: '', updatedAt: '' })
    .returning()
  return { ...row, isDefault: true, credentials: { provider: 'meta_cloud', accessToken: 'tok', appSecret: 'sec' } } as LoadedChannel
}

function textEvent(from: string, id: string, text: string, ts = '2026-03-01T10:00:00.000Z'): InboundMessageEvent {
  return { kind: 'message', externalId: id, from, profileName: 'Perfil WA', timestamp: ts, type: 'text', text, raw: { from: from.replace('+', ''), id } }
}
function parsed(channel: LoadedChannel, events: ParsedWebhook['events']): ParsedWebhook {
  return { externalPhoneId: channel.externalPhoneId, events }
}
const env = {}

beforeEach(async () => {
  ;({ db } = createTestDb())
  a = await seedTenant(db, 'Alpha')
  b = await seedTenant(db, 'Beta')
  channelA = await insertChannel(a.orgId, '100000000001')
  channelB = await insertChannel(b.orgId, '100000000002')
})

describe('reglas puras', () => {
  it('la ventana de 24 h se calcula desde el último mensaje del cliente', () => {
    const now = Date.parse('2026-03-01T12:00:00Z')
    expect(serviceWindow('2026-03-01 10:00:00', now)).toMatchObject({ open: true, expiresAt: '2026-03-02T10:00:00.000Z' })
    expect(serviceWindow('2026-02-28 11:00:00', now).open).toBe(false)
    expect(serviceWindow(null, now)).toEqual({ open: false, expiresAt: null, remainingMs: 0 })
  })
  it('plantillas: parámetros y renderizado', () => {
    expect(templateParamCount('Hola {{1}}, te escribe {{2}} sobre {{ 1 }}')).toBe(2)
    expect(renderTemplateBody('Hola {{1}}, {{2}}', ['Ana'])).toBe('Hola Ana, {{2}}')
  })
  it('opt-out por palabra clave', () => {
    expect(isOptOutText('STOP')).toBe(true)
    expect(isOptOutText('baja, gracias')).toBe(false)
    expect(isOptOutText('Baja')).toBe(true)
    expect(isOptOutText('quiero darme de baja del piso')).toBe(false)
    expect(isOptOutText('Hola')).toBe(false)
  })
  it('vista previa de cada tipo', () => {
    expect(previewOf({ type: 'text', body: 'x'.repeat(200) }).length).toBe(120)
    expect(previewOf({ type: 'document', mediaFilename: 'a.pdf' })).toBe('📎 a.pdf')
    expect(previewOf({ type: 'image' })).toBe('📷 Imagen')
    expect(previewOf({ type: 'template', templateName: 'seguimiento' })).toBe('Plantilla seguimiento')
  })
  it('la matriz de capacidades dice la verdad sobre las llamadas', () => {
    expect(PROVIDERS.meta_cloud.capabilities.calling).toBe(true)
    expect(PROVIDERS.twilio.capabilities.calling).toBe(false)
    expect(PROVIDERS.twilio.capabilities.templateSync).toBe(false)
    expect(Object.values(NO_CAPABILITIES).every((v) => v === false)).toBe(true)
    for (const p of Object.values(PROVIDERS)) expect(p.requirements.length).toBeGreaterThan(2)
  })
})

describe('mensajes entrantes', () => {
  it('crea contacto, conversación y mensaje, suma un no leído y abre el consentimiento', async () => {
    const summary = await ingestParsedWebhook(db, env, channelA, parsed(channelA, [textEvent('+34600112233', 'wamid.1', 'Hola')]))
    expect(summary).toMatchObject({ processed: 1, duplicates: 0, failed: 0 })
    const [contact] = await db.select().from(schema.commsContacts).where(eq(schema.commsContacts.organizationId, a.orgId))
    expect(contact).toMatchObject({ phoneE164: '+34600112233', displayName: 'Perfil WA', clientId: null, leadId: null, consentStatus: 'opted_in', consentSource: 'inbound_message', lastInboundAt: '2026-03-01 10:00:00' })
    const [conv] = await db.select().from(schema.commsConversations).where(eq(schema.commsConversations.contactId, contact.id))
    expect(conv).toMatchObject({ channelId: channelA.id, status: 'open', unreadCount: 1, lastMessagePreview: 'Hola', lastInboundAt: '2026-03-01 10:00:00' })
    const messages = await db.select().from(schema.commsMessages).where(eq(schema.commsMessages.conversationId, conv.id))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ direction: 'in', type: 'text', body: 'Hola', externalId: 'wamid.1', status: 'received' })
  })

  it('el mismo wamid reenviado no duplica nada', async () => {
    const ev = textEvent('+34600112233', 'wamid.dup', 'Hola')
    await ingestParsedWebhook(db, env, channelA, parsed(channelA, [ev]))
    const again = await ingestParsedWebhook(db, env, channelA, parsed(channelA, [ev]))
    expect(again).toMatchObject({ processed: 0, duplicates: 1 })
    const messages = await db.select().from(schema.commsMessages).where(eq(schema.commsMessages.organizationId, a.orgId))
    expect(messages).toHaveLength(1)
    const [conv] = await db.select().from(schema.commsConversations).where(eq(schema.commsConversations.organizationId, a.orgId))
    expect(conv.unreadCount).toBe(1)
  })

  it('cruza el teléfono con un cliente del CRM aunque esté escrito de otra forma', async () => {
    const [client] = await db
      .insert(schema.clients)
      .values({ organizationId: a.orgId, name: 'Ana Cliente', phone: '600 11 22 33', type: 'buyer', stage: 'active', createdAt: '', updatedAt: '' })
      .returning({ id: schema.clients.id })
    await ingestParsedWebhook(db, env, channelA, parsed(channelA, [textEvent('+34600112233', 'wamid.crm', 'Hola')]))
    const [contact] = await db.select().from(schema.commsContacts).where(eq(schema.commsContacts.organizationId, a.orgId))
    expect(contact.clientId).toBe(client.id)
  })

  it('el mismo teléfono en otra agencia es OTRO contacto, y no ve el cliente de la primera', async () => {
    await db.insert(schema.clients).values({ organizationId: a.orgId, name: 'Ana de Alpha', phone: '+34600112233', type: 'buyer', stage: 'active', createdAt: '', updatedAt: '' })
    await ingestParsedWebhook(db, env, channelA, parsed(channelA, [textEvent('+34600112233', 'wamid.a', 'Hola Alpha')]))
    await ingestParsedWebhook(db, env, channelB, parsed(channelB, [textEvent('+34600112233', 'wamid.b', 'Hola Beta')]))
    const contacts = await db.select().from(schema.commsContacts)
    expect(contacts).toHaveLength(2)
    const beta = contacts.find((c: any) => c.organizationId === b.orgId)
    expect(beta.clientId).toBeNull()
    const convsB = await db.select().from(schema.commsConversations).where(eq(schema.commsConversations.organizationId, b.orgId))
    expect(convsB).toHaveLength(1)
    expect(convsB[0].lastMessagePreview).toBe('Hola Beta')
  })

  it('con la política "lead", un desconocido crea un lead con origen whatsapp', async () => {
    await db.insert(schema.commsSettings).values({ organizationId: a.orgId, unknownContactPolicy: 'lead', notifyInternal: 0, createdAt: '', updatedAt: '' })
    await ingestParsedWebhook(db, env, channelA, parsed(channelA, [textEvent('+34611223344', 'wamid.lead', 'Hola')]))
    const [contact] = await db.select().from(schema.commsContacts).where(eq(schema.commsContacts.organizationId, a.orgId))
    expect(contact.leadId).not.toBeNull()
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, contact.leadId))
    expect(lead).toMatchObject({ organizationId: a.orgId, source: 'whatsapp', phone: '+34611223344', name: 'Perfil WA' })
  })

  it('"BAJA" marca el opt-out y luego nada sale, ni plantillas', async () => {
    await ingestParsedWebhook(db, env, channelA, parsed(channelA, [textEvent('+34600112233', 'wamid.h', 'Hola'), textEvent('+34600112233', 'wamid.s', 'BAJA', '2026-03-01T10:01:00.000Z')]))
    const [contact] = await db.select().from(schema.commsContacts).where(eq(schema.commsContacts.organizationId, a.orgId))
    expect(contact).toMatchObject({ consentStatus: 'opted_out', consentSource: 'keyword' })
    const [conversation] = await db.select().from(schema.commsConversations).where(eq(schema.commsConversations.contactId, contact.id))
    const r = await sendOutbound(db, { channel: channelA, env, conversation, contact, message: { kind: 'template', name: 't', language: 'es', params: [] }, userId: a.userId, fetchImpl: (async () => new Response('{}')) as typeof fetch })
    expect(r).toMatchObject({ ok: false, code: 'opted_out' })
  })

  it('los estados de entrega avanzan y nunca retroceden', async () => {
    const contact = await upsertContact(db, a.orgId, '+34600112233')
    const [conv] = await db.insert(schema.commsConversations).values({ organizationId: a.orgId, channelId: channelA.id, contactId: contact.id, createdAt: '', updatedAt: '' }).returning()
    await db.insert(schema.commsMessages).values({ organizationId: a.orgId, conversationId: conv.id, direction: 'out', type: 'text', body: 'x', externalId: 'wamid.out', status: 'sent', createdAt: '', updatedAt: '' })
    const read = { kind: 'status' as const, externalId: 'wamid.out', status: 'read' as const, timestamp: '2026-03-01T10:05:00.000Z', raw: {} }
    const delivered = { ...read, status: 'delivered' as const }
    await ingestParsedWebhook(db, env, channelA, parsed(channelA, [read]))
    const after = await ingestParsedWebhook(db, env, channelA, parsed(channelA, [delivered]))
    expect(after.ignored).toBe(1)
    const [m] = await db.select().from(schema.commsMessages).where(eq(schema.commsMessages.externalId, 'wamid.out'))
    expect(m.status).toBe('read')
    await ingestParsedWebhook(db, env, channelA, parsed(channelA, [{ ...read, status: 'failed', errorCode: '131047', errorMessage: 'fuera de ventana' }]))
    const [failed] = await db.select().from(schema.commsMessages).where(eq(schema.commsMessages.externalId, 'wamid.out'))
    expect(failed).toMatchObject({ status: 'failed', errorCode: '131047' })
  })

  it('la respuesta al permiso de llamada queda en el contacto y en el hilo', async () => {
    await ingestParsedWebhook(db, env, channelA, parsed(channelA, [{ kind: 'call_permission', externalId: 'wamid.perm', from: '+34600112233', response: 'accept', isPermanent: false, expiresAt: '2026-03-08T10:00:00.000Z', timestamp: '2026-03-01T10:00:00.000Z', raw: {} }]))
    const [contact] = await db.select().from(schema.commsContacts).where(eq(schema.commsContacts.organizationId, a.orgId))
    expect(contact).toMatchObject({ callPermissionStatus: 'temporary', callPermissionExpiresAt: '2026-03-08 10:00:00' })
    const messages = await db.select().from(schema.commsMessages).where(eq(schema.commsMessages.organizationId, a.orgId))
    expect(messages[0].body).toContain('permiso')
  })

  it('un evento que revienta queda anotado como no procesado sin tirar el resto', async () => {
    const bad = { ...textEvent('+34600112233', 'wamid.bad', 'x'), from: 'no-es-un-telefono' } as InboundMessageEvent
    const summary = await ingestParsedWebhook(db, env, channelA, parsed(channelA, [bad, textEvent('+34600112233', 'wamid.good', 'ok')]))
    expect(summary.processed).toBe(1)
    expect(summary.failed).toBe(1)
    const events = await db.select().from(schema.commsWebhookEvents)
    expect(events.find((e: any) => e.eventKey === 'msg:wamid.bad').processedOk).toBe(0)
    expect(events.find((e: any) => e.eventKey === 'msg:wamid.good').processedOk).toBe(1)
  })
})

describe('mensajes salientes', () => {
  async function conversationWith(lastInboundAt: string | null) {
    const contact = await upsertContact(db, a.orgId, '+34600112233')
    const [conversation] = await db
      .insert(schema.commsConversations)
      .values({ organizationId: a.orgId, channelId: channelA.id, contactId: contact.id, lastInboundAt, createdAt: '', updatedAt: '' })
      .returning()
    return { contact, conversation }
  }
  const okFetch = (async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.sent' }] }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch

  it('texto libre fuera de la ventana se rechaza ANTES de llamar al proveedor', async () => {
    const { contact, conversation } = await conversationWith('2026-01-01 00:00:00')
    let called = false
    const r = await sendOutbound(db, { channel: channelA, env, conversation, contact, message: { kind: 'text', body: 'Hola' }, userId: a.userId, fetchImpl: (async () => ((called = true), new Response('{}'))) as typeof fetch })
    expect(r).toMatchObject({ ok: false, code: 'window_closed' })
    expect(called).toBe(false)
    expect(await db.select().from(schema.commsMessages)).toHaveLength(0)
  })

  it('una plantilla sí sale fuera de la ventana y queda en el hilo con su texto renderizado', async () => {
    const { contact, conversation } = await conversationWith(null)
    const r = await sendOutbound(db, { channel: channelA, env, conversation, contact, message: { kind: 'template', name: 'seguimiento', language: 'es', params: ['Ana'] }, displayBody: 'Hola Ana', userId: a.userId, fetchImpl: okFetch })
    expect(r.ok).toBe(true)
    expect(r.message).toMatchObject({ direction: 'out', type: 'template', body: 'Hola Ana', templateName: 'seguimiento', externalId: 'wamid.sent', status: 'sent', sentByUserId: a.userId })
    const [conv] = await db.select().from(schema.commsConversations).where(eq(schema.commsConversations.id, conversation.id))
    expect(conv.lastMessagePreview).toBe('Hola Ana')
  })

  it('un rechazo del proveedor deja el mensaje como fallido con el motivo', async () => {
    const { contact, conversation } = await conversationWith(new Date().toISOString().replace('T', ' ').slice(0, 19))
    const failFetch = (async () => new Response(JSON.stringify({ error: { message: 'Invalid token', code: 190 } }), { status: 401 })) as typeof fetch
    const r = await sendOutbound(db, { channel: channelA, env, conversation, contact, message: { kind: 'text', body: 'Hola' }, userId: a.userId, fetchImpl: failFetch })
    expect(r).toMatchObject({ ok: false, code: 'provider' })
    expect(r.message).toMatchObject({ status: 'failed', errorCode: '190' })
  })

  it('un contacto de otra agencia no se puede usar con este canal (el servicio no mezcla organizaciones)', async () => {
    const contactB = await upsertContact(db, b.orgId, '+34600112233')
    expect(contactB.organizationId).toBe(b.orgId)
    const contactsA = await db.select().from(schema.commsContacts).where(and(eq(schema.commsContacts.organizationId, a.orgId), eq(schema.commsContacts.phoneE164, '+34600112233')))
    expect(contactsA).toHaveLength(0)
  })
})

describe('llamadas', () => {
  it('una entrante suena, se registra con su oferta SDP y al terminar sin contestar queda perdida', async () => {
    await ingestCallEvent(db, channelA, { kind: 'call', externalId: 'wacid.in', event: 'connect', direction: 'inbound', from: '+34600112233', session: { sdpType: 'offer', sdp: 'v=0' }, timestamp: '2026-03-01T10:00:00.000Z', raw: {} })
    const [call] = await db.select().from(schema.commsCalls).where(eq(schema.commsCalls.externalId, 'wacid.in'))
    expect(call).toMatchObject({ organizationId: a.orgId, direction: 'inbound', status: 'ringing' })
    expect(JSON.parse(call.sessionJson).offer.sdp).toBe('v=0')
    await ingestCallEvent(db, channelA, { kind: 'call', externalId: 'wacid.in', event: 'terminate', status: 'COMPLETED', timestamp: '2026-03-01T10:01:00.000Z', raw: {} })
    const [ended] = await db.select().from(schema.commsCalls).where(eq(schema.commsCalls.externalId, 'wacid.in'))
    expect(ended).toMatchObject({ status: 'missed', sessionJson: null })
    const thread = await db.select().from(schema.commsMessages).where(eq(schema.commsMessages.conversationId, ended.conversationId))
    expect(thread.some((m: any) => m.type === 'call' && m.body === 'Llamada perdida')).toBe(true)
  })

  it('una saliente: connect a Meta, respuesta SDP por webhook, y completada con duración', async () => {
    const contact = await upsertContact(db, a.orgId, '+34600112233')
    const fetchImpl = (async () => new Response(JSON.stringify({ calls: [{ id: 'wacid.out' }] }), { status: 200 })) as typeof fetch
    const r = await startOutboundCall(db, env, { channel: channelA, contactId: contact.id, conversationId: null, userId: a.userId, sdpOffer: 'v=0\r\nm=audio', fetchImpl })
    expect(r.ok).toBe(true)
    expect(r.call).toMatchObject({ externalId: 'wacid.out', status: 'initiated', direction: 'outbound' })
    await ingestCallEvent(db, channelA, { kind: 'call', externalId: 'wacid.out', event: 'connect', session: { sdpType: 'answer', sdp: 'v=0 answer' }, timestamp: '2026-03-01T10:00:05.000Z', raw: {} })
    const [accepted] = await db.select().from(schema.commsCalls).where(eq(schema.commsCalls.externalId, 'wacid.out'))
    expect(accepted.status).toBe('accepted')
    expect(JSON.parse(accepted.sessionJson).answer.sdp).toBe('v=0 answer')
    await ingestCallEvent(db, channelA, { kind: 'call', externalId: 'wacid.out', event: 'terminate', status: 'COMPLETED', durationSeconds: 95, timestamp: '2026-03-01T10:02:00.000Z', raw: {} })
    const [done] = await db.select().from(schema.commsCalls).where(eq(schema.commsCalls.externalId, 'wacid.out'))
    expect(done).toMatchObject({ status: 'completed', durationSeconds: 95 })
  })

  it('sin permiso del usuario (138006) la llamada queda fallida y se explica', async () => {
    const contact = await upsertContact(db, a.orgId, '+34600112233')
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { message: 'no permission', code: 138006 } }), { status: 400 })) as typeof fetch
    const r = await startOutboundCall(db, env, { channel: channelA, contactId: contact.id, conversationId: null, userId: a.userId, sdpOffer: 'v=0\r\nm=audio', fetchImpl })
    expect(r).toMatchObject({ ok: false, code: 'permission_required' })
    const [call] = await db.select().from(schema.commsCalls).where(eq(schema.commsCalls.organizationId, a.orgId))
    expect(call.status).toBe('failed')
  })

  it('un canal sin llamadas activas no llama a nadie', async () => {
    const contact = await upsertContact(db, a.orgId, '+34600112233')
    const r = await startOutboundCall(db, env, { channel: { ...channelA, callingStatus: 'disabled' }, contactId: contact.id, conversationId: null, userId: a.userId, sdpOffer: 'm=audio' })
    expect(r.code).toBe('calling_unavailable')
  })

  it('una llamada anotada a mano cuenta como actividad y entra en el hilo', async () => {
    const contact = await upsertContact(db, a.orgId, '+34600112233')
    const [conversation] = await db.insert(schema.commsConversations).values({ organizationId: a.orgId, channelId: channelA.id, contactId: contact.id, createdAt: '', updatedAt: '' }).returning()
    const call = await logManualCall(db, { orgId: a.orgId, contactId: contact.id, conversationId: conversation.id, direction: 'outbound', outcome: 'no_answer', userId: a.userId })
    expect(call).toMatchObject({ provider: 'manual', status: 'cancelled', outcome: 'no_answer' })
    const [conv] = await db.select().from(schema.commsConversations).where(eq(schema.commsConversations.id, conversation.id))
    expect(conv.lastMessagePreview).toContain('No contesta')
  })
})
