import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 19 — Visit Outcome, migración 0074.
 *
 * El resultado de una visita es PERCEPCIÓN del comercial, nunca un hecho:
 * vive exclusivamente en `visits` y no debe tocar jamás las características
 * reales del inmueble (`agent_properties`/`developer_properties`) ni lo que
 * el comprador dice buscar (`buyer_requirements`). El bloque de aislamiento,
 * al final, comprueba esa frontera fila a fila — no por nombre de columna
 * (una comparación por columna confundiría `visits.status` con el `status`
 * de otra tabla, el error real que ya se cometió una vez en un intento
 * anterior de esta misma prueba).
 */

const ts = '2026-01-01 00:00:00'

async function seedVisit(db: any, orgId: number, overrides: Partial<typeof schema.visits.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.visits)
    .values({ organizationId: orgId, clientName: 'Cliente', scheduledAt: '2026-03-01 10:00:00', status: 'completed', createdAt: ts, ...overrides })
    .returning()
  return row
}

describe('FASE 19 — recordVisitOutcome', () => {
  it('anota el resultado y las notas de una visita completada', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OutcomeHappy')
    const visit = await seedVisit(db, fixture.orgId)
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')

    const result = await recordVisitOutcome(db, fixture.orgId, visit.id, { outcome: 'interested', notes: 'Le encantó la cocina reformada' })
    expect(result.outcome).toBe('interested')
    expect(result.outcomeNotes).toBe('Le encantó la cocina reformada')
    expect(result.outcomeRecordedAt).toBeTruthy()

    const [row] = await db.select().from(schema.visits).where(eq(schema.visits.id, visit.id))
    expect(row.outcome).toBe('interested')
    expect(row.outcomeNotes).toBe('Le encantó la cocina reformada')
    expect(row.outcomeRecordedAt).toBeTruthy()
  })

  it('las notas son opcionales — un resultado sin nada que añadir sigue siendo útil', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OutcomeNoNotes')
    const visit = await seedVisit(db, fixture.orgId)
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')

    await recordVisitOutcome(db, fixture.orgId, visit.id, { outcome: 'not_interested' })
    const [row] = await db.select().from(schema.visits).where(eq(schema.visits.id, visit.id))
    expect(row.outcome).toBe('not_interested')
    expect(row.outcomeNotes).toBeNull()
  })

  it('rechaza un resultado que no está en la lista cerrada', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OutcomeInvalid')
    const visit = await seedVisit(db, fixture.orgId)
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')

    await expect(recordVisitOutcome(db, fixture.orgId, visit.id, { outcome: 'le_encanto_mucho' })).rejects.toThrow()
    const [row] = await db.select({ outcome: schema.visits.outcome }).from(schema.visits).where(eq(schema.visits.id, visit.id))
    expect(row.outcome).toBeNull()
  })

  it('rechaza anotar el resultado de una visita que no ha ocurrido todavía', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OutcomeNotCompleted')
    const visit = await seedVisit(db, fixture.orgId, { status: 'scheduled' })
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')

    await expect(recordVisitOutcome(db, fixture.orgId, visit.id, { outcome: 'interested' })).rejects.toThrow(/completada/)
  })

  it('rechaza el resultado de una visita cancelada o a la que no se presentó el cliente', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OutcomeCancelledNoShow')
    const cancelled = await seedVisit(db, fixture.orgId, { status: 'cancelled' })
    const noShow = await seedVisit(db, fixture.orgId, { status: 'no_show' })
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')

    await expect(recordVisitOutcome(db, fixture.orgId, cancelled.id, { outcome: 'interested' })).rejects.toThrow()
    await expect(recordVisitOutcome(db, fixture.orgId, noShow.id, { outcome: 'interested' })).rejects.toThrow()
  })

  it('corregir un resultado ya anotado lo sobrescribe limpiamente', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OutcomeOverwrite')
    const visit = await seedVisit(db, fixture.orgId)
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')

    await recordVisitOutcome(db, fixture.orgId, visit.id, { outcome: 'wants_to_think', notes: 'Duda por el precio' })
    await recordVisitOutcome(db, fixture.orgId, visit.id, { outcome: 'interested', notes: 'Al final se decidió' })

    const [row] = await db.select().from(schema.visits).where(eq(schema.visits.id, visit.id))
    expect(row.outcome).toBe('interested')
    expect(row.outcomeNotes).toBe('Al final se decidió')
  })

  it('aislamiento entre tenants: no se puede anotar el resultado de una visita de otra organización', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'OutcomeTenantA')
    const b = await seedTenant(db, 'OutcomeTenantB')
    const visitA = await seedVisit(db, a.orgId)
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')

    await expect(recordVisitOutcome(db, b.orgId, visitA.id, { outcome: 'interested' })).rejects.toThrow(/no encontrada/)
  })
})

describe('FASE 19 — el resultado de una visita nunca toca el catálogo ni las necesidades del comprador', () => {
  async function seedBuyerRequirement(db: any, orgId: number) {
    const [contact] = await db.insert(schema.contacts).values({ organizationId: orgId, name: 'Comprador', createdAt: ts, updatedAt: ts }).returning()
    const [req] = await db
      .insert(schema.buyerRequirements)
      .values({ organizationId: orgId, contactId: contact.id, title: 'Piso en el centro', createdAt: ts, updatedAt: ts })
      .returning()
    return req
  }

  /** Snapshot de fila completa (no sólo de una columna) — comparar por columna es exactamente el falso positivo que ya se dio una vez con `status`, compartido entre `visits` y otras tablas. */
  async function snapshot(db: any, orgId: number) {
    return {
      agentProperties: await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.organizationId, orgId)),
      developerProperties: await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.organizationId, orgId)),
      buyerRequirements: await db.select().from(schema.buyerRequirements).where(eq(schema.buyerRequirements.organizationId, orgId)),
    }
  }

  it('grabar varios resultados de visita, con y sin notas, deja agent_properties, developer_properties y buyer_requirements exactamente igual', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OutcomeNoLeak')
    await seedBuyerRequirement(db, fixture.orgId)
    const visit1 = await seedVisit(db, fixture.orgId, { propertyId: fixture.projectId })
    const visit2 = await seedVisit(db, fixture.orgId, { propertyId: fixture.propertyId })
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')

    const before = await snapshot(db, fixture.orgId)

    await recordVisitOutcome(db, fixture.orgId, visit1.id, { outcome: 'not_interested', notes: 'Cocina anticuada, no vuelve' })
    await recordVisitOutcome(db, fixture.orgId, visit2.id, { outcome: 'interested' })
    await recordVisitOutcome(db, fixture.orgId, visit1.id, { outcome: 'wants_to_think', notes: 'Se lo piensa, precio ajustado' }) // corrección

    const after = await snapshot(db, fixture.orgId)
    expect(after).toEqual(before)
  })
})
