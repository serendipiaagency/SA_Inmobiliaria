import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 24 — Deal Operation, migración 0079.
 *
 * `dealOperations` (tabla `deal_operations`) es el pipeline nuevo — no
 * confundir con `schema.deals` (tabla legacy `deals`, ya existente para
 * comisiones de cierres manuales, ver docs/deals.md). Nace siempre de
 * `createDeal()` sobre una Offer ya `accepted` (§94: nunca automático), y al
 * cerrarse crea además un apunte en la tabla legacy — ese puente es lo que
 * más se prueba aquí, junto con la regla de "no se borra nada" al cancelar.
 */

const ts = '2026-01-01 00:00:00'

async function seedContact(db: any, orgId: number, name: string) {
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name, status: 'active', createdAt: ts, updatedAt: ts }).returning()
  return row
}

async function seedAcceptedOffer(db: any, orgId: number, opts: { propertyId: number; propertyKind: 'agent' | 'developer'; buyerContactId: number; sellerContactIds?: number[]; commercialId?: number | null; amount: number }) {
  const { createOffer, submitOffer, acceptOffer } = await import('../../server/utils/offers/service')
  const created = await createOffer(db, orgId, opts)
  await submitOffer(db, orgId, created.id, {}, { actorType: 'user' })
  return acceptOffer(db, orgId, created.id, { actorType: 'seller' })
}

describe('FASE 24 — DealService: crear', () => {
  it('crea una operación a partir de una oferta aceptada, copiando importe/moneda/comprador/vendedores/comercial, y registra DEAL_CREATED', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DealHappy')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const seller = await seedContact(db, fixture.orgId, 'Vendedor')
    const offer = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, sellerContactIds: [seller.id], commercialId: fixture.teamMemberId, amount: 500_000 })
    const { createDeal } = await import('../../server/utils/deals/service')
    const { listActivity } = await import('../../server/utils/activity/service')

    const deal = await createDeal(db, fixture.orgId, { acceptedOfferId: offer.id }, { createdBy: fixture.userId })

    expect(deal.stage).toBe('accepted_offer')
    expect(deal.status).toBe('active')
    expect(deal.agreedAmount).toBe(500_000)
    expect(deal.currency).toBe(offer.currency)
    expect(deal.buyerContactId).toBe(buyer.id)
    expect(deal.commercialId).toBe(fixture.teamMemberId)

    const sellerRows = await db.select().from(schema.dealOperationSellers).where(eq(schema.dealOperationSellers.dealOperationId, deal.id))
    expect(sellerRows.map((r: any) => r.contactId)).toEqual([seller.id])

    const history = await db.select().from(schema.dealOperationStageHistory).where(eq(schema.dealOperationStageHistory.dealOperationId, deal.id))
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ fromStage: null, toStage: 'accepted_offer' })

    const { rows } = await listActivity(db, fixture.orgId, { contactId: buyer.id })
    expect(rows.map((r) => r.eventType)).toContain('DEAL_CREATED')
  })

  it('rechaza crear una operación sobre una oferta que no está aceptada, y sobre una oferta que ya tiene una operación (409)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DealInvalid')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const { createOffer } = await import('../../server/utils/offers/service')
    const { createDeal } = await import('../../server/utils/deals/service')

    const draft = await createOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 100_000 })
    await expect(createDeal(db, fixture.orgId, { acceptedOfferId: draft.id })).rejects.toThrow(/aceptada/)

    const offer = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 200_000 })
    await createDeal(db, fixture.orgId, { acceptedOfferId: offer.id })
    await expect(createDeal(db, fixture.orgId, { acceptedOfferId: offer.id })).rejects.toThrow(/Ya existe una operación/)
  })
})

describe('FASE 24 — DealService: etapas', () => {
  it('mueve de etapa y conserva el histórico completo, append-only', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DealStages')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const offer = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 300_000 })
    const { createDeal, transitionDealStage } = await import('../../server/utils/deals/service')

    const deal = await createDeal(db, fixture.orgId, { acceptedOfferId: offer.id })
    await transitionDealStage(db, fixture.orgId, deal.id, 'reservation', { actorType: 'user' })
    const afterDeposit = await transitionDealStage(db, fixture.orgId, deal.id, 'deposit_contract', { actorType: 'user', reason: 'Arras firmadas' })
    expect(afterDeposit.stage).toBe('deposit_contract')

    const history = await db.select().from(schema.dealOperationStageHistory).where(eq(schema.dealOperationStageHistory.dealOperationId, deal.id)).orderBy(schema.dealOperationStageHistory.id)
    expect(history.map((h: any) => [h.fromStage, h.toStage])).toEqual([
      [null, 'accepted_offer'],
      ['accepted_offer', 'reservation'],
      ['reservation', 'deposit_contract'],
    ])
  })

  it('rechaza mover a "closed" por transición de etapa — sólo closeDeal() cierra la operación', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DealNoStageClose')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const offer = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 300_000 })
    const { createDeal, transitionDealStage } = await import('../../server/utils/deals/service')

    const deal = await createDeal(db, fixture.orgId, { acceptedOfferId: offer.id })
    await expect(transitionDealStage(db, fixture.orgId, deal.id, 'closed' as any, { actorType: 'user' })).rejects.toThrow(/acción "Cerrar"/)
  })

  it('rechaza transicionar o cerrar una operación que ya no está activa', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DealNotActive')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const offer = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 300_000 })
    const { createDeal, transitionDealStage, cancelDeal, closeDeal } = await import('../../server/utils/deals/service')

    const deal = await createDeal(db, fixture.orgId, { acceptedOfferId: offer.id })
    await cancelDeal(db, fixture.orgId, deal.id, { actorType: 'user', reason: 'El comprador se retiró' })

    await expect(transitionDealStage(db, fixture.orgId, deal.id, 'reservation', { actorType: 'user' })).rejects.toThrow(/no está activa/)
    await expect(closeDeal(db, fixture.orgId, deal.id, { actorType: 'user' })).rejects.toThrow(/no está activa/)
  })
})

describe('FASE 24 — DealService: cierre, sincronización de inmueble y puente a la tabla legacy', () => {
  it('al cerrar una operación sobre un inmueble de 2ª mano en venta, marca el inmueble como vendido', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DealCloseAgentSale')
    await db.update(schema.agentProperties).set({ transactionType: 'sale' }).where(eq(schema.agentProperties.id, fixture.propertyId))
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const offer = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.propertyId, propertyKind: 'agent', buyerContactId: buyer.id, amount: 250_000 })
    const { createDeal, closeDeal } = await import('../../server/utils/deals/service')
    const { listActivity } = await import('../../server/utils/activity/service')

    const deal = await createDeal(db, fixture.orgId, { acceptedOfferId: offer.id })
    const closed = await closeDeal(db, fixture.orgId, deal.id, { actorType: 'user' })
    expect(closed.stage).toBe('closed')
    expect(closed.status).toBe('closed')
    expect(closed.closedAt).toBeTruthy()

    const [property] = await db.select({ status: schema.agentProperties.status }).from(schema.agentProperties).where(eq(schema.agentProperties.id, fixture.propertyId))
    expect(property.status).toBe('sold')

    const { rows } = await listActivity(db, fixture.orgId, { contactId: buyer.id })
    expect(rows.map((r) => r.eventType)).toContain('DEAL_CLOSED')
  })

  it('al cerrar una operación de alquiler en 2ª mano, o de cualquier obra nueva, no inventa un estado de venta — no toca el inmueble', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DealCloseNoop')
    await db.update(schema.agentProperties).set({ transactionType: 'rent' }).where(eq(schema.agentProperties.id, fixture.propertyId))
    const buyer = await seedContact(db, fixture.orgId, 'Inquilino')
    const rentOffer = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.propertyId, propertyKind: 'agent', buyerContactId: buyer.id, amount: 900 })
    const { createDeal, closeDeal } = await import('../../server/utils/deals/service')

    const rentDeal = await createDeal(db, fixture.orgId, { acceptedOfferId: rentOffer.id })
    await closeDeal(db, fixture.orgId, rentDeal.id, { actorType: 'user' })
    const [agentProp] = await db.select({ status: schema.agentProperties.status }).from(schema.agentProperties).where(eq(schema.agentProperties.id, fixture.propertyId))
    expect(agentProp.status).toBe('available')

    const [devBefore] = await db.select({ status: schema.developerProperties.status }).from(schema.developerProperties).where(eq(schema.developerProperties.id, fixture.projectId))
    const buyer2 = await seedContact(db, fixture.orgId, 'Comprador obra nueva')
    const devOffer = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer2.id, amount: 400_000 })
    const devDeal = await createDeal(db, fixture.orgId, { acceptedOfferId: devOffer.id })
    await closeDeal(db, fixture.orgId, devDeal.id, { actorType: 'user' })
    const [devAfter] = await db.select({ status: schema.developerProperties.status }).from(schema.developerProperties).where(eq(schema.developerProperties.id, fixture.projectId))
    expect(devAfter.status).toBe(devBefore.status)
  })

  it('crea un apunte en la tabla legacy `deals` al cerrar, con los datos resueltos de verdad, y guarda su id en legacyDealId', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DealLegacyBridge')
    const buyer = await seedContact(db, fixture.orgId, 'Ana Compradora')
    const offer = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, commercialId: fixture.teamMemberId, amount: 480_000 })
    const { createDeal, closeDeal } = await import('../../server/utils/deals/service')

    const deal = await createDeal(db, fixture.orgId, { acceptedOfferId: offer.id })
    const closed = await closeDeal(db, fixture.orgId, deal.id, { actorType: 'user' })
    expect(closed.legacyDealId).toBeTruthy()

    const [legacyRow] = await db.select().from(schema.deals).where(eq(schema.deals.id, closed.legacyDealId!))
    expect(legacyRow).toMatchObject({
      organizationId: fixture.orgId,
      clientName: 'Ana Compradora',
      dealValue: 480_000,
      dealType: 'sale',
      commissionRate: 0,
      commissionAmount: 0,
    })
    expect(legacyRow.agentId).toBe(fixture.teamMemberId)

    const [dealRow] = await db.select({ legacyDealId: schema.dealOperations.legacyDealId }).from(schema.dealOperations).where(eq(schema.dealOperations.id, deal.id))
    expect(dealRow.legacyDealId).toBe(legacyRow.id)
  })

  it('el puente mapea el alquiler de 2ª mano a dealType "rental"', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DealLegacyBridgeRental')
    await db.update(schema.agentProperties).set({ transactionType: 'rent' }).where(eq(schema.agentProperties.id, fixture.propertyId))
    const buyer = await seedContact(db, fixture.orgId, 'Inquilino Puente')
    const offer = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.propertyId, propertyKind: 'agent', buyerContactId: buyer.id, amount: 950 })
    const { createDeal, closeDeal } = await import('../../server/utils/deals/service')

    const deal = await createDeal(db, fixture.orgId, { acceptedOfferId: offer.id })
    const closed = await closeDeal(db, fixture.orgId, deal.id, { actorType: 'user' })
    const [legacyRow] = await db.select({ dealType: schema.deals.dealType }).from(schema.deals).where(eq(schema.deals.id, closed.legacyDealId!))
    expect(legacyRow.dealType).toBe('rental')
  })
})

describe('FASE 24 — DealService: cancelación (§114, no se borra nada)', () => {
  it('cancela sin borrar nada — histórico, Offer, y la propia operación siguen intactos', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DealCancel')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const offer = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 300_000 })
    const { createDeal, transitionDealStage, cancelDeal } = await import('../../server/utils/deals/service')
    const { listActivity } = await import('../../server/utils/activity/service')

    const deal = await createDeal(db, fixture.orgId, { acceptedOfferId: offer.id })
    await transitionDealStage(db, fixture.orgId, deal.id, 'reservation', { actorType: 'user' })
    const cancelled = await cancelDeal(db, fixture.orgId, deal.id, { actorType: 'user', reason: 'El comprador desistió' })

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancelledAt).toBeTruthy()
    expect(cancelled.cancelReason).toBe('El comprador desistió')
    // La etapa alcanzada no se pierde ni se reinicia al cancelar.
    expect(cancelled.stage).toBe('reservation')

    const [offerRow] = await db.select({ status: schema.offers.status }).from(schema.offers).where(eq(schema.offers.id, offer.id))
    expect(offerRow.status).toBe('accepted')

    const history = await db.select().from(schema.dealOperationStageHistory).where(eq(schema.dealOperationStageHistory.dealOperationId, deal.id))
    expect(history.length).toBeGreaterThan(0)

    const { rows } = await listActivity(db, fixture.orgId, { contactId: buyer.id })
    expect(rows.map((r) => r.eventType)).toContain('DEAL_CANCELLED')

    // Cancelar no crea ningún apunte en la tabla legacy — sólo cerrar lo hace.
    expect(await db.select().from(schema.deals).where(eq(schema.deals.organizationId, fixture.orgId))).toHaveLength(0)
  })
})

describe('FASE 24 — listDeals y aislamiento entre tenants', () => {
  it('filtra por inmueble, comprador, vendedor, comercial, estado y etapa', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DealList')
    const buyer1 = await seedContact(db, fixture.orgId, 'Comprador 1')
    const buyer2 = await seedContact(db, fixture.orgId, 'Comprador 2')
    const seller = await seedContact(db, fixture.orgId, 'Vendedor')
    const offer1 = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer1.id, sellerContactIds: [seller.id], commercialId: fixture.teamMemberId, amount: 100_000 })
    const offer2 = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.propertyId, propertyKind: 'agent', buyerContactId: buyer2.id, amount: 200_000 })
    const { createDeal, transitionDealStage, listDeals } = await import('../../server/utils/deals/service')

    const deal1 = await createDeal(db, fixture.orgId, { acceptedOfferId: offer1.id })
    await transitionDealStage(db, fixture.orgId, deal1.id, 'reservation', { actorType: 'user' })
    await createDeal(db, fixture.orgId, { acceptedOfferId: offer2.id })

    expect((await listDeals(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer' })).map((d) => d.id)).toEqual([deal1.id])
    expect((await listDeals(db, fixture.orgId, { buyerContactId: buyer1.id })).map((d) => d.id)).toEqual([deal1.id])
    expect((await listDeals(db, fixture.orgId, { sellerContactId: seller.id })).map((d) => d.id)).toEqual([deal1.id])
    expect((await listDeals(db, fixture.orgId, { commercialId: fixture.teamMemberId })).map((d) => d.id)).toEqual([deal1.id])
    expect((await listDeals(db, fixture.orgId, { stage: 'reservation' })).map((d) => d.id)).toEqual([deal1.id])
    expect(await listDeals(db, fixture.orgId, { status: 'active' })).toHaveLength(2)
  })

  it('las operaciones de una organización no aparecen al listar las de otra, ni al pedir su ficha', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'DealTenantA')
    const b = await seedTenant(db, 'DealTenantB')
    const buyerA = await seedContact(db, a.orgId, 'Comprador A')
    const offerA = await seedAcceptedOffer(db, a.orgId, { propertyId: a.projectId, propertyKind: 'developer', buyerContactId: buyerA.id, amount: 100_000 })
    const { createDeal, listDeals, getDealDetail } = await import('../../server/utils/deals/service')

    const dealA = await createDeal(db, a.orgId, { acceptedOfferId: offerA.id })
    expect(await listDeals(db, b.orgId, {})).toHaveLength(0)
    await expect(getDealDetail(db, b.orgId, dealA.id)).rejects.toThrow(/no encontrada/)
  })
})

describe('FASE 24 — getDealDetail: próxima acción derivada', () => {
  it('deriva la próxima acción de la tarea o cita más próxima de la operación, sin inventar un sistema de seguimiento nuevo', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'DealNextAction')
    const buyer = await seedContact(db, fixture.orgId, 'Comprador')
    const offer = await seedAcceptedOffer(db, fixture.orgId, { propertyId: fixture.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 300_000 })
    const { createDeal, getDealDetail } = await import('../../server/utils/deals/service')
    const { createTask } = await import('../../server/utils/tasks/service')

    const deal = await createDeal(db, fixture.orgId, { acceptedOfferId: offer.id })
    const before = await getDealDetail(db, fixture.orgId, deal.id)
    expect(before.nextAction).toBeNull()

    await createTask(db, fixture.orgId, { type: 'other', title: 'Enviar documentación', dealId: deal.id, dueAt: '2027-01-10 10:00:00' })
    const after = await getDealDetail(db, fixture.orgId, deal.id)
    expect(after.nextAction).toMatchObject({ type: 'task:other', at: '2027-01-10 10:00:00' })
  })
})
