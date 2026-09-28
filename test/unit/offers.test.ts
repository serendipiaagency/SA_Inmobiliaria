import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { eq, and } from 'drizzle-orm'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 23 — Offer, migración 0078.
 *
 * El requisito no negociable de este dominio (§79 del encargo): nunca
 * sobrescribir un importe anterior. `offer_revisions` es el histórico
 * inmutable; `offers.current*` es sólo una proyección de lectura rápida.
 * Casi todos los tests comprueban ambas cosas a la vez: que la proyección
 * refleje lo último, y que el histórico conserve TODO lo anterior.
 */

const ts = '2026-01-01 00:00:00'

async function seedContact(db: any, orgId: number, name: string) {
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name, status: 'active', createdAt: ts, updatedAt: ts }).returning()
  return row
}

describe('FASE 23 — OfferService: crear', () => {
  it('crea una oferta en borrador con su primera revisión ("created"), y registra OFFER_CREATED', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OfferHappy')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const { createOffer } = await import('../../server/utils/offers/service')
    const { listActivity } = await import('../../server/utils/activity/service')

    const offer = await createOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 600_000 }, { createdBy: fixture.userId })

    expect(offer.status).toBe('draft')
    expect(offer.currentAmount).toBe(600_000)
    expect(offer.currency).toBe('eur')
    expect(offer.currentRevisionId).toBeTruthy()

    const revisions = await db.select().from(schema.offerRevisions).where(eq(schema.offerRevisions.offerId, offer.id))
    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toMatchObject({ type: 'created', amount: 600_000 })

    const { rows } = await listActivity(db, fixture.orgId, { contactId: buyer.id })
    expect(rows.map((r) => r.eventType)).toContain('OFFER_CREATED')
  })

  it('admite varios vendedores (offer_sellers) — una Property puede tener varios propietarios', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OfferMultiSeller')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const seller1 = await seedContact(db, fixture.orgId, 'Vendedor 1')
    const seller2 = await seedContact(db, fixture.orgId, 'Vendedor 2')
    const { createOffer, getOfferWithRevisions } = await import('../../server/utils/offers/service')

    const offer = await createOffer(db, fixture.orgId, { propertyId: fixture.propertyId, propertyKind: 'agent', buyerContactId: buyer.id, sellerContactIds: [seller1.id, seller2.id], amount: 300_000 })

    const { sellerContactIds } = await getOfferWithRevisions(db, fixture.orgId, offer.id)
    expect(sellerContactIds.sort()).toEqual([seller1.id, seller2.id].sort())
  })

  it('rechaza un importe que no sea mayor que cero, un inmueble inexistente, o un comprador de otra organización', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'OfferInvalidA')
    const b = await seedTenant(db, 'OfferInvalidB')
    const buyerA = await seedContact(db, a.orgId, 'Comprador A')
    const { createOffer } = await import('../../server/utils/offers/service')

    await expect(createOffer(db, a.orgId, { propertyId: a.projectId, propertyKind: 'developer', buyerContactId: buyerA.id, amount: 0 })).rejects.toThrow(/importe/)
    await expect(createOffer(db, a.orgId, { propertyId: 999999, propertyKind: 'developer', buyerContactId: buyerA.id, amount: 100 })).rejects.toThrow(/Inmueble/)
    await expect(createOffer(db, b.orgId, { propertyId: b.projectId, propertyKind: 'developer', buyerContactId: buyerA.id, amount: 100 })).rejects.toThrow(/Comprador/)
  })
})

describe('FASE 23 — OfferService: ciclo de negociación completo (§81 del encargo)', () => {
  it('600.000 → 640.000 → 620.000 → aceptada a 620.000, sin perder ninguna de las cuatro etapas', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OfferNegotiation')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const { createOffer, submitOffer, counterOffer, acceptOffer } = await import('../../server/utils/offers/service')

    const created = await createOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 600_000 })
    const submitted = await submitOffer(db, fixture.orgId, created.id, {}, { actorType: 'user', actorId: fixture.userId })
    expect(submitted.status).toBe('submitted')
    expect(submitted.currentAmount).toBe(600_000)

    const countered1 = await counterOffer(db, fixture.orgId, created.id, { amount: 640_000 }, { actorType: 'seller' })
    expect(countered1.status).toBe('countered')
    expect(countered1.currentAmount).toBe(640_000)

    const countered2 = await counterOffer(db, fixture.orgId, created.id, { amount: 620_000 }, { actorType: 'buyer' })
    expect(countered2.currentAmount).toBe(620_000)

    const accepted = await acceptOffer(db, fixture.orgId, created.id, { actorType: 'seller' }, countered2.currentRevisionId!)
    expect(accepted.status).toBe('accepted')
    expect(accepted.currentAmount).toBe(620_000)

    // El histórico conserva las CUATRO etapas — nada se sobrescribió.
    const revisions = await db.select().from(schema.offerRevisions).where(eq(schema.offerRevisions.offerId, created.id)).orderBy(schema.offerRevisions.id)
    expect(revisions.map((r: any) => [r.type, r.amount])).toEqual([
      ['created', 600_000],
      ['submitted', 600_000],
      ['countered', 640_000],
      ['countered', 620_000],
      ['accepted', 620_000],
    ])
  })

  it('§85 concurrencia: aceptar una revisión que ya quedó obsoleta por una contraoferta posterior se rechaza con 409', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OfferConcurrency')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const { createOffer, submitOffer, counterOffer, acceptOffer } = await import('../../server/utils/offers/service')

    const created = await createOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 600_000 })
    const submitted = await submitOffer(db, fixture.orgId, created.id, {}, { actorType: 'user' })
    const staleRevisionId = submitted.currentRevisionId!

    // Mientras tanto, llega una contraoferta que cambia el importe actual.
    await counterOffer(db, fixture.orgId, created.id, { amount: 640_000 }, { actorType: 'seller' })

    await expect(acceptOffer(db, fixture.orgId, created.id, { actorType: 'buyer' }, staleRevisionId)).rejects.toThrow(/cambió mientras tanto/)

    // La oferta sigue "countered" — no se aceptó nada por accidente.
    const [row] = await db.select({ status: schema.offers.status }).from(schema.offers).where(eq(schema.offers.id, created.id))
    expect(row.status).toBe('countered')
  })

  it('transiciones inválidas se rechazan: no se puede aceptar un borrador ni contraofertar una oferta ya aceptada', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OfferInvalidTransitions')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const { createOffer, submitOffer, acceptOffer, counterOffer } = await import('../../server/utils/offers/service')

    const draft = await createOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 500_000 })
    await expect(acceptOffer(db, fixture.orgId, draft.id, { actorType: 'user' })).rejects.toThrow(/No se puede pasar/)

    await submitOffer(db, fixture.orgId, draft.id, {}, { actorType: 'user' })
    const accepted = await acceptOffer(db, fixture.orgId, draft.id, { actorType: 'user' })
    expect(accepted.status).toBe('accepted')
    await expect(counterOffer(db, fixture.orgId, draft.id, { amount: 510_000 }, { actorType: 'buyer' })).rejects.toThrow(/No se puede pasar/)
  })

  it('rechazar y retirar registran su propia revisión y su propio evento de Activity', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OfferRejectWithdraw')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const { createOffer, submitOffer, rejectOffer, withdrawOffer } = await import('../../server/utils/offers/service')
    const { listActivity } = await import('../../server/utils/activity/service')

    const offerA = await createOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 500_000 })
    await submitOffer(db, fixture.orgId, offerA.id, {}, { actorType: 'user' })
    const rejected = await rejectOffer(db, fixture.orgId, offerA.id, { actorType: 'seller' })
    expect(rejected.status).toBe('rejected')

    const offerB = await createOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 400_000 })
    const withdrawn = await withdrawOffer(db, fixture.orgId, offerB.id, { actorType: 'buyer' })
    expect(withdrawn.status).toBe('withdrawn')

    const { rows } = await listActivity(db, fixture.orgId, { contactId: buyer.id })
    const types = rows.map((r) => r.eventType)
    expect(types).toContain('OFFER_REJECTED')
    expect(types).toContain('OFFER_WITHDRAWN')
  })
})

describe('FASE 23 — expiración', () => {
  it('expireOffer marca como expirada una oferta activa con expiration ya pasada, y registra OFFER_EXPIRED', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OfferExpire')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const { createOffer, submitOffer, expireOffer, isOfferExpired } = await import('../../server/utils/offers/service')
    const { listActivity } = await import('../../server/utils/activity/service')

    const created = await createOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 500_000, expiration: '2020-01-01 00:00:00' })
    const submitted = await submitOffer(db, fixture.orgId, created.id, {}, { actorType: 'user' })
    expect(isOfferExpired(submitted)).toBe(true)

    const expired = await expireOffer(db, fixture.orgId, created.id)
    expect(expired.status).toBe('expired')

    const { rows } = await listActivity(db, fixture.orgId, { contactId: buyer.id })
    expect(rows.map((r) => r.eventType)).toContain('OFFER_EXPIRED')
  })

  it('isOfferExpired es falso sin expiration, o si ya está aceptada/rechazada', async () => {
    const { isOfferExpired } = await import('../../server/utils/offers/service')
    expect(isOfferExpired({ status: 'submitted', expiration: null })).toBe(false)
    expect(isOfferExpired({ status: 'accepted', expiration: '2020-01-01 00:00:00' })).toBe(false)
    expect(isOfferExpired({ status: 'submitted', expiration: '2099-01-01 00:00:00' })).toBe(false)
  })

  it('el cron offers:expire sólo expira las que de verdad corresponden, y deja las demás intactas', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OfferExpireCron')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const { createOffer, submitOffer } = await import('../../server/utils/offers/service')

    const due = await createOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 500_000, expiration: '2020-01-01 00:00:00' })
    await submitOffer(db, fixture.orgId, due.id, {}, { actorType: 'user' })
    const notDue = await createOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 500_000, expiration: '2099-01-01 00:00:00' })
    await submitOffer(db, fixture.orgId, notDue.id, {}, { actorType: 'user' })

    const { expireOffer } = await import('../../server/utils/offers/service')
    const { inArray, isNotNull, lt } = await import('drizzle-orm')
    const dueRows = await db
      .select({ id: schema.offers.id, organizationId: schema.offers.organizationId })
      .from(schema.offers)
      .where(and(inArray(schema.offers.status, ['submitted', 'countered']), isNotNull(schema.offers.expiration), lt(schema.offers.expiration, '2026-01-01 00:00:00')))
    for (const row of dueRows) await expireOffer(db, row.organizationId, row.id)

    const [dueRow] = await db.select({ status: schema.offers.status }).from(schema.offers).where(eq(schema.offers.id, due.id))
    const [notDueRow] = await db.select({ status: schema.offers.status }).from(schema.offers).where(eq(schema.offers.id, notDue.id))
    expect(dueRow.status).toBe('expired')
    expect(notDueRow.status).toBe('submitted')
  })
})

describe('FASE 23 — listOffers y aislamiento entre tenants', () => {
  it('filtra por inmueble, comprador, vendedor y estado', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OfferList')
    const buyer1 = await seedContact(db, fixture.orgId, 'Comprador 1')
    const buyer2 = await seedContact(db, fixture.orgId, 'Comprador 2')
    const seller = await seedContact(db, fixture.orgId, 'Vendedor')
    const { createOffer, listOffers } = await import('../../server/utils/offers/service')

    const o1 = await createOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer1.id, sellerContactIds: [seller.id], amount: 100 })
    await createOffer(db, fixture.orgId, { propertyId: fixture.propertyId, propertyKind: 'agent', buyerContactId: buyer2.id, amount: 200 })

    expect((await listOffers(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer' })).map((o) => o.id)).toEqual([o1.id])
    expect((await listOffers(db, fixture.orgId, { buyerContactId: buyer1.id })).map((o) => o.id)).toEqual([o1.id])
    expect((await listOffers(db, fixture.orgId, { sellerContactId: seller.id })).map((o) => o.id)).toEqual([o1.id])
    expect((await listOffers(db, fixture.orgId, { status: 'draft' }))).toHaveLength(2)
  })

  it('las ofertas de una organización no aparecen al listar las de otra', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'OfferTenantA')
    const b = await seedTenant(db, 'OfferTenantB')
    const buyerA = await seedContact(db, a.orgId, 'Comprador A')
    const { createOffer, listOffers } = await import('../../server/utils/offers/service')

    await createOffer(db, a.orgId, { propertyId: a.projectId, propertyKind: 'developer', buyerContactId: buyerA.id, amount: 100 })
    expect(await listOffers(db, b.orgId, {})).toHaveLength(0)
  })
})

describe('FASE 23 — Visit Outcome §86: "Crear oferta" usa OfferService', () => {
  it('recordVisitOutcome con createOffer crea una Offer real en borrador, ligada al lead/contacto/inmueble de la visita', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OutcomeOffer')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador Visita')
    const [lead] = await db.insert(schema.leads).values({ organizationId: fixture.orgId, name: 'Lead Outcome', source: 'web', status: 'active', stage: 'viewing', score: 10, contactId: buyer.id, createdAt: ts, updatedAt: ts }).returning()
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')
    const { listOffers } = await import('../../server/utils/offers/service')

    const [laura] = await db
      .insert(schema.teamMembers)
      .values({ organizationId: fixture.orgId, name: 'Laura', slug: 'laura-outcome-offer', email: 'laura-outcome-offer@example.com', position: 'Comercial', slotDurationMinutes: 60, createdAt: ts, updatedAt: ts })
      .returning()
    const visit = await createAdminAppointment(db, fixture.orgId, {
      clientName: 'Cliente Outcome Offer',
      clientEmail: 'x@example.com',
      agentId: laura.id,
      propertyId: fixture.projectId,
      propertyKind: 'developer',
      scheduledAt: '2026-02-01 10:00:00',
      leadId: lead.id,
    })
    await db.update(schema.visits).set({ status: 'completed' }).where(eq(schema.visits.id, visit.id))

    const result = await recordVisitOutcome(db, fixture.orgId, visit.id, { outcome: 'interested', createOffer: { amount: 450_000 } }, { actorId: fixture.userId })
    expect(result.offerId).toBeTruthy()

    const offers = await listOffers(db, fixture.orgId, { buyerContactId: buyer.id })
    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({ status: 'draft', currentAmount: 450_000, propertyId: fixture.projectId, commercialId: laura.id })
  })

  it('sin contacto resuelto en la visita, crear oferta desde su resultado falla con un mensaje claro', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OutcomeOfferNoContact')
    const [laura] = await db
      .insert(schema.teamMembers)
      .values({ organizationId: fixture.orgId, name: 'Laura', slug: 'laura-outcome-offer-2', email: 'laura-outcome-offer-2@example.com', position: 'Comercial', slotDurationMinutes: 60, createdAt: ts, updatedAt: ts })
      .returning()
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')

    const visit = await createAdminAppointment(db, fixture.orgId, { clientName: 'Sin lead', clientEmail: 'x2@example.com', agentId: laura.id, propertyId: fixture.projectId, propertyKind: 'developer', scheduledAt: '2026-02-01 10:00:00' })
    await db.update(schema.visits).set({ status: 'completed' }).where(eq(schema.visits.id, visit.id))

    await expect(recordVisitOutcome(db, fixture.orgId, visit.id, { outcome: 'interested', createOffer: { amount: 100 } })).rejects.toThrow(/comprador identificado/)
  })
})
