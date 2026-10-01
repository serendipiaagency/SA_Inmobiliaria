import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { advancePropertyMatches } from '../../server/utils/matching/service'
import { recordVisitOutcome } from '../../server/utils/appointments/outcome'
import { createOffer } from '../../server/utils/offers/service'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * FASE 34 (§158 paso 27) — el PropertyMatch refleja lo que ya ocurrió en
 * otros dominios: visita con resultado → `viewing` (o `discarded` si no le
 * interesa), oferta → `offered`. Sólo hacia delante, nunca resucita un
 * descarte, nunca crea un match que nadie hizo.
 */
const ts = '2026-06-01 09:00:00'
let db: any
let a: TenantFixture
let b: TenantFixture
let contactId: number
let requirementId: number

async function seedMatch(f: TenantFixture, status: string, opts: { contact?: number; requirement?: number; propertyId?: number } = {}) {
  const [m] = await db
    .insert(schema.propertyMatches)
    .values({ organizationId: f.orgId, propertyId: opts.propertyId ?? f.propertyId, buyerRequirementId: opts.requirement ?? requirementId, contactId: opts.contact ?? contactId, status, createdAt: ts, updatedAt: ts })
    .returning()
  return m
}
const statusOf = async (id: number) => (await db.select().from(schema.propertyMatches).where(eq(schema.propertyMatches.id, id)))[0]

async function completedVisit(f: TenantFixture, leadId: number, slot: string) {
  const [v] = await db
    .insert(schema.visits)
    .values({ organizationId: f.orgId, clientName: 'María', scheduledAt: slot, status: 'completed', channel: 'in_person', leadId, propertyId: f.propertyId, propertyKind: 'agent', agentId: f.teamMemberId, createdAt: ts })
    .returning()
  return v
}

beforeEach(async () => {
  ;({ db } = createTestDb())
  a = await seedTenant(db, 'AdvAlpha')
  b = await seedTenant(db, 'AdvBeta')
  const [c] = await db.insert(schema.contacts).values({ organizationId: a.orgId, name: 'María', email: 'maria@example.com', status: 'active', createdAt: ts, updatedAt: ts }).returning()
  contactId = c.id
  await db.update(schema.leads).set({ contactId }).where(eq(schema.leads.id, a.leadId))
  const [r] = await db.insert(schema.buyerRequirements).values({ organizationId: a.orgId, contactId, title: 'Necesidad', createdAt: ts, updatedAt: ts }).returning()
  requirementId = r.id
})

describe('advancePropertyMatches', () => {
  it('visita «interesada» → viewing; oferta → offered; una visita posterior no lo devuelve atrás', async () => {
    const m = await seedMatch(a, 'sent')
    const v1 = await completedVisit(a, a.leadId, '2026-06-02 10:00:00')
    await recordVisitOutcome(db, a.orgId, v1.id, { outcome: 'interested' })
    expect((await statusOf(m.id)).status).toBe('viewing')

    await createOffer(db, a.orgId, { propertyId: a.propertyId, propertyKind: 'agent', buyerContactId: contactId, buyerRequirementId: requirementId, amount: 290000 })
    expect((await statusOf(m.id)).status).toBe('offered')

    const v2 = await completedVisit(a, a.leadId, '2026-06-03 10:00:00')
    await recordVisitOutcome(db, a.orgId, v2.id, { outcome: 'wants_to_think' })
    expect((await statusOf(m.id)).status).toBe('offered')
  })

  it('«no le interesa» descarta con motivo; un descarte nunca se resucita', async () => {
    const m = await seedMatch(a, 'selected')
    const v = await completedVisit(a, a.leadId, '2026-06-02 11:00:00')
    await recordVisitOutcome(db, a.orgId, v.id, { outcome: 'not_interested' })
    const row = await statusOf(m.id)
    expect(row.status).toBe('discarded')
    expect(row.discardedReason).toBe('Tras la visita: no le interesa')

    await createOffer(db, a.orgId, { propertyId: a.propertyId, propertyKind: 'agent', buyerContactId: contactId, amount: 280000 })
    expect((await statusOf(m.id)).status).toBe('discarded')
  })

  it('sin match previo no crea ninguno', async () => {
    const v = await completedVisit(a, a.leadId, '2026-06-02 12:00:00')
    await recordVisitOutcome(db, a.orgId, v.id, { outcome: 'interested' })
    expect(await db.select().from(schema.propertyMatches)).toHaveLength(0)
  })

  it('con buyerRequirementId sólo toca ese par; y nunca otra organización', async () => {
    const [other] = await db.insert(schema.buyerRequirements).values({ organizationId: a.orgId, contactId, title: 'Otra', createdAt: ts, updatedAt: ts }).returning()
    const target = await seedMatch(a, 'sent')
    const sibling = await seedMatch(a, 'sent', { requirement: other.id })
    const n = await advancePropertyMatches(db, a.orgId, { buyerRequirementId: requirementId, propertyId: a.propertyId, propertyKind: 'agent', to: 'offered' })
    expect(n).toBe(1)
    expect((await statusOf(target.id)).status).toBe('offered')
    expect((await statusOf(sibling.id)).status).toBe('sent')

    // Mismo contactId numérico en la otra agencia: no se toca.
    const [rb] = await db.insert(schema.buyerRequirements).values({ organizationId: b.orgId, contactId, title: 'B', createdAt: ts, updatedAt: ts }).returning()
    const foreign = await seedMatch(b, 'sent', { requirement: rb.id, propertyId: b.propertyId })
    await advancePropertyMatches(db, a.orgId, { contactId, propertyId: b.propertyId, propertyKind: 'agent', to: 'viewing' })
    expect((await statusOf(foreign.id)).status).toBe('sent')
  })
})
