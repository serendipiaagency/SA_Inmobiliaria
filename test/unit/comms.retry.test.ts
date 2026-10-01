import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'
import { retryOutboundMessage } from '../../server/utils/comms/admin'
import { sendOutbound, upsertContact } from '../../server/utils/comms/inbox'
import type { LoadedChannel } from '../../server/utils/comms/types'

/**
 * FASE 29 §136 — reintentar un saliente fallido. Lo que no puede fallar:
 * el fallido nunca se reescribe (el historial no miente), sólo se reintenta
 * lo que de verdad falló en el proveedor, y una propiedad se reconstruye en
 * vivo — nunca se reenvía un precio viejo.
 */
let db: any
let a: TenantFixture
let channel: LoadedChannel
const env = {}
const origin = 'https://agencia.example.com'
const recent = () => new Date().toISOString().replace('T', ' ').slice(0, 19)
const okFetch = (async () => new Response(JSON.stringify({ messages: [{ id: `wamid.${Math.random()}` }] }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch
const failFetch = (async () => new Response(JSON.stringify({ error: { message: 'Invalid token', code: 190 } }), { status: 401 })) as typeof fetch

beforeEach(async () => {
  ;({ db } = createTestDb())
  a = await seedTenant(db, 'RetryAlpha')
  const [row] = await db
    .insert(schema.commsChannels)
    .values({ organizationId: a.orgId, provider: 'meta_cloud', label: 'Meta', phoneE164: '+34900001234', externalPhoneId: '200000000001', credentialsCiphertext: 'x', credentialsIv: 'y', status: 'active', isDefault: 1, callingStatus: 'unknown', createdAt: '', updatedAt: '' })
    .returning()
  channel = { ...row, isDefault: true, credentials: { provider: 'meta_cloud', accessToken: 'tok', appSecret: 'sec' } } as LoadedChannel
})

async function openConversation() {
  const contact = await upsertContact(db, a.orgId, '+34600445566')
  const [conversation] = await db
    .insert(schema.commsConversations)
    .values({ organizationId: a.orgId, channelId: channel.id, contactId: contact.id, lastInboundAt: recent(), createdAt: '', updatedAt: '' })
    .returning()
  return { contact, conversation }
}

describe('retryOutboundMessage — FASE 29 §136', () => {
  it('un texto fallido se reenvía como mensaje nuevo; el fallido se queda tal cual', async () => {
    const { contact, conversation } = await openConversation()
    const first = await sendOutbound(db, { channel, env, conversation, contact, message: { kind: 'text', body: 'Hola Ana' }, userId: a.userId, fetchImpl: failFetch })
    expect(first.message).toMatchObject({ status: 'failed' })

    const r = await retryOutboundMessage(db, env, { channel, conversation, contact, failed: first.message!, userId: a.userId, origin, fetchImpl: okFetch })
    expect(r.ok).toBe(true)
    expect(r.message).toMatchObject({ direction: 'out', type: 'text', body: 'Hola Ana', status: 'sent' })
    expect(r.message!.id).not.toBe(first.message!.id)

    const rows = await db.select().from(schema.commsMessages).where(eq(schema.commsMessages.conversationId, conversation.id))
    expect(rows).toHaveLength(2)
    expect(rows.find((m: any) => m.id === first.message!.id)).toMatchObject({ status: 'failed', errorCode: '190' })
  })

  it('sólo se reintenta un saliente fallido: uno enviado se rechaza con 409', async () => {
    const { contact, conversation } = await openConversation()
    const sent = await sendOutbound(db, { channel, env, conversation, contact, message: { kind: 'text', body: 'Hola' }, userId: a.userId, fetchImpl: okFetch })
    await expect(retryOutboundMessage(db, env, { channel, conversation, contact, failed: sent.message!, userId: a.userId, origin, fetchImpl: okFetch })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('si el proveedor vuelve a rechazarlo, quedan dos fallidos — nunca se pisa el primero', async () => {
    const { contact, conversation } = await openConversation()
    const first = await sendOutbound(db, { channel, env, conversation, contact, message: { kind: 'text', body: 'Hola' }, userId: a.userId, fetchImpl: failFetch })
    const r = await retryOutboundMessage(db, env, { channel, conversation, contact, failed: first.message!, userId: a.userId, origin, fetchImpl: failFetch })
    expect(r).toMatchObject({ ok: false, code: 'provider' })
    const rows = await db.select().from(schema.commsMessages).where(eq(schema.commsMessages.conversationId, conversation.id))
    expect(rows.map((m: any) => m.status)).toEqual(['failed', 'failed'])
  })

  it('una propiedad fallida se reconstruye en vivo: sale el precio actual, no el del primer intento', async () => {
    const { contact, conversation } = await openConversation()
    await db.update(schema.developerProperties).set({ name: 'Torre Sol', slug: 'torre-sol', price: 500000, coverImage: null }).where(eq(schema.developerProperties.id, a.projectId))
    const first = await sendOutbound(db, {
      channel,
      env,
      conversation,
      contact,
      message: { kind: 'text', body: '🏠 Torre Sol\n500.000 €' },
      displayBody: '🏠 Torre Sol\n500.000 €',
      storeAs: 'property_share',
      propertyId: a.projectId,
      propertyKind: 'developer',
      userId: a.userId,
      fetchImpl: failFetch,
    })
    expect(first.message).toMatchObject({ status: 'failed', type: 'property_share' })

    await db.update(schema.developerProperties).set({ price: 450000 }).where(eq(schema.developerProperties.id, a.projectId))
    const r = await retryOutboundMessage(db, env, { channel, conversation, contact, failed: first.message!, userId: a.userId, origin, fetchImpl: okFetch })
    expect(r.ok).toBe(true)
    expect(r.message).toMatchObject({ type: 'property_share', propertyId: a.projectId, propertyKind: 'developer', status: 'sent' })
    expect(r.message!.body).toContain('450.000 €')
    expect(r.message!.body).not.toContain('500.000 €')
  })

  it('una plantilla que ya no existe en el canal no se reintenta a ciegas (409)', async () => {
    const { contact, conversation } = await openConversation()
    const first = await sendOutbound(db, { channel, env, conversation, contact, message: { kind: 'template', name: 'borrada', language: 'es', params: [] }, displayBody: 'Hola', userId: a.userId, fetchImpl: failFetch })
    await expect(retryOutboundMessage(db, env, { channel, conversation, contact, failed: first.message!, userId: a.userId, origin, fetchImpl: okFetch })).rejects.toMatchObject({ statusCode: 409 })
  })
})
