import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 18 — Visitas multi-inmueble (Tour + TourStop), migración 0073.
 * Un Tour es sólo la cabecera (cliente, notas); cada parada sigue siendo una
 * fila real de `visits` (FASE 17), enlazada por `tourId`/`tourStopOrder` —
 * mismo principio de "un solo reloj" que ya usan citas y visitas normales.
 */

const ts = '2026-01-01 00:00:00'
let seq = 0

async function seedCommercial(db: any, orgId: number, name: string) {
  seq += 1
  const [row] = await db
    .insert(schema.teamMembers)
    .values({ organizationId: orgId, name, slug: `tour-comercial-${seq}`, email: `tour-comercial-${seq}@example.com`, position: 'Comercial', slotDurationMinutes: 60, createdAt: ts, updatedAt: ts })
    .returning()
  return row
}

describe('FASE 18 — createTour', () => {
  it('crea la cabecera y todas las paradas en orden, cada una como una visita real con type=property_viewing', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'TourHappyPath')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const { createTour } = await import('../../server/utils/appointments/tours')

    const result = await createTour(db, fixture.orgId, {
      clientName: 'Cliente Tour',
      clientEmail: 'cliente-tour@example.com',
      clientPhone: null,
      stops: [
        { propertyId: fixture.projectId, agentId: laura.id, scheduledAt: '2026-03-10 10:00:00' },
        { propertyId: null, agentId: laura.id, scheduledAt: '2026-03-10 12:00:00' },
      ],
    })

    expect(result.stopIds).toHaveLength(2)
    const stops = await db.select().from(schema.visits).where(eq(schema.visits.tourId, result.id)).orderBy(schema.visits.tourStopOrder)
    expect(stops).toHaveLength(2)
    expect(stops[0]).toMatchObject({ tourStopOrder: 0, propertyId: fixture.projectId, agentId: laura.id, status: 'scheduled', type: 'property_viewing', confirmationStatus: 'pending', clientName: 'Cliente Tour', clientEmail: 'cliente-tour@example.com' })
    expect(stops[1]).toMatchObject({ tourStopOrder: 1, propertyId: null })
    expect(stops[0].managementToken).toBeTruthy()
    expect(stops[1].managementToken).toBeTruthy()
    expect(stops[0].managementToken).not.toBe(stops[1].managementToken) // cada parada se gestiona por su propio enlace

    const [tour] = await db.select().from(schema.propertyTours).where(eq(schema.propertyTours.id, result.id))
    expect(tour.clientName).toBe('Cliente Tour')
  })

  it('propaga leadId a todas las paradas cuando el tour se pidió desde un lead conocido', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'TourLeadLink')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const { createTour } = await import('../../server/utils/appointments/tours')

    const result = await createTour(db, fixture.orgId, {
      clientName: 'Cliente Con Lead',
      clientEmail: 'con-lead@example.com',
      leadId: fixture.leadId,
      stops: [{ propertyId: null, agentId: laura.id, scheduledAt: '2026-03-11 09:00:00' }],
    })

    const [stop] = await db.select({ leadId: schema.visits.leadId }).from(schema.visits).where(eq(schema.visits.tourId, result.id))
    expect(stop.leadId).toBe(fixture.leadId)
  })

  it('rechaza un tour sin paradas, sin escribir nada', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'TourEmpty')
    const { createTour } = await import('../../server/utils/appointments/tours')

    await expect(createTour(db, fixture.orgId, { clientName: 'Sin paradas', clientEmail: 'x@example.com', stops: [] })).rejects.toThrow()
    const tours = await db.select().from(schema.propertyTours).where(eq(schema.propertyTours.organizationId, fixture.orgId))
    expect(tours).toHaveLength(0)
  })

  it('rechaza dos paradas del mismo tour que se solapan para el mismo comercial, sin crear nada', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'TourSelfClash')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const { createTour } = await import('../../server/utils/appointments/tours')

    await expect(
      createTour(db, fixture.orgId, {
        clientName: 'Choque interno',
        clientEmail: 'choque@example.com',
        stops: [
          { propertyId: null, agentId: laura.id, scheduledAt: '2026-03-12 10:00:00' },
          { propertyId: null, agentId: laura.id, scheduledAt: '2026-03-12 10:30:00' }, // dentro de la hora de la primera parada
        ],
      }),
    ).rejects.toThrow(/se solapa/)

    const tours = await db.select().from(schema.propertyTours).where(eq(schema.propertyTours.organizationId, fixture.orgId))
    expect(tours).toHaveLength(0)
  })

  it('rechaza una parada que choca con una cita ya existente de ese comercial', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'TourExistingClash')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    await db.insert(schema.visits).values({ organizationId: fixture.orgId, clientName: 'Ya agendado', agentId: laura.id, scheduledAt: '2026-03-13 10:00:00', endsAt: '2026-03-13 11:00:00', status: 'scheduled', createdAt: ts })
    const { createTour } = await import('../../server/utils/appointments/tours')

    await expect(
      createTour(db, fixture.orgId, { clientName: 'Nuevo', clientEmail: 'nuevo@example.com', stops: [{ propertyId: null, agentId: laura.id, scheduledAt: '2026-03-13 10:30:00' }] }),
    ).rejects.toThrow(/ya tiene otra cita/)
  })

  it('un comercial inexistente en el tenant rechaza esa parada por su número, no la primera que falle en silencio', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'TourBadAgent')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const { createTour } = await import('../../server/utils/appointments/tours')

    await expect(
      createTour(db, fixture.orgId, {
        clientName: 'Cliente',
        clientEmail: 'x@example.com',
        stops: [
          { propertyId: null, agentId: laura.id, scheduledAt: '2026-03-14 09:00:00' },
          { propertyId: null, agentId: 999999, scheduledAt: '2026-03-14 11:00:00' },
        ],
      }),
    ).rejects.toThrow(/Parada 2/)
  })
})

describe('FASE 18 — listTours', () => {
  it('devuelve los tours con sus paradas ordenadas, más recientes primero', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'TourList')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const { createTour, listTours } = await import('../../server/utils/appointments/tours')

    const first = await createTour(db, fixture.orgId, { clientName: 'Primero', clientEmail: 'primero@example.com', stops: [{ propertyId: null, agentId: laura.id, scheduledAt: '2026-03-15 09:00:00' }] })
    const second = await createTour(db, fixture.orgId, {
      clientName: 'Segundo',
      clientEmail: 'segundo@example.com',
      stops: [
        { propertyId: null, agentId: laura.id, scheduledAt: '2026-03-16 12:00:00' },
        { propertyId: null, agentId: laura.id, scheduledAt: '2026-03-16 09:00:00' },
      ],
    })

    const rows = await listTours(db, fixture.orgId)
    expect(rows.map((r) => r.id)).toEqual([second.id, first.id])
    expect(rows[0].stops.map((s) => s.tourStopOrder)).toEqual([0, 1]) // orden de creación, no de hora
  })

  it('aislamiento entre tenants: los tours de una organización nunca aparecen en otra', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TourTenantA')
    const b = await seedTenant(db, 'TourTenantB')
    const laura = await seedCommercial(db, a.orgId, 'Laura')
    const { createTour, listTours } = await import('../../server/utils/appointments/tours')

    await createTour(db, a.orgId, { clientName: 'De A', clientEmail: 'de-a@example.com', stops: [{ propertyId: null, agentId: laura.id, scheduledAt: '2026-03-17 09:00:00' }] })

    const toursB = await listTours(db, b.orgId)
    expect(toursB).toHaveLength(0)
  })
})
