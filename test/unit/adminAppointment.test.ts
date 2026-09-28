import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 20 — Calendar, "crear desde hueco". `createAdminAppointment()` es lo
 * que usa POST /api/admin/saas/visits: una única cita real (no un tour de una
 * parada), con la misma validación que ya usa `createTour()` para cada
 * parada — comercial real, inmueble real si lo hay, solape contra la agenda
 * real — pero admitiendo también 2ª mano (`agent_properties`), que el resto
 * del sistema de citas nunca soportó.
 */

const ts = '2026-01-01 00:00:00'
let seq = 0

async function seedCommercial(db: any, orgId: number, name: string) {
  seq += 1
  const [row] = await db
    .insert(schema.teamMembers)
    .values({ organizationId: orgId, name, slug: `cal-comercial-${seq}`, email: `cal-comercial-${seq}@example.com`, position: 'Comercial', slotDurationMinutes: 60, createdAt: ts, updatedAt: ts })
    .returning()
  return row
}

describe('FASE 20 — createAdminAppointment', () => {
  it('crea una cita real con comercial e inmueble de obra nueva (developer)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'CalHappyDeveloper')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')

    const visit = await createAdminAppointment(db, fixture.orgId, {
      clientName: 'Cliente Panel',
      clientEmail: 'panel@example.com',
      agentId: laura.id,
      propertyId: fixture.projectId,
      propertyKind: 'developer',
      scheduledAt: '2026-03-10 10:00:00',
    })

    expect(visit.status).toBe('scheduled')
    expect(visit.type).toBe('property_viewing')
    expect(visit.propertyKind).toBe('developer')
    expect(visit.managementToken).toBeTruthy()
    expect(visit.endsAt).toBe('2026-03-10 11:00:00') // slotDurationMinutes = 60
  })

  it('admite un inmueble de 2ª mano (agent_properties) — algo que la reserva pública nunca soportó', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'CalHappyAgent')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')

    const visit = await createAdminAppointment(db, fixture.orgId, {
      clientName: 'Cliente 2ª mano',
      clientPhone: '600111222',
      agentId: laura.id,
      propertyId: fixture.propertyId,
      propertyKind: 'agent',
      scheduledAt: '2026-03-10 12:00:00',
    })

    expect(visit.propertyId).toBe(fixture.propertyId)
    expect(visit.propertyKind).toBe('agent')
  })

  it('rechaza sin email ni teléfono', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'CalNoContact')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')

    await expect(createAdminAppointment(db, fixture.orgId, { clientName: 'Sin contacto', agentId: laura.id, scheduledAt: '2026-03-10 09:00:00' })).rejects.toThrow(/email o teléfono/)
  })

  it('rechaza un comercial que no existe en el tenant', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'CalBadAgent')
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')

    await expect(createAdminAppointment(db, fixture.orgId, { clientName: 'X', clientEmail: 'x@example.com', agentId: 999999, scheduledAt: '2026-03-10 09:00:00' })).rejects.toThrow(/Comercial no encontrado/)
  })

  it('rechaza un inmueble que no existe en el tenant', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'CalBadProperty')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')

    await expect(
      createAdminAppointment(db, fixture.orgId, { clientName: 'X', clientEmail: 'x@example.com', agentId: laura.id, propertyId: 999999, propertyKind: 'developer', scheduledAt: '2026-03-10 09:00:00' }),
    ).rejects.toThrow(/Inmueble no encontrado/)
  })

  it('rechaza una cita que choca con otra ya existente del mismo comercial', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'CalClash')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    await db.insert(schema.visits).values({ organizationId: fixture.orgId, clientName: 'Ya agendado', agentId: laura.id, scheduledAt: '2026-03-10 10:00:00', endsAt: '2026-03-10 11:00:00', status: 'scheduled', createdAt: ts })
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')

    await expect(
      createAdminAppointment(db, fixture.orgId, { clientName: 'Nuevo', clientEmail: 'nuevo@example.com', agentId: laura.id, scheduledAt: '2026-03-10 10:30:00' }),
    ).rejects.toThrow(/ya tiene otra cita/)
  })

  it('aislamiento entre tenants: un comercial de otra agencia no se puede usar', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'CalTenantA')
    const b = await seedTenant(db, 'CalTenantB')
    const lauraA = await seedCommercial(db, a.orgId, 'Laura')
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')

    await expect(
      createAdminAppointment(db, b.orgId, { clientName: 'X', clientEmail: 'x@example.com', agentId: lauraA.id, scheduledAt: '2026-03-10 09:00:00' }),
    ).rejects.toThrow(/Comercial no encontrado/)

    const visits = await db.select().from(schema.visits).where(eq(schema.visits.organizationId, b.orgId))
    expect(visits.some((v: any) => v.clientName === 'X')).toBe(false)
  })
})
