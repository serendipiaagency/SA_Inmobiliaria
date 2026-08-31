import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { adminResources, buildPayload } from '../../server/utils/adminResources'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Migration 0059 gave agent_properties (2nd-hand) the same optional fields
 * developer_properties (off-plan) already had, plus a floor-plans child
 * table — see composables/usePropertyBuilderConfig.ts's `properties`
 * section list. This proves the real save path (buildPayload against the
 * server/utils/adminResources.ts whitelist, then a real insert/update
 * against the migrated schema) round-trips every new field, not just that
 * the migration applies cleanly.
 */

describe('second-hand property parity (migration 0059)', () => {
  it('buildPayload + a real update persists every new agent_properties field', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'Parity')
    const def = adminResources.properties

    const body: Record<string, any> = {
      yearBuilt: 2015,
      priceOld: 450000,
      keyHighlights: 'Vistas al mar, reformado en 2024',
      orientation: 'SE',
      energyRating: 'B',
      hasElevator: true,
      hasPool: true,
      hasGarage: false,
      hasTerrace: true,
      hasGarden: false,
      petsAllowed: true,
      accessible: false,
      isExclusive: true,
      isReserved: false,
      hasTour: true,
      rentalYield: 5.5,
      serviceChargeAnnual: 3200,
      dronePhoto: 'uploads/drone.jpg',
      nightPhoto: 'uploads/night.jpg',
      beforePhoto: 'uploads/before.jpg',
      afterPhoto: 'uploads/after.jpg',
      aiStagedPhoto: 'uploads/staged.jpg',
      paymentPlan: [{ label: 'Reserva', percentage: 10 }],
    }

    const payload = await buildPayload(def, body, false)
    await db.update(schema.agentProperties).set(payload).where(eq(schema.agentProperties.id, fixture.propertyId))

    const [row] = await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, fixture.propertyId))
    expect(row.yearBuilt).toBe(2015)
    expect(row.priceOld).toBe(450000)
    expect(row.keyHighlights).toBe(body.keyHighlights)
    expect(row.orientation).toBe('SE')
    expect(row.energyRating).toBe('B')
    // Checkbox booleans coerce to 0/1 the same way developer-properties' do (buildPayload's `Number()` coercion).
    expect(row.hasElevator).toBe(1)
    expect(row.hasPool).toBe(1)
    expect(row.hasGarage).toBe(0)
    expect(row.hasTerrace).toBe(1)
    expect(row.hasGarden).toBe(0)
    expect(row.petsAllowed).toBe(1)
    expect(row.accessible).toBe(0)
    expect(row.isExclusive).toBe(1)
    expect(row.isReserved).toBe(0)
    expect(row.hasTour).toBe(1)
    expect(row.rentalYield).toBe(5.5)
    expect(row.serviceChargeAnnual).toBe(3200)
    expect(row.dronePhoto).toBe('uploads/drone.jpg')
    expect(row.nightPhoto).toBe('uploads/night.jpg')
    expect(row.beforePhoto).toBe('uploads/before.jpg')
    expect(row.afterPhoto).toBe('uploads/after.jpg')
    expect(row.aiStagedPhoto).toBe('uploads/staged.jpg')
    expect(JSON.parse(row.paymentPlan as string)).toEqual(body.paymentPlan)
  })

  it('agent-property-floor-plans is a real tenant-scoped child resource, not just a schema table', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'Floors')
    const def = adminResources['agent-property-floor-plans']
    expect(def, 'agent-property-floor-plans must be registered in adminResources').toBeDefined()

    const body = { propertyId: fixture.propertyId, category: 'Estándar', unitType: '2 dormitorios', floorDetails: 'Planta abierta', sizes: '95 m²', type: 'piso', image: 'uploads/plano.jpg' }
    const payload = await buildPayload(def, body, true)
    const [inserted] = await db.insert(schema.agentPropertyFloorPlans).values(payload).returning({ id: schema.agentPropertyFloorPlans.id })

    const [row] = await db.select().from(schema.agentPropertyFloorPlans).where(eq(schema.agentPropertyFloorPlans.id, inserted.id))
    expect(row.propertyId).toBe(fixture.propertyId)
    expect(row.category).toBe('Estándar')
    expect(row.unitType).toBe('2 dormitorios')
    expect(row.image).toBe('uploads/plano.jpg')
  })
})
