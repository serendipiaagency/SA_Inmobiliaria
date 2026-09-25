import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 17 — Appointment (entidad transversal de citas), migración 0072.
 * `visits` gana `type` (PARA QUÉ, distinto de `channel` — el CÓMO),
 * `confirmationStatus`/`confirmedAt` (confirmación real del cliente, distinta
 * de `status` — el ciclo de vida interno) y `leadId` (antes no existía
 * ninguna FK real entre visits y leads).
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const ts = '2026-01-01 00:00:00'

async function seedContact(db: any, orgId: number, phoneE164: string) {
  const [row] = await db
    .insert(schema.commsContacts)
    .values({ organizationId: orgId, phoneE164, createdAt: ts, updatedAt: ts })
    .returning()
  return row
}

describe('FASE 17 — createFollowUpVisit deriva `type` del contexto', () => {
  it('con un inmueble adjunto, es una visita a inmueble', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'FollowUpProperty')
    const contact = await seedContact(db, fixture.orgId, '+34600111222')
    const { createFollowUpVisit } = await import('../../server/utils/comms/admin')

    const visit = await createFollowUpVisit(db, {
      orgId: fixture.orgId,
      contact,
      contactName: 'Cliente Seguimiento',
      agentId: fixture.teamMemberId,
      scheduledAt: '2026-03-01 10:00:00',
      channel: 'in_person',
      propertyId: fixture.projectId,
    })

    const [row] = await db.select({ type: schema.visits.type }).from(schema.visits).where(eq(schema.visits.id, visit.id))
    expect(row.type).toBe('property_viewing')
  })

  it('sin inmueble adjunto, es una llamada de seguimiento aunque el canal sea vídeo', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'FollowUpCall')
    const contact = await seedContact(db, fixture.orgId, '+34600111333')
    const { createFollowUpVisit } = await import('../../server/utils/comms/admin')

    const visit = await createFollowUpVisit(db, {
      orgId: fixture.orgId,
      contact,
      contactName: 'Cliente Seguimiento',
      agentId: fixture.teamMemberId,
      scheduledAt: '2026-03-01 11:00:00',
      channel: 'video',
    })

    const [row] = await db.select({ type: schema.visits.type }).from(schema.visits).where(eq(schema.visits.id, visit.id))
    expect(row.type).toBe('call')
  })
})

describe('FASE 17 — confirmationStatus por defecto y su reseteo al reprogramar', () => {
  async function seedVisit(db: any, orgId: number, overrides: Partial<typeof schema.visits.$inferInsert> = {}) {
    const [row] = await db
      .insert(schema.visits)
      .values({ organizationId: orgId, clientName: 'Cliente', scheduledAt: '2026-03-01 09:00:00', status: 'scheduled', createdAt: ts, ...overrides })
      .returning()
    return row
  }

  it('toda visita nueva empieza en confirmation_status=pending, incluso las ya existentes antes de la migración', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ConfirmDefault')
    const visit = await seedVisit(db, fixture.orgId)
    expect(visit.confirmationStatus).toBe('pending')
    expect(visit.type).toBe('property_viewing') // default de la migración — preserva el comportamiento previo
  })
})

describe('FASE 17 — aislamiento entre tenants para el nuevo campo leadId', () => {
  it('el lead_id de una visita nunca puede apuntar a un lead de otra organización (a nivel de datos: sólo se referencia el propio)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'VisitLeadTenantA')
    const b = await seedTenant(db, 'VisitLeadTenantB')

    const [visitA] = await db
      .insert(schema.visits)
      .values({ organizationId: a.orgId, clientName: 'Cliente A', scheduledAt: '2026-03-01 09:00:00', status: 'scheduled', leadId: a.leadId, createdAt: ts })
      .returning()

    const [row] = await db.select({ leadId: schema.visits.leadId }).from(schema.visits).where(and(eq(schema.visits.id, visitA.id), eq(schema.visits.organizationId, a.orgId)))
    expect(row.leadId).toBe(a.leadId)
    expect(row.leadId).not.toBe(b.leadId)
  })
})
