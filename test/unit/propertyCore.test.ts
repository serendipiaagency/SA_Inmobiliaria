import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { adminResources, buildPayload } from '../../server/utils/adminResources'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Migración 0068 (Property Core, FASES 1-4 del megaprompt INMO): identificación,
 * ubicación estructurada + privacidad, superficies/distribución + PropertyRoom y
 * características por contexto, aplicadas idénticamente a developer_properties
 * (obra nueva) y agent_properties (2ª mano). Mismo criterio que
 * secondHandPropertyParity.test.ts: probar el camino real de guardado
 * (buildPayload contra el whitelist de server/utils/adminResources.ts, luego un
 * insert/update real contra el esquema migrado), no sólo que la migración aplica.
 */

const NEW_FIELDS_BODY = {
  externalSource: 'idealista',
  externalReference: 'IDX-42',
  agencyReference: 'AG-777',
  mandateType: 'exclusive',
  exclusiveFrom: '2026-01-01',
  exclusiveUntil: '2026-07-01',
  captureDate: '2025-12-15',
  captureSource: 'referral',
  locationPrivacy: 'approximate',
  locationPrivacyRadius: 300,
  usableArea: 88,
  plotArea: 200,
  terraceArea: 12,
  gardenArea: 40,
  balconyArea: 6,
  storageArea: 4,
  toilets: 1,
  livingRooms: 2,
  kitchens: 1,
  garageSpaces: 2,
  condition: 'excellent',
  furnished: 'partially',
  featuresReviewedAt: '2026-01-10',
  featuresReviewedBy: 3,
}

describe('Property Core (migración 0068) — developer-properties', () => {
  it('buildPayload + un update real persiste todos los campos nuevos de identificación/ubicación/superficies/características', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'CoreDev')
    const def = adminResources['developer-properties']

    const payload = await buildPayload(def, NEW_FIELDS_BODY, false)
    await db.update(schema.developerProperties).set(payload).where(eq(schema.developerProperties.id, fixture.projectId))

    const [row] = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, fixture.projectId))
    expect(row.externalSource).toBe('idealista')
    expect(row.agencyReference).toBe('AG-777')
    expect(row.mandateType).toBe('exclusive')
    expect(row.exclusiveFrom).toBe('2026-01-01')
    expect(row.captureDate).toBe('2025-12-15')
    expect(row.locationPrivacy).toBe('approximate')
    expect(row.locationPrivacyRadius).toBe(300)
    expect(row.usableArea).toBe(88)
    expect(row.plotArea).toBe(200)
    expect(row.terraceArea).toBe(12)
    expect(row.gardenArea).toBe(40)
    expect(row.balconyArea).toBe(6)
    expect(row.storageArea).toBe(4)
    expect(row.toilets).toBe(1)
    expect(row.livingRooms).toBe(2)
    expect(row.kitchens).toBe(1)
    expect(row.garageSpaces).toBe(2)
    expect(row.condition).toBe('excellent')
    expect(row.furnished).toBe('partially')
    expect(row.featuresReviewedAt).toBe('2026-01-10')
    expect(row.featuresReviewedBy).toBe(3)
  })

  it('genera sola una referencia "W-XXXXXX" al crear si no se manda una', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'RefDev')
    const def = adminResources['developer-properties']

    const payload = await buildPayload(def, { developerId: fixture.developerId, name: 'Torre sin referencia' }, true)
    expect(payload.reference).toMatch(/^W-[0-9A-Z]{6}$/)
  })

  it('respeta una referencia dada por el cliente en vez de generar una', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'RefDevManual')
    const def = adminResources['developer-properties']

    const payload = await buildPayload(def, { developerId: fixture.developerId, name: 'Torre con referencia', reference: 'W-CUSTOM' }, true)
    expect(payload.reference).toBe('W-CUSTOM')
  })

  it('la sentencia de backfill de la migración 0068 rellena W-<id> en filas sin referencia', async () => {
    // seedTenant() inserta con Drizzle directamente (no pasa por buildPayload),
    // así que el proyecto recién creado queda con reference=NULL — el mismo
    // estado en el que estaba cualquier fila real justo antes de que la
    // migración 0068 corriera su UPDATE de backfill. Se ejecuta esa misma
    // sentencia (no una reescrita) para probar el backfill real, no una
    // reimplementación de él.
    const { db, sqlite } = createTestDb()
    const fixture = await seedTenant(db, 'BackfillDev')
    const [before] = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, fixture.projectId))
    expect(before.reference).toBeNull()

    sqlite.exec(`UPDATE developer_properties SET reference = 'W-' || id WHERE reference IS NULL`)

    const [after] = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, fixture.projectId))
    expect(after.reference).toBe(`W-${fixture.projectId}`)
  })
})

describe('Property Core (migración 0068) — properties (2ª mano)', () => {
  it('buildPayload + un update real persiste los mismos campos nuevos que developer-properties', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'CoreAgent')
    const def = adminResources.properties

    const payload = await buildPayload(def, NEW_FIELDS_BODY, false)
    await db.update(schema.agentProperties).set(payload).where(eq(schema.agentProperties.id, fixture.propertyId))

    const [row] = await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, fixture.propertyId))
    expect(row.externalSource).toBe('idealista')
    expect(row.locationPrivacy).toBe('approximate')
    expect(row.usableArea).toBe(88)
    expect(row.toilets).toBe(1)
    expect(row.condition).toBe('excellent')
    expect(row.furnished).toBe('partially')
    expect(row.featuresReviewedAt).toBe('2026-01-10')
  })

  it('genera sola una referencia "S-XXXXXX" al crear si no se manda una', async () => {
    const { db } = createTestDb()
    await seedTenant(db, 'RefAgent')
    const def = adminResources.properties

    const payload = await buildPayload(def, { slug: 'flat-sin-referencia', location: 'City' }, true)
    expect(payload.reference).toMatch(/^S-[0-9A-Z]{6}$/)
  })

  it('la sentencia de backfill de la migración 0068 rellena S-<id> en filas sin referencia', async () => {
    const { db, sqlite } = createTestDb()
    const fixture = await seedTenant(db, 'BackfillAgent')
    const [before] = await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, fixture.propertyId))
    expect(before.reference).toBeNull()

    sqlite.exec(`UPDATE agent_properties SET reference = 'S-' || id WHERE reference IS NULL`)

    const [after] = await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, fixture.propertyId))
    expect(after.reference).toBe(`S-${fixture.propertyId}`)
  })
})

describe('Property Core (migración 0068) — PropertyRoom', () => {
  it('developer-property-rooms es un recurso hijo real con alcance de tenant, no sólo una tabla', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'RoomsDev')
    const def = adminResources['developer-property-rooms']
    expect(def, 'developer-property-rooms debe estar registrado en adminResources').toBeDefined()

    const body = { developerPropertyId: fixture.projectId, type: 'Dormitorio', name: 'Suite principal', area: 22, floor: '2', orientation: 'SE', notes: 'Con vestidor', sortOrder: 0 }
    const payload = await buildPayload(def, body, true)
    const [inserted] = await db.insert(schema.developerPropertyRooms).values(payload).returning({ id: schema.developerPropertyRooms.id })

    const [row] = await db.select().from(schema.developerPropertyRooms).where(eq(schema.developerPropertyRooms.id, inserted.id))
    expect(row.developerPropertyId).toBe(fixture.projectId)
    expect(row.type).toBe('Dormitorio')
    expect(row.name).toBe('Suite principal')
    expect(row.area).toBe(22)
    expect(row.orientation).toBe('SE')
  })

  it('agent-property-rooms es un recurso hijo real con alcance de tenant, no sólo una tabla', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'RoomsAgent')
    const def = adminResources['agent-property-rooms']
    expect(def, 'agent-property-rooms debe estar registrado en adminResources').toBeDefined()

    const body = { propertyId: fixture.propertyId, type: 'Despacho', name: 'Estudio', area: 10, sortOrder: 1 }
    const payload = await buildPayload(def, body, true)
    const [inserted] = await db.insert(schema.agentPropertyRooms).values(payload).returning({ id: schema.agentPropertyRooms.id })

    const [row] = await db.select().from(schema.agentPropertyRooms).where(eq(schema.agentPropertyRooms.id, inserted.id))
    expect(row.propertyId).toBe(fixture.propertyId)
    expect(row.type).toBe('Despacho')
    expect(row.area).toBe(10)
  })

  it('borrar el proyecto borra en cascada sus estancias (ON DELETE CASCADE)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'RoomsCascade')
    const def = adminResources['developer-property-rooms']

    const payload = await buildPayload(def, { developerPropertyId: fixture.projectId, type: 'Salón', name: 'Salón principal' }, true)
    const [inserted] = await db.insert(schema.developerPropertyRooms).values(payload).returning({ id: schema.developerPropertyRooms.id })

    await db.delete(schema.developerProperties).where(eq(schema.developerProperties.id, fixture.projectId))

    const remaining = await db.select().from(schema.developerPropertyRooms).where(eq(schema.developerPropertyRooms.id, inserted.id))
    expect(remaining).toHaveLength(0)
  })
})

describe('Property Core (migración 0068) — has*/reviewed', () => {
  it('developer_properties tiene el mismo par reviewedAt/reviewedBy que agent_properties (migración 0067) para el estado tri-valuado', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ReviewDev')

    const [row] = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, fixture.projectId))
    // Nada revisado todavía: hasPool=0 (default) y featuresReviewedAt=NULL
    // significan "sin repasar", no "sin piscina" — lo mismo que ya valía en
    // agent_properties desde la migración 0067.
    expect(row.hasPool).toBe(0)
    expect(row.featuresReviewedAt).toBeNull()

    await db
      .update(schema.developerProperties)
      .set({ hasPool: 0, featuresReviewedAt: '2026-02-01', featuresReviewedBy: fixture.userId })
      .where(eq(schema.developerProperties.id, fixture.projectId))

    const [reviewed] = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, fixture.projectId))
    expect(reviewed.hasPool).toBe(0)
    expect(reviewed.featuresReviewedAt).toBe('2026-02-01')
    expect(reviewed.featuresReviewedBy).toBe(fixture.userId)
  })
})

describe('Property Core (migración 0068) — unicidad de referencia por organización', () => {
  it('dos organizaciones distintas pueden usar la misma referencia', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'RefUniqueA')
    const b = await seedTenant(db, 'RefUniqueB')

    await db.update(schema.developerProperties).set({ reference: 'W-SAME' }).where(eq(schema.developerProperties.id, a.projectId))
    await db.update(schema.developerProperties).set({ reference: 'W-SAME' }).where(eq(schema.developerProperties.id, b.projectId))

    const rows = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.reference, 'W-SAME'))
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r: { organizationId: number }) => r.organizationId)).size).toBe(2)
  })

  it('la misma organización no puede repetir referencia (índice único)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'RefDupe')

    await db.update(schema.developerProperties).set({ reference: 'W-DUPE' }).where(eq(schema.developerProperties.id, fixture.projectId))

    await expect(
      db.insert(schema.developerProperties).values({
        organizationId: fixture.orgId,
        developerId: fixture.developerId,
        name: 'Segundo proyecto',
        slug: 'segundo-proyecto-dupe',
        reference: 'W-DUPE',
        createdAt: '2026-01-01 00:00:00',
        updatedAt: '2026-01-01 00:00:00',
      }),
    ).rejects.toThrow()
  })
})
