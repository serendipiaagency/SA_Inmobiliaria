import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 21 — Activity Timeline, migración 0076.
 *
 * Dos bloques: el servicio en sí (recordActivity/listActivity, sin pasar por
 * ningún endpoint) y el cableado real — que los servicios de dominio que ya
 * existían (routing, pipeline de leads, matching, buyer requirements)
 * escriban de verdad en `activities` cuando ocurre lo que dicen que ocurre,
 * no sólo que el módulo compile.
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

async function seedCommercial(db: any, orgId: number, name: string) {
  const [row] = await db
    .insert(schema.teamMembers)
    .values({ organizationId: orgId, name, slug: `activity-${name.toLowerCase()}-${orgId}`, email: `activity-${name.toLowerCase()}-${orgId}@example.com`, position: 'Comercial', createdAt: ts, updatedAt: ts })
    .returning()
  return row
}

describe('FASE 21 — recordActivity / listActivity', () => {
  it('registra y lista actividad de un contacto, más reciente primero', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ActivityHappy')
    const contact = await seedContact(db, fixture.orgId, 'Contacto Happy')
    const { recordActivity, listActivity } = await import('../../server/utils/activity/service')

    await recordActivity(db, fixture.orgId, { eventType: 'LEAD_CREATED', entityType: 'lead', entityId: 1, contactId: contact.id, actorType: 'system' })
    await recordActivity(db, fixture.orgId, { eventType: 'LEAD_QUALIFIED', entityType: 'lead', entityId: 1, contactId: contact.id, actorType: 'user', actorId: fixture.userId })

    const { rows, nextBefore } = await listActivity(db, fixture.orgId, { contactId: contact.id })
    expect(rows.map((r) => r.eventType)).toEqual(['LEAD_QUALIFIED', 'LEAD_CREATED'])
    expect(nextBefore).toBeNull()
  })

  it('pagina por cursor (before) sin repetir ni saltarse filas', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ActivityPage')
    const contact = await seedContact(db, fixture.orgId, 'Contacto Page')
    const { recordActivity, listActivity } = await import('../../server/utils/activity/service')

    for (let i = 0; i < 5; i++) {
      await recordActivity(db, fixture.orgId, { eventType: 'LEAD_QUALIFIED', entityType: 'lead', entityId: i, contactId: contact.id, actorType: 'system' })
    }

    const page1 = await listActivity(db, fixture.orgId, { contactId: contact.id }, { limit: 2 })
    expect(page1.rows).toHaveLength(2)
    expect(page1.nextBefore).toBe(page1.rows[1].id)

    const page2 = await listActivity(db, fixture.orgId, { contactId: contact.id }, { limit: 2, before: page1.nextBefore! })
    expect(page2.rows).toHaveLength(2)
    expect(page2.rows.map((r) => r.id)).not.toEqual(page1.rows.map((r) => r.id))

    const page3 = await listActivity(db, fixture.orgId, { contactId: contact.id }, { limit: 2, before: page2.nextBefore! })
    expect(page3.rows).toHaveLength(1)
    expect(page3.nextBefore).toBeNull()
  })

  it('exige al menos un filtro de entidad', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ActivityNoFilter')
    const { listActivity } = await import('../../server/utils/activity/service')

    await expect(listActivity(db, fixture.orgId, {})).rejects.toThrow()
  })

  it('aislamiento entre tenants: la actividad de un contacto de otra organización no aparece', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'ActivityTenantA')
    const b = await seedTenant(db, 'ActivityTenantB')
    const contactA = await seedContact(db, a.orgId, 'Contacto A')
    const { recordActivity, listActivity } = await import('../../server/utils/activity/service')

    await recordActivity(db, a.orgId, { eventType: 'LEAD_CREATED', entityType: 'lead', entityId: 1, contactId: contactA.id, actorType: 'system' })

    // Mismo contactId numérico no debería colar entre tenants aunque coincidiera por casualidad.
    const { rows } = await listActivity(db, b.orgId, { contactId: contactA.id })
    expect(rows).toHaveLength(0)
  })

  it('nunca lanza — un fallo real al insertar (columna NOT NULL ausente) no debe deshacer la acción que lo originó', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ActivityNeverThrows')
    const { recordActivity } = await import('../../server/utils/activity/service')

    // entityId es NOT NULL en el esquema — esto sí dispara un error real de la base, y aun así no debe propagar.
    await expect(recordActivity(db, fixture.orgId, { eventType: 'LEAD_CREATED', entityType: 'lead', entityId: null as any, actorType: 'system' })).resolves.toBeUndefined()
  })
})

describe('FASE 21 — cableado real en servicios existentes', () => {
  it('assignLead registra LEAD_ASSIGNED la primera vez y LEAD_REASSIGNED cuando cambia de comercial', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ActivityAssign')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const marco = await seedCommercial(db, fixture.orgId, 'Marco')
    const [lead] = await db.insert(schema.leads).values({ organizationId: fixture.orgId, name: 'Lead Assign', source: 'web', status: 'new', stage: 'new', score: 10, createdAt: ts, updatedAt: ts }).returning()
    const { assignLead } = await import('../../server/utils/leads/routing')
    const { listActivity } = await import('../../server/utils/activity/service')

    await assignLead(ev(db), fixture.orgId, lead.id, { commercialId: laura.id, ruleId: null, explanation: 'primera' })
    await assignLead(ev(db), fixture.orgId, lead.id, { commercialId: marco.id, ruleId: null, explanation: 'cambio' }, { assignedBy: fixture.userId })

    const { rows } = await listActivity(db, fixture.orgId, { leadId: lead.id })
    expect(rows.map((r) => r.eventType).reverse()).toEqual(['LEAD_ASSIGNED', 'LEAD_REASSIGNED'])
    expect(rows[0].actorType).toBe('user') // la reasignación manual, más reciente
    expect(rows[1].actorType).toBe('system') // el routing automático
  })

  it('transitionLeadStage registra LEAD_QUALIFIED sólo la primera vez que se alcanza qualified', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ActivityQualify')
    const [lead] = await db.insert(schema.leads).values({ organizationId: fixture.orgId, name: 'Lead Qualify', source: 'web', status: 'new', stage: 'new', score: 10, createdAt: ts, updatedAt: ts }).returning()
    const { transitionLeadStage } = await import('../../server/utils/leads/pipeline')
    const { listActivity } = await import('../../server/utils/activity/service')

    await transitionLeadStage(ev(db), fixture.orgId, lead.id, { toStage: 'contacted' }, { userId: fixture.userId })
    await transitionLeadStage(ev(db), fixture.orgId, lead.id, { toStage: 'qualifying' }, { userId: fixture.userId })
    await transitionLeadStage(ev(db), fixture.orgId, lead.id, { toStage: 'qualified' }, { userId: fixture.userId })
    // Retrocede y vuelve a qualified — no debe generar un segundo LEAD_QUALIFIED.
    await transitionLeadStage(ev(db), fixture.orgId, lead.id, { toStage: 'contacted' }, { userId: fixture.userId })
    await transitionLeadStage(ev(db), fixture.orgId, lead.id, { toStage: 'qualified' }, { userId: fixture.userId })

    const { rows } = await listActivity(db, fixture.orgId, { leadId: lead.id })
    expect(rows.filter((r) => r.eventType === 'LEAD_QUALIFIED')).toHaveLength(1)
  })

  it('createBuyerRequirement registra BUYER_REQUIREMENT_CREATED', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ActivityRequirement')
    const contact = await seedContact(db, fixture.orgId, 'Comprador Activity')
    const { createBuyerRequirement } = await import('../../server/utils/buyerRequirements/service')
    const { listActivity } = await import('../../server/utils/activity/service')

    const req = await createBuyerRequirement(ev(db), fixture.orgId, { contactId: contact.id, operation: 'sale' }, { createdBy: fixture.userId })

    const { rows } = await listActivity(db, fixture.orgId, { contactId: contact.id })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ eventType: 'BUYER_REQUIREMENT_CREATED', buyerRequirementId: req.id, actorType: 'user' })
  })

  it('setMatchStatus registra MATCH_SELECTED y MATCH_DISCARDED, nunca para el status "new"', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ActivityMatch')
    const contact = await seedContact(db, fixture.orgId, 'Comprador Match')
    const { createBuyerRequirement } = await import('../../server/utils/buyerRequirements/service')
    const { setMatchStatus } = await import('../../server/utils/matching/service')
    const { listActivity } = await import('../../server/utils/activity/service')

    const req = await createBuyerRequirement(ev(db), fixture.orgId, { contactId: contact.id, operation: 'sale' })
    await setMatchStatus(ev(db), fixture.orgId, { buyerRequirementId: req.id, propertyId: fixture.projectId, propertyKind: 'developer', status: 'selected' }, { userId: fixture.userId })
    await setMatchStatus(ev(db), fixture.orgId, { buyerRequirementId: req.id, propertyId: fixture.propertyId, propertyKind: 'agent', status: 'discarded', discardedReason: 'Precio' }, { userId: fixture.userId })

    const { rows } = await listActivity(db, fixture.orgId, { contactId: contact.id })
    // BUYER_REQUIREMENT_CREATED + MATCH_SELECTED + MATCH_DISCARDED — nunca uno por el 'new' inicial que setMatchStatus no escribe aquí.
    expect(rows.map((r) => r.eventType).sort()).toEqual(['BUYER_REQUIREMENT_CREATED', 'MATCH_DISCARDED', 'MATCH_SELECTED'])
    const discarded = rows.find((r) => r.eventType === 'MATCH_DISCARDED')!
    expect(JSON.parse(discarded.metadataJson!)).toMatchObject({ reason: 'Precio' })
  })
})
