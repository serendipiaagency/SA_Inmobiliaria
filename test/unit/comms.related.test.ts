import { describe, expect, it } from 'vitest'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'
import { listPersonCommunications } from '../../server/utils/comms/related'

/**
 * FASE 29 §139-142 — las comunicaciones de una persona: WhatsApp/llamadas por
 * vínculo guardado, emails sólo salientes por la dirección exacta a la que se
 * enviaron. Lo que no puede fallar: nada de otra agencia, y nunca el HTML del
 * correo.
 */
const ts = '2026-03-01 10:00:00'

async function seedComms(db: any, orgId: number, link: { leadId?: number; clientId?: number }, phone: string) {
  const [channel] = await db
    .insert(schema.commsChannels)
    .values({ organizationId: orgId, provider: 'meta_cloud', label: 'Meta', phoneE164: `+3491${phone.slice(-7)}`, externalPhoneId: `ext${phone}`, credentialsCiphertext: 'x', credentialsIv: 'y', status: 'active', isDefault: 1, callingStatus: 'unknown', createdAt: ts, updatedAt: ts })
    .returning()
  const [contact] = await db
    .insert(schema.commsContacts)
    .values({ organizationId: orgId, phoneE164: phone, leadId: link.leadId ?? null, clientId: link.clientId ?? null, createdAt: ts, updatedAt: ts })
    .returning()
  const [conversation] = await db
    .insert(schema.commsConversations)
    .values({ organizationId: orgId, channelId: channel.id, contactId: contact.id, lastMessageAt: ts, lastMessagePreview: 'Hola', createdAt: ts, updatedAt: ts })
    .returning()
  const [call] = await db.insert(schema.commsCalls).values({ organizationId: orgId, contactId: contact.id, direction: 'outbound', provider: 'manual', status: 'completed', createdAt: ts }).returning()
  return { conversation, call }
}

async function seedEmail(db: any, orgId: number, recipient: string, subject: string) {
  const [row] = await db
    .insert(schema.emailLog)
    .values({ organizationId: orgId, template: 'visit_confirmation', recipient, fromHeader: 'Agencia <no-reply@example.com>', subject, html: '<p>cuerpo privado</p>', status: 'delivered', sentAt: ts, createdAt: ts })
    .returning()
  return row
}

describe('listPersonCommunications — FASE 29 §139-142', () => {
  it('WhatsApp y llamadas por lead o por cliente vinculados; nada sin vínculo', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'RelatedA')
    const viaLead = await seedComms(db, a.orgId, { leadId: a.leadId }, '+34600000001')
    await seedComms(db, a.orgId, {}, '+34600000002') // contacto de WhatsApp sin vincular

    const r = await listPersonCommunications(db, a.orgId, { leadIds: [a.leadId] })
    expect(r.conversations.map((c) => c.id)).toEqual([viaLead.conversation.id])
    expect(r.calls.map((c) => c.id)).toEqual([viaLead.call.id])

    expect(await listPersonCommunications(db, a.orgId, {})).toEqual({ conversations: [], calls: [], emails: [] })
  })

  it('emails: sólo salientes, por dirección exacta sin distinguir mayúsculas ni espacios, y nunca el HTML', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'RelatedEmailA')
    const sent = await seedEmail(db, a.orgId, 'Ana@Example.com', 'Confirmación de visita')
    await seedEmail(db, a.orgId, 'otra@example.com', 'No es suyo')

    const r = await listPersonCommunications(db, a.orgId, { emails: ['  ana@example.com ', null, undefined, ''] })
    expect(r.emails).toHaveLength(1)
    expect(r.emails[0]).toMatchObject({ id: sent.id, subject: 'Confirmación de visita', status: 'delivered', template: 'visit_confirmation' })
    expect(r.emails[0]).not.toHaveProperty('html')
    expect(JSON.stringify(r)).not.toContain('cuerpo privado')
  })

  it('nunca devuelve nada de otra agencia, aunque coincidan ids o direcciones', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'RelatedIsoA')
    const b = await seedTenant(db, 'RelatedIsoB')
    await seedComms(db, b.orgId, { leadId: b.leadId }, '+34600000003')
    await seedEmail(db, b.orgId, 'compartido@example.com', 'De la agencia B')

    const r = await listPersonCommunications(db, a.orgId, { leadIds: [b.leadId], emails: ['compartido@example.com'] })
    expect(r).toEqual({ conversations: [], calls: [], emails: [] })
  })
})
