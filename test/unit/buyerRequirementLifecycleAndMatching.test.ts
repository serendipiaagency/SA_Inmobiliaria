import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { evaluateMatch } from '../../server/utils/matching/engine'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 10 (lifecycle de BuyerRequirement) y FASE 11 (motor de matching
 * también sobre developer_properties), migración 0069. Sigue el mismo
 * criterio que el resto de la suite: probar el camino real (los servicios de
 * producción contra el esquema migrado), no reimplementar la lógica.
 *
 * Los servicios de producción resuelven la base de datos con
 * `useDb(event)`, que en el Worker real lee `event.context.cloudflare.env.DB`
 * (un D1Database). Aquí no hay Worker ni D1 — sólo el sqlite-proxy de
 * `createTestDb()` — así que `useDb` se sustituye por una versión que lee la
 * instancia de test directamente de `event.context.db`, dejando intacto todo
 * lo demás del módulo (schema, now, cfEnv).
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const ts = '2026-01-01 00:00:00'

function ev(db: any) {
  return { context: { db } } as any
}

async function seedContact(db: any, orgId: number, name: string) {
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name, status: 'active', createdAt: ts, updatedAt: ts }).returning()
  return row
}

describe('FASE 10 — ciclo de vida de BuyerRequirement (migración 0069)', () => {
  it('el PATCH de status ahora sí es un campo directo — activar/pausar/cubrir/archivar', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ReqLifecycle')
    const contact = await seedContact(db, fixture.orgId, 'María López')
    const { createBuyerRequirement, updateBuyerRequirement } = await import('../../server/utils/buyerRequirements/service')

    const created = await createBuyerRequirement(ev(db), fixture.orgId, { contactId: contact.id, operation: 'sale' })
    expect(created.status).toBe('active')

    const paused = await updateBuyerRequirement(ev(db), fixture.orgId, created.id, { status: 'paused' })
    expect(paused?.status).toBe('paused')

    const archived = await updateBuyerRequirement(ev(db), fixture.orgId, created.id, { status: 'archived' })
    expect(archived?.status).toBe('archived')
  })

  it('rechaza un status inventado', async () => {
    const { validateBuyerRequirement, BuyerRequirementValidationError } = await import('../../server/utils/buyerRequirements/service')
    expect(() => validateBuyerRequirement({ contactId: 1, status: 'eliminada' as any })).toThrow(BuyerRequirementValidationError)
  })
})

describe('FASE 11 — el motor de matching cubre developer_properties y agent_properties (migración 0069)', () => {
  it('María busca piso en Chamberí — persiste con estructura real (test §127 del megaprompt)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'MatchMaria')
    const contact = await seedContact(db, fixture.orgId, 'María López')
    const { createBuyerRequirement } = await import('../../server/utils/buyerRequirements/service')

    const req = await createBuyerRequirement(ev(db), fixture.orgId, {
      contactId: contact.id,
      operation: 'sale',
      propertyTypes: ['Apartment', 'Penthouse'],
      priceMax: 650000,
      areaMin: 80,
      bedroomsMin: 2,
      desiredZones: [{ label: 'Chamberí', district: 'Chamberí' }],
      importances: { terrace: 'required', elevator: 'preferred' },
      features: { terrace: true, elevator: true },
    })

    const [reloaded] = await db.select().from(schema.buyerRequirements).where(eq(schema.buyerRequirements.id, req.id))
    expect(reloaded.operation).toBe('sale')
    expect(JSON.parse(reloaded.propertyTypesJson)).toEqual(['Apartment', 'Penthouse'])
    expect(reloaded.priceMax).toBe(650000)

    const criteria = await db.select().from(schema.buyerRequirementCriteria).where(eq(schema.buyerRequirementCriteria.buyerRequirementId, req.id))
    const terrace = criteria.find((c: any) => c.criterionType === 'terrace')
    expect(terrace?.importance).toBe('required')
  })

  it('la misma María puede tener dos necesidades independientes (test §128)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'MatchMultiReq')
    const contact = await seedContact(db, fixture.orgId, 'María López')
    const { createBuyerRequirement, listBuyerRequirements } = await import('../../server/utils/buyerRequirements/service')

    await createBuyerRequirement(ev(db), fixture.orgId, { contactId: contact.id, title: 'Vivienda habitual', operation: 'sale' })
    await createBuyerRequirement(ev(db), fixture.orgId, { contactId: contact.id, title: 'Inversión', operation: 'rent' })

    const all = await listBuyerRequirements(ev(db), fixture.orgId, { contactId: contact.id })
    expect(all).toHaveLength(2)
    expect(all.map((r: any) => r.title).sort()).toEqual(['Inversión', 'Vivienda habitual'])
  })

  it('bidireccional y reproducible sobre agent_properties (2ª mano): Requirement → Properties y Property → Requirements coinciden', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'MatchAgent')
    const contact = await seedContact(db, fixture.orgId, 'María López')
    const { createBuyerRequirement } = await import('../../server/utils/buyerRequirements/service')
    const { findPropertiesForRequirement, findRequirementsForProperty } = await import('../../server/utils/matching/service')

    const req = await createBuyerRequirement(ev(db), fixture.orgId, {
      contactId: contact.id,
      operation: 'sale',
      priceMax: 650000,
      bedroomsMin: 2,
      areaMin: 80,
      desiredZones: [{ district: 'Chamberí' }],
      importances: { terrace: 'required' },
      features: { terrace: true },
    })

    await db
      .update(schema.agentProperties)
      .set({ transactionType: 'sale', price: 600000, bedrooms: 2, area: 78, district: 'Chamberí', hasTerrace: 1, hasElevator: 0, featuresReviewedAt: ts })
      .where(eq(schema.agentProperties.id, fixture.propertyId))

    const forReq = await findPropertiesForRequirement(ev(db), fixture.orgId, req.id)
    expect(forReq).not.toBeNull()
    const match = forReq!.results.find((r) => r.property.id === fixture.propertyId && r.propertyKind === 'agent')
    expect(match, 'la propiedad de 2ª mano debe aparecer en Requirement → Properties').toBeTruthy()
    expect(match!.result.eligibility).toBe('eligible')
    const firstScore = match!.result.score

    const forProp = await findRequirementsForProperty(ev(db), fixture.orgId, fixture.propertyId, 'agent')
    expect(forProp).not.toBeNull()
    const reverse = forProp!.results.find((r) => r.requirement.id === req.id)
    expect(reverse, 'la necesidad debe aparecer en Property → Buyers').toBeTruthy()

    // Mismos datos → mismo score en las dos direcciones: es el mismo motor.
    expect(reverse!.result.score).toBe(firstScore)

    // Determinismo: repetir la consulta da exactamente el mismo resultado.
    const again = await findPropertiesForRequirement(ev(db), fixture.orgId, req.id)
    const matchAgain = again!.results.find((r) => r.property.id === fixture.propertyId)
    expect(matchAgain!.result.score).toBe(firstScore)
  })

  it('la misma necesidad también encuentra developer_properties (obra nueva) — el hueco que corrige esta fase', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'MatchDeveloper')
    const contact = await seedContact(db, fixture.orgId, 'Marcus Lindqvist')
    const { createBuyerRequirement } = await import('../../server/utils/buyerRequirements/service')
    const { findPropertiesForRequirement, findRequirementsForProperty } = await import('../../server/utils/matching/service')

    const req = await createBuyerRequirement(ev(db), fixture.orgId, {
      contactId: contact.id,
      operation: 'sale',
      priceMax: 700000,
      bedroomsMin: 2,
    })

    await db
      .update(schema.developerProperties)
      .set({ transactionType: 'sale', price: 650000, bedrooms: 3, area: 100 })
      .where(eq(schema.developerProperties.id, fixture.projectId))

    const forReq = await findPropertiesForRequirement(ev(db), fixture.orgId, req.id)
    const devMatch = forReq!.results.find((r) => r.property.id === fixture.projectId && r.propertyKind === 'developer')
    expect(devMatch, 'antes de esta fase developer_properties era invisible para el motor').toBeTruthy()
    expect(devMatch!.result.eligibility).toBe('eligible')

    const forProp = await findRequirementsForProperty(ev(db), fixture.orgId, fixture.projectId, 'developer')
    expect(forProp!.results.some((r) => r.requirement.id === req.id)).toBe(true)
  })

  it('un imprescindible incumplido descarta, y persistir el match usa developer_property_matches para obra nueva (test §130 + §44)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'MatchRequiredFail')
    const contact = await seedContact(db, fixture.orgId, 'Comprador Exigente')
    const { createBuyerRequirement } = await import('../../server/utils/buyerRequirements/service')
    const { findPropertiesForRequirement, setMatchStatus } = await import('../../server/utils/matching/service')

    const req = await createBuyerRequirement(ev(db), fixture.orgId, {
      contactId: contact.id,
      operation: 'sale',
      importances: { terrace: 'required' },
      features: { terrace: true },
    })

    await db
      .update(schema.developerProperties)
      .set({ transactionType: 'sale', hasTerrace: 0, featuresReviewedAt: ts })
      .where(eq(schema.developerProperties.id, fixture.projectId))

    const withIneligible = await findPropertiesForRequirement(ev(db), fixture.orgId, req.id, { includeIneligible: true })
    // id de developer_properties y agent_properties son secuencias independientes:
    // pueden coincidir entre catálogos, así que hay que filtrar también por propertyKind
    // (igual que el resto de tests de esta suite) o se puede coger la propiedad equivocada.
    const match = withIneligible!.results.find((r) => r.property.id === fixture.projectId && r.propertyKind === 'developer')
    expect(match!.result.eligibility).toBe('ineligible')

    const saved = await setMatchStatus(
      ev(db),
      fixture.orgId,
      { buyerRequirementId: req.id, propertyId: fixture.projectId, propertyKind: 'developer', status: 'discarded', discardedReason: 'Sin terraza' },
      { userId: fixture.userId },
    )

    const [persisted] = await db.select().from(schema.developerPropertyMatches).where(eq(schema.developerPropertyMatches.id, saved.id))
    expect(persisted.status).toBe('discarded')
    expect(persisted.eligibility).toBe('ineligible')
    expect(persisted.discardedReason).toBe('Sin terraza')

    // No aparece en property_matches (agent) — cada catálogo tiene su propia tabla.
    const inAgentTable = await db.select().from(schema.propertyMatches).where(eq(schema.propertyMatches.buyerRequirementId, req.id))
    expect(inAgentTable).toHaveLength(0)
  })

  it('UNKNOWN nunca se trata como FALSE (test §131)', () => {
    const result = evaluateMatch(
      { id: 1, transactionType: 'sale', hasPool: null, featuresReviewedAt: null } as any,
      { id: 1, operation: 'sale', criteria: [{ criterionType: 'pool', importance: 'preferred', valueBool: 1 }] } as any,
    )
    const pool = result.criteria.find((c) => c.key === 'pool')
    expect(pool?.outcome).toBe('unknown')
  })

  it('marca las características como repasadas sobre developer_properties, no sólo agent_properties (extiende migración 0067)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'MarkReviewedDeveloper')
    const { markFeaturesReviewed } = await import('../../server/utils/matching/service')

    const before = await db.select({ v: schema.developerProperties.featuresReviewedAt }).from(schema.developerProperties).where(eq(schema.developerProperties.id, fixture.projectId))
    expect(before[0].v).toBeNull()

    await markFeaturesReviewed(ev(db), fixture.orgId, fixture.projectId, 'developer', fixture.userId)

    const after = await db.select({ v: schema.developerProperties.featuresReviewedAt }).from(schema.developerProperties).where(eq(schema.developerProperties.id, fixture.projectId))
    expect(after[0].v).toBeTruthy()
  })

  it('aislamiento entre tenants: un match de la organización A no aparece al consultar la B', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'MatchTenantA')
    const b = await seedTenant(db, 'MatchTenantB')
    const contactA = await seedContact(db, a.orgId, 'Cliente A')
    const { createBuyerRequirement } = await import('../../server/utils/buyerRequirements/service')
    const { findRequirementsForProperty } = await import('../../server/utils/matching/service')

    await createBuyerRequirement(ev(db), a.orgId, { contactId: contactA.id, operation: 'sale' })

    // El proyecto de B nunca debe ver la necesidad de A, aunque comparta id numérico de organización distinta.
    const forB = await findRequirementsForProperty(ev(db), b.orgId, b.projectId, 'developer')
    expect(forB!.results).toHaveLength(0)
  })
})
