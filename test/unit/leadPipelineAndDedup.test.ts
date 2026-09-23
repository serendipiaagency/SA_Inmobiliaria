import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 12 (Lead como entidad real), FASE 13 (Pipeline de Leads) y FASE 14
 * (Deduplicación segura de Contact), migración 0069. Mismo patrón que
 * buyerRequirementLifecycleAndMatching.test.ts: base real (sqlite-proxy +
 * migraciones reales) y useDb() sustituido para leer esa base en vez de un
 * D1Database real, que sólo existe dentro del Worker.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const ts = '2026-01-01 00:00:00'

function ev(db: any) {
  return { context: { db } } as any
}

async function seedContact(db: any, orgId: number, input: Partial<typeof schema.contacts.$inferInsert> & { name: string }) {
  const [row] = await db
    .insert(schema.contacts)
    .values({ organizationId: orgId, status: 'active', createdAt: ts, updatedAt: ts, ...input })
    .returning()
  return row
}

describe('FASE 12 — Lead como entidad real, resuelta contra Contact (migración 0069)', () => {
  it('un lead nuevo con email resuelve/crea su Contact — antes de esta fase contactId se quedaba NULL', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'LeadNewContact')
    const { upsertLead } = await import('../../server/utils/leads')

    await upsertLead(ev(db), {
      organizationId: fixture.orgId,
      name: 'Ana Ruiz',
      email: 'ana.ruiz@example.com',
      source: 'web',
    })

    const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.organizationId, fixture.orgId), eq(schema.leads.email, 'ana.ruiz@example.com')))
    expect(lead.contactId).not.toBeNull()
    expect(lead.stage).toBe('new')
    expect(lead.status).toBe('new')

    const [contact] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, lead.contactId!))
    expect(contact.name).toBe('Ana Ruiz')
  })

  it('un segundo envío del mismo email actualiza el lead existente Y también fija contactId (regresión corregida)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'LeadUpdateContact')
    const { upsertLead } = await import('../../server/utils/leads')

    await upsertLead(ev(db), { organizationId: fixture.orgId, name: 'Bruno Sanz', email: 'bruno@example.com', source: 'web' })
    await upsertLead(ev(db), { organizationId: fixture.orgId, name: 'Bruno Sanz', email: 'bruno@example.com', source: 'web' })

    const leads = await db.select().from(schema.leads).where(and(eq(schema.leads.organizationId, fixture.orgId), eq(schema.leads.email, 'bruno@example.com')))
    expect(leads).toHaveLength(1)
    expect(leads[0].contactId).not.toBeNull()
    expect(leads[0].score).toBeGreaterThan(10) // el segundo envío sumó score al existente en vez de duplicar
  })

  it('conserva los UTM/first-touch y el mensaje original tal cual, sin reescribirlos', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'LeadUtm')
    const { upsertLead } = await import('../../server/utils/leads')

    await upsertLead(ev(db), {
      organizationId: fixture.orgId,
      name: 'Clara Vidal',
      email: 'clara@example.com',
      source: 'web',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'primavera',
      landingPage: '/propiedades/atico-chamberi',
      referrer: 'https://google.com',
      originalMessage: 'Hola, me interesa el ático de Chamberí',
    })

    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.email, 'clara@example.com'))
    expect(lead.utmSource).toBe('google')
    expect(lead.utmMedium).toBe('cpc')
    expect(lead.campaign).toBe('primavera') // se rellena desde utmCampaign cuando no hay campaign explícita
    expect(lead.landingPage).toBe('/propiedades/atico-chamberi')
    expect(lead.originalMessage).toBe('Hola, me interesa el ático de Chamberí')
  })

  it('aislamiento entre tenants: el mismo email en dos organizaciones nunca comparte ni sobrescribe el lead del otro', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'LeadTenantA')
    const b = await seedTenant(db, 'LeadTenantB')
    const { upsertLead } = await import('../../server/utils/leads')

    await upsertLead(ev(db), { organizationId: a.orgId, name: 'Diego A', email: 'compartido@example.com', source: 'web' })
    await upsertLead(ev(db), { organizationId: b.orgId, name: 'Diego B', email: 'compartido@example.com', source: 'web' })

    const leadsA = await db.select().from(schema.leads).where(and(eq(schema.leads.organizationId, a.orgId), eq(schema.leads.email, 'compartido@example.com')))
    const leadsB = await db.select().from(schema.leads).where(and(eq(schema.leads.organizationId, b.orgId), eq(schema.leads.email, 'compartido@example.com')))
    expect(leadsA).toHaveLength(1)
    expect(leadsB).toHaveLength(1)
    expect(leadsA[0].name).toBe('Diego A')
    expect(leadsB[0].name).toBe('Diego B')
    expect(leadsA[0].contactId).not.toBe(leadsB[0].contactId)
  })
})

describe('FASE 12 — captura de first-touch (plugins/utm-capture.client.ts + server/utils/firstTouch.ts)', () => {
  function fakeEventWithCookie(value: string | null) {
    return { node: { req: { headers: { cookie: value == null ? undefined : `sa_ft=${encodeURIComponent(value)}` } } } } as any
  }

  it('lee y traduce los campos snake_case de la cookie sa_ft al shape del lead', async () => {
    const { getCookie } = await import('h3')
    vi.stubGlobal('getCookie', getCookie)
    const { readFirstTouch } = await import('../../server/utils/firstTouch')

    const payload = JSON.stringify({ utm_source: 'facebook', utm_medium: 'social', landing_page: '/', referrer: 'https://facebook.com' })
    const result = readFirstTouch(fakeEventWithCookie(payload))
    expect(result).toEqual({ utmSource: 'facebook', utmMedium: 'social', landingPage: '/', referrer: 'https://facebook.com' })
    vi.unstubAllGlobals()
  })

  it('sin cookie o con JSON corrupto, nunca inventa datos: devuelve {} en vez de lanzar', async () => {
    const { getCookie } = await import('h3')
    vi.stubGlobal('getCookie', getCookie)
    const { readFirstTouch } = await import('../../server/utils/firstTouch')

    expect(readFirstTouch(fakeEventWithCookie(null))).toEqual({})
    expect(readFirstTouch(fakeEventWithCookie('{not json'))).toEqual({})
    vi.unstubAllGlobals()
  })
})

describe('FASE 13 — Pipeline de Leads: stage y status como dimensiones distintas (migración 0069)', () => {
  async function seedLead(db: any, orgId: number, name: string) {
    const [row] = await db
      .insert(schema.leads)
      .values({ organizationId: orgId, name, source: 'web', status: 'new', stage: 'new', score: 10, createdAt: ts, updatedAt: ts })
      .returning()
    return row
  }

  it('mover de stage actualiza status derivado y deja historial inmutable (único sitio que escribe leads.stage)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'PipelineMove')
    const lead = await seedLead(db, fixture.orgId, 'Lead Pipeline')
    const { transitionLeadStage } = await import('../../server/utils/leads/pipeline')

    const afterFirst = await transitionLeadStage(ev(db), fixture.orgId, lead.id, { toStage: 'contacted' }, { userId: fixture.userId })
    expect(afterFirst.stage).toBe('contacted')
    expect(afterFirst.status).toBe('contacted')

    const afterSecond = await transitionLeadStage(ev(db), fixture.orgId, lead.id, { toStage: 'viewing' }, { userId: fixture.userId })
    expect(afterSecond.stage).toBe('viewing')
    // 'viewing' aún no tiene su propio status legado — se deriva a 'proposal', el valor que ya entendían los 20+ consumidores existentes.
    expect(afterSecond.status).toBe('proposal')

    const history = await db
      .select()
      .from(schema.leadStageHistory)
      .where(eq(schema.leadStageHistory.leadId, lead.id))
      .orderBy(schema.leadStageHistory.id)
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ fromStage: 'new', toStage: 'contacted' })
    expect(history[1]).toMatchObject({ fromStage: 'contacted', toStage: 'viewing' })
  })

  it('rechaza un stage inventado sin tocar el lead', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'PipelineInvalidStage')
    const lead = await seedLead(db, fixture.orgId, 'Lead Stage Malo')
    const { transitionLeadStage, LeadPipelineError } = await import('../../server/utils/leads/pipeline')

    await expect(transitionLeadStage(ev(db), fixture.orgId, lead.id, { toStage: 'ganado_de_mentira' })).rejects.toThrow(LeadPipelineError)

    const [unchanged] = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id))
    expect(unchanged.stage).toBe('new')
  })

  it('perder un lead es una dimensión de OUTCOME: el stage se queda congelado donde estaba, nunca se resetea', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'PipelineOutcome')
    const lead = await seedLead(db, fixture.orgId, 'Lead Perdido')
    const { transitionLeadStage, setLeadOutcome } = await import('../../server/utils/leads/pipeline')

    await transitionLeadStage(ev(db), fixture.orgId, lead.id, { toStage: 'negotiation' })
    const lost = await setLeadOutcome(ev(db), fixture.orgId, lead.id, { lost: true, lostReason: 'not_interested' })
    expect(lost.status).toBe('lost')
    expect(lost.lostReason).toBe('not_interested')
    expect(lost.stage).toBe('negotiation') // nunca stage=won/status=lost ni se pierde en qué punto se cayó

    const historyAfterLoss = await db.select().from(schema.leadStageHistory).where(eq(schema.leadStageHistory.leadId, lead.id))
    expect(historyAfterLoss).toHaveLength(1) // perder no es un movimiento de stage: no añade historial

    const reactivated = await setLeadOutcome(ev(db), fixture.orgId, lead.id, { lost: false })
    expect(reactivated.lostReason).toBeNull()
    expect(reactivated.stage).toBe('negotiation')
    // Reactivar vuelve al status que corresponde al stage actual, no a 'new' a secas.
    expect(reactivated.status).toBe('proposal')
  })

  it('rechaza un motivo de pérdida no reconocido', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'PipelineBadReason')
    const lead = await seedLead(db, fixture.orgId, 'Lead Motivo Malo')
    const { setLeadOutcome, LeadPipelineError } = await import('../../server/utils/leads/pipeline')

    await expect(setLeadOutcome(ev(db), fixture.orgId, lead.id, { lost: true, lostReason: 'porque_si' })).rejects.toThrow(LeadPipelineError)
  })

  it('aislamiento entre tenants: no se puede mover ni perder un lead de otra organización', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'PipelineTenantA')
    const b = await seedTenant(db, 'PipelineTenantB')
    const leadA = await seedLead(db, a.orgId, 'Lead de A')
    const { transitionLeadStage, setLeadOutcome, LeadPipelineError } = await import('../../server/utils/leads/pipeline')

    await expect(transitionLeadStage(ev(db), b.orgId, leadA.id, { toStage: 'contacted' })).rejects.toThrow(LeadPipelineError)
    await expect(setLeadOutcome(ev(db), b.orgId, leadA.id, { lost: true })).rejects.toThrow(LeadPipelineError)
  })
})

describe('FASE 14 — Deduplicación segura de Contact (migración 0069)', () => {
  it('previewMerge enseña los conflictos de campo y cuánto se movería, sin tocar nada todavía', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DedupPreview')
    const master = await seedContact(db, fixture.orgId, { name: 'Elena Soto', email: 'elena@example.com' })
    const duplicate = await seedContact(db, fixture.orgId, { name: 'Elena Soto', email: 'elena.soto@example.com' })
    const { previewMerge } = await import('../../server/utils/contacts/merge')

    const preview = await previewMerge(ev(db), fixture.orgId, master.id, duplicate.id)
    expect(preview.conflicts).toEqual([{ field: 'email', masterValue: 'elena@example.com', duplicateValue: 'elena.soto@example.com' }])
    expect(preview.relations).toEqual({ buyerRequirements: 0, leads: 0, clients: 0 })
  })

  it('no se puede fusionar un contacto consigo mismo, ni uno que no existe en el tenant', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DedupGuards')
    const master = await seedContact(db, fixture.orgId, { name: 'Solo' })
    const { previewMerge, ContactMergeError } = await import('../../server/utils/contacts/merge')

    await expect(previewMerge(ev(db), fixture.orgId, master.id, master.id)).rejects.toThrow(ContactMergeError)
    await expect(previewMerge(ev(db), fixture.orgId, master.id, 999999)).rejects.toThrow(ContactMergeError)
  })

  it('fusiona de verdad: reasigna buyerRequirements/leads/clients, archiva (nunca DELETE) al duplicado', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DedupMerge')
    const master = await seedContact(db, fixture.orgId, { name: 'Fabio Mora', phone: '600111222' })
    const duplicate = await seedContact(db, fixture.orgId, { name: 'Fabio Mora', email: 'fabio@example.com' })

    const [req] = await db.insert(schema.buyerRequirements).values({ organizationId: fixture.orgId, contactId: duplicate.id, operation: 'sale', status: 'active', createdAt: ts, updatedAt: ts }).returning()
    const [lead] = await db.insert(schema.leads).values({ organizationId: fixture.orgId, contactId: duplicate.id, name: 'Fabio Mora', source: 'web', status: 'new', stage: 'new', score: 10, createdAt: ts, updatedAt: ts }).returning()
    const [client] = await db.insert(schema.clients).values({ organizationId: fixture.orgId, contactId: duplicate.id, name: 'Fabio Mora', createdAt: ts, updatedAt: ts }).returning()

    const { mergeContacts } = await import('../../server/utils/contacts/merge')
    // defaultCountryPrefix viene siempre de orgDefaultCountryPrefix() en la ruta real
    // (server/api/admin/saas/contacts/merge.post.ts) — sin él, un teléfono en formato
    // local nunca normaliza (comportamiento correcto y ya probado en comms/phone.test.ts).
    const merged = await mergeContacts(ev(db), fixture.orgId, { masterId: master.id, duplicateId: duplicate.id }, { userId: fixture.userId, defaultCountryPrefix: '+34' })

    expect(merged.id).toBe(master.id)
    // El email del duplicado rellena el hueco del superviviente (no lo tenía); el teléfono ya existente no se pierde.
    expect(merged.email).toBe('fabio@example.com')
    expect(merged.phone).toBe('600111222')
    expect(merged.normalizedPhone).toBeTruthy() // no se pierde la normalización por fusionar sólo el campo email (bug evitado)

    const [reqAfter] = await db.select().from(schema.buyerRequirements).where(eq(schema.buyerRequirements.id, req.id))
    const [leadAfter] = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id))
    const [clientAfter] = await db.select().from(schema.clients).where(eq(schema.clients.id, client.id))
    expect(reqAfter.contactId).toBe(master.id)
    expect(leadAfter.contactId).toBe(master.id)
    expect(clientAfter.contactId).toBe(master.id)

    const [dupAfter] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, duplicate.id))
    expect(dupAfter).toBeTruthy() // nunca un DELETE — la fila sigue existiendo
    expect(dupAfter.status).toBe('archived')
    expect(dupAfter.deletedAt).toBeTruthy()
  })

  it('un conflicto de campo resuelto explícitamente respeta la elección, no gana el superviviente por defecto', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DedupFieldChoice')
    const master = await seedContact(db, fixture.orgId, { name: 'Gala Ibars', email: 'gala.vieja@example.com' })
    const duplicate = await seedContact(db, fixture.orgId, { name: 'Gala Ibars', email: 'gala.nueva@example.com' })
    const { mergeContacts } = await import('../../server/utils/contacts/merge')

    const merged = await mergeContacts(ev(db), fixture.orgId, { masterId: master.id, duplicateId: duplicate.id, fields: { email: 'gala.nueva@example.com' } }, {})
    expect(merged.email).toBe('gala.nueva@example.com')
    expect(merged.normalizedEmail).toBe('gala.nueva@example.com')
  })

  it('aislamiento entre tenants: no se puede fusionar contactos de otra organización', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'DedupTenantA')
    const b = await seedTenant(db, 'DedupTenantB')
    const contactA = await seedContact(db, a.orgId, { name: 'De A' })
    const contactB = await seedContact(db, b.orgId, { name: 'De B' })
    const { previewMerge, ContactMergeError } = await import('../../server/utils/contacts/merge')

    await expect(previewMerge(ev(db), a.orgId, contactA.id, contactB.id)).rejects.toThrow(ContactMergeError)
  })
})
