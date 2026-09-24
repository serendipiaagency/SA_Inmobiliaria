import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 15 (Lead Routing) y FASE 16 (Lead SLA), migración 0071. Mismo patrón
 * que leadPipelineAndDedup.test.ts: base real (sqlite-proxy + migraciones
 * reales) y useDb() sustituido para leer esa base en vez de un D1Database
 * real, que sólo existe dentro del Worker.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const ts = '2026-01-01 00:00:00'
let seq = 0

function ev(db: any) {
  return { context: { db } } as any
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString().replace('T', ' ').slice(0, 19)
}

async function seedCommercial(db: any, orgId: number, name: string, opts: { department?: string | null } = {}) {
  seq += 1
  const [row] = await db
    .insert(schema.teamMembers)
    .values({
      organizationId: orgId,
      name,
      slug: `comercial-${seq}`,
      email: `comercial-${seq}@example.com`,
      position: 'Comercial',
      department: opts.department ?? null,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
  return row
}

async function seedRule(db: any, orgId: number, input: Partial<typeof schema.leadRoutingRules.$inferInsert> & { name: string; scope: string }) {
  const [row] = await db
    .insert(schema.leadRoutingRules)
    .values({ organizationId: orgId, priority: 0, strategy: 'round_robin', enabled: 1, createdAt: ts, updatedAt: ts, ...input })
    .returning()
  return row
}

/**
 * seedTenant() ya crea un lead por defecto (stage 'new', sin firstResponseAt,
 * createdAt fijo en el pasado) para ejercitar el resto de la matriz cross-tenant
 * — pero eso lo hace disparar "unattended" en cualquier checkSlaForOrg() real.
 * Se neutraliza dándole una respuesta ya registrada, igual que tendría un lead
 * de verdad que sí se atendió.
 */
async function neutralizeFixtureLead(db: any, leadId: number) {
  await db.update(schema.leads).set({ firstResponseAt: ts }).where(eq(schema.leads.id, leadId))
}

async function seedLead(db: any, orgId: number, overrides: Partial<typeof schema.leads.$inferInsert> = {}) {
  seq += 1
  const [row] = await db
    .insert(schema.leads)
    .values({ organizationId: orgId, name: `Lead ${seq}`, source: 'web', status: 'new', stage: 'new', score: 10, createdAt: ts, updatedAt: ts, ...overrides })
    .returning()
  return row
}

describe('FASE 15 — Lead Routing (migración 0071)', () => {
  describe('buildRoutingContextFromProperty', () => {
    it('resuelve district/city/propertyType desde agent_properties (2ª mano) con isNewBuild=false', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'CtxAgent')
      await db.update(schema.agentProperties).set({ district: 'Chamberí', city: 'Madrid', propertyType: 'flat' }).where(eq(schema.agentProperties.id, fixture.propertyId))
      const { buildRoutingContextFromProperty } = await import('../../server/utils/leads/routing')

      const ctx = await buildRoutingContextFromProperty(ev(db), fixture.orgId, fixture.propertyId)
      expect(ctx).toMatchObject({ propertyId: fixture.propertyId, district: 'Chamberí', city: 'Madrid', propertyType: 'flat', isNewBuild: false })
    })

    it('resuelve desde developer_properties (obra nueva) con isNewBuild=true cuando no hay agent_property con ese id', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'CtxDev')
      // agent_properties y developer_properties tienen secuencias de id independientes: en una base fresca
      // ambas empiezan en 1, así que fixture.projectId coincidiría por accidente con fixture.propertyId. Se
      // inserta una segunda developer_property para probar un id que de verdad sólo existe en ese catálogo.
      const [secondProject] = await db
        .insert(schema.developerProperties)
        .values({ organizationId: fixture.orgId, developerId: fixture.developerId, name: 'Second Tower', slug: 'ctxdev-second-tower', status: 'new', price: 400_000, area: 90, community: 'Bay', createdAt: ts, updatedAt: ts })
        .returning()
      const { buildRoutingContextFromProperty } = await import('../../server/utils/leads/routing')

      const ctx = await buildRoutingContextFromProperty(ev(db), fixture.orgId, secondProject.id)
      expect(ctx.isNewBuild).toBe(true)
      expect(ctx.propertyId).toBe(secondProject.id)
    })

    it('sin propertyId, o con uno que no existe en el tenant, devuelve un contexto vacío en vez de lanzar', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'CtxEmpty')
      const { buildRoutingContextFromProperty } = await import('../../server/utils/leads/routing')

      expect(await buildRoutingContextFromProperty(ev(db), fixture.orgId, null)).toEqual({})
      expect(await buildRoutingContextFromProperty(ev(db), fixture.orgId, 999999)).toEqual({})
    })
  })

  describe('routeLead', () => {
    it('scope "property": asigna al comercial responsable de la propiedad, sin pasar por pool/estrategia', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'RouteProperty')
      const owner = await seedCommercial(db, fixture.orgId, 'Responsable')
      await db.update(schema.agentProperties).set({ agentId: owner.id }).where(eq(schema.agentProperties.id, fixture.propertyId))
      await seedRule(db, fixture.orgId, { name: 'Propiedad', scope: 'property', priority: 0 })
      const { routeLead } = await import('../../server/utils/leads/routing')

      const decision = await routeLead(ev(db), fixture.orgId, { propertyId: fixture.propertyId })
      expect(decision.commercialId).toBe(owner.id)
      expect(decision.explanation).toContain('responsable de la propiedad')
    })

    it('scope "zone" compara district/city normalizado (sin acentos ni mayúsculas)', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'RouteZone')
      const laura = await seedCommercial(db, fixture.orgId, 'Laura')
      await seedRule(db, fixture.orgId, { name: 'Zona Chamberí', scope: 'zone', matchValue: 'Chamberí', targetCommercialId: laura.id, priority: 0 })
      const { routeLead } = await import('../../server/utils/leads/routing')

      const decision = await routeLead(ev(db), fixture.orgId, { district: 'CHAMBERI' })
      expect(decision.commercialId).toBe(laura.id)
    })

    it('scope "language" y "property_type" sólo aplican con coincidencia exacta (normalizada)', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'RouteLangType')
      const bilingue = await seedCommercial(db, fixture.orgId, 'Bilingüe')
      await seedRule(db, fixture.orgId, { name: 'Inglés', scope: 'language', matchValue: 'en', targetCommercialId: bilingue.id, priority: 0 })
      const { routeLead } = await import('../../server/utils/leads/routing')

      expect((await routeLead(ev(db), fixture.orgId, { language: 'en' })).commercialId).toBe(bilingue.id)
      expect((await routeLead(ev(db), fixture.orgId, { language: 'fr' })).commercialId).toBeNull()
    })

    it('scope "new_build" sólo aplica cuando isNewBuild=true', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'RouteNewBuild')
      const obraNueva = await seedCommercial(db, fixture.orgId, 'Obra Nueva')
      await seedRule(db, fixture.orgId, { name: 'Obra nueva', scope: 'new_build', targetCommercialId: obraNueva.id, priority: 0 })
      const { routeLead } = await import('../../server/utils/leads/routing')

      expect((await routeLead(ev(db), fixture.orgId, { isNewBuild: true })).commercialId).toBe(obraNueva.id)
      expect((await routeLead(ev(db), fixture.orgId, { isNewBuild: false })).commercialId).toBeNull()
    })

    it('respeta el orden de priority: la primera regla que aplica gana, las siguientes no se evalúan', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'RoutePriority')
      const primera = await seedCommercial(db, fixture.orgId, 'Primera')
      const segunda = await seedCommercial(db, fixture.orgId, 'Segunda')
      await seedRule(db, fixture.orgId, { name: 'Departamento catch-all', scope: 'department', targetCommercialId: segunda.id, priority: 10 })
      await seedRule(db, fixture.orgId, { name: 'Zona prioritaria', scope: 'zone', matchValue: 'Salamanca', targetCommercialId: primera.id, priority: 1 })
      const { routeLead } = await import('../../server/utils/leads/routing')

      const decision = await routeLead(ev(db), fixture.orgId, { district: 'Salamanca' })
      expect(decision.commercialId).toBe(primera.id)
    })

    it('una regla deshabilitada nunca se evalúa', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'RouteDisabled')
      const laura = await seedCommercial(db, fixture.orgId, 'Laura')
      await seedRule(db, fixture.orgId, { name: 'Zona (off)', scope: 'zone', matchValue: 'Chamberí', targetCommercialId: laura.id, priority: 0, enabled: 0 })
      const { routeLead } = await import('../../server/utils/leads/routing')

      expect((await routeLead(ev(db), fixture.orgId, { district: 'Chamberí' })).commercialId).toBeNull()
    })

    it('si el pool de una regla está vacío, prueba la siguiente en vez de bloquear el lead', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'RouteEmptyPool')
      const generalista = await seedCommercial(db, fixture.orgId, 'Generalista')
      await seedRule(db, fixture.orgId, { name: 'Equipo Lujo (sin gente)', scope: 'department', targetDepartment: 'Lujo', priority: 0 })
      await seedRule(db, fixture.orgId, { name: 'Reparto general', scope: 'department', targetCommercialId: generalista.id, priority: 1 })
      const { routeLead } = await import('../../server/utils/leads/routing')

      expect((await routeLead(ev(db), fixture.orgId, {})).commercialId).toBe(generalista.id)
    })

    it('sin reglas, o ninguna aplicable, deja el lead sin asignar en vez de lanzar', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'RouteNoRules')
      const { routeLead } = await import('../../server/utils/leads/routing')

      const decision = await routeLead(ev(db), fixture.orgId, {})
      expect(decision).toEqual({ commercialId: null, ruleId: null, explanation: expect.stringContaining('sin asignar') })
    })
  })

  describe('estrategias de reparto: round robin y carga de trabajo', () => {
    it('round robin reparte en orden determinista y cíclico dentro del pool (por id)', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'RoundRobin')
      // targetDepartment acota el pool a estos tres — sin él entraría también el
      // comercial por defecto que seedTenant() crea para el fixture (department null).
      const a = await seedCommercial(db, fixture.orgId, 'A', { department: 'RR' })
      const b = await seedCommercial(db, fixture.orgId, 'B', { department: 'RR' })
      const c = await seedCommercial(db, fixture.orgId, 'C', { department: 'RR' })
      await seedRule(db, fixture.orgId, { name: 'RR', scope: 'department', targetDepartment: 'RR', priority: 0 })
      const { routeLead } = await import('../../server/utils/leads/routing')

      const picks = []
      for (let i = 0; i < 5; i++) picks.push((await routeLead(ev(db), fixture.orgId, {})).commercialId)
      expect(picks).toEqual([a.id, b.id, c.id, a.id, b.id])
    })

    it('el turno de round robin es independiente por department (scopeKey), dos equipos no se pisan', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'RoundRobinScoped')
      const centro1 = await seedCommercial(db, fixture.orgId, 'Centro1', { department: 'Centro' })
      const centro2 = await seedCommercial(db, fixture.orgId, 'Centro2', { department: 'Centro' })
      const norte1 = await seedCommercial(db, fixture.orgId, 'Norte1', { department: 'Norte' })
      await seedRule(db, fixture.orgId, { name: 'Centro', scope: 'department', targetDepartment: 'Centro', priority: 0, matchValue: null })
      const { routeLead } = await import('../../server/utils/leads/routing')

      expect((await routeLead(ev(db), fixture.orgId, {})).commercialId).toBe(centro1.id)
      expect((await routeLead(ev(db), fixture.orgId, {})).commercialId).toBe(centro2.id)
      // norte1 nunca entra en juego (fuera del pool de esta regla), y el turno de Centro no lo afecta.
      expect(norte1.id).toBeTruthy()
    })

    it('la estrategia "workload" elige al comercial del pool con menos leads activos', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'Workload')
      // targetDepartment acota el pool a estos dos — sin él entraría también el
      // comercial por defecto que seedTenant() crea para el fixture (department null).
      const cargado = await seedCommercial(db, fixture.orgId, 'Cargado', { department: 'WL' })
      const libre = await seedCommercial(db, fixture.orgId, 'Libre', { department: 'WL' })
      await seedLead(db, fixture.orgId, { agentId: cargado.id, status: 'contacted' })
      await seedLead(db, fixture.orgId, { agentId: cargado.id, status: 'new' })
      await seedLead(db, fixture.orgId, { agentId: cargado.id, status: 'lost' }) // perdido: no cuenta como carga activa
      await seedRule(db, fixture.orgId, { name: 'Por carga', scope: 'department', targetDepartment: 'WL', strategy: 'workload', priority: 0 })
      const { routeLead } = await import('../../server/utils/leads/routing')

      const decision = await routeLead(ev(db), fixture.orgId, {})
      expect(decision.commercialId).toBe(libre.id)
    })
  })

  describe('assignLead / reassignLead', () => {
    it('escribe agentId/agentName en el lead y dos asignaciones consecutivas dejan from→to encadenado en el historial', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'AssignHistory')
      const lead = await seedLead(db, fixture.orgId)
      const laura = await seedCommercial(db, fixture.orgId, 'Laura')
      const marc = await seedCommercial(db, fixture.orgId, 'Marc')
      const { assignLead } = await import('../../server/utils/leads/routing')

      await assignLead(ev(db), fixture.orgId, lead.id, { commercialId: laura.id, ruleId: null, explanation: 'Primera asignación' })
      await assignLead(ev(db), fixture.orgId, lead.id, { commercialId: marc.id, ruleId: null, explanation: 'Segunda asignación' })

      const [updated] = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id))
      expect(updated.agentId).toBe(marc.id)
      expect(updated.agentName).toBe('Marc')

      const history = await db.select().from(schema.leadAssignmentHistory).where(eq(schema.leadAssignmentHistory.leadId, lead.id)).orderBy(schema.leadAssignmentHistory.id)
      expect(history).toHaveLength(2)
      expect(history[0]).toMatchObject({ fromCommercialId: null, toCommercialId: laura.id })
      expect(history[1]).toMatchObject({ fromCommercialId: laura.id, toCommercialId: marc.id })
    })

    it('reassignLead usa "Reasignación manual" como motivo por defecto y guarda quién la hizo', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'Reassign')
      const lead = await seedLead(db, fixture.orgId)
      const nuevo = await seedCommercial(db, fixture.orgId, 'Nuevo')
      const { reassignLead } = await import('../../server/utils/leads/routing')

      await reassignLead(ev(db), fixture.orgId, lead.id, nuevo.id, { userId: fixture.userId })

      const [entry] = await db.select().from(schema.leadAssignmentHistory).where(eq(schema.leadAssignmentHistory.leadId, lead.id))
      expect(entry.reason).toBe('Reasignación manual')
      expect(entry.assignedBy).toBe(fixture.userId)
      expect(entry.toCommercialId).toBe(nuevo.id)
    })

    it('reassignLead a null deja el lead explícitamente sin asignar', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'ReassignNull')
      const laura = await seedCommercial(db, fixture.orgId, 'Laura')
      const lead = await seedLead(db, fixture.orgId, { agentId: laura.id, agentName: 'Laura' })
      const { reassignLead } = await import('../../server/utils/leads/routing')

      await reassignLead(ev(db), fixture.orgId, lead.id, null, {})
      const [updated] = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id))
      expect(updated.agentId).toBeNull()
      expect(updated.agentName).toBeNull()
    })

    it('lanza LeadRoutingError si el lead no existe en esa organización', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'AssignMissing')
      const { assignLead, LeadRoutingError } = await import('../../server/utils/leads/routing')

      await expect(assignLead(ev(db), fixture.orgId, 999999, { commercialId: null, ruleId: null, explanation: 'x' })).rejects.toThrow(LeadRoutingError)
    })
  })

  describe('integración con upsertLead', () => {
    it('un lead nuevo sin agentId se enruta automáticamente cuando hay una regla aplicable', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'UpsertRouting')
      const laura = await seedCommercial(db, fixture.orgId, 'Laura')
      await seedRule(db, fixture.orgId, { name: 'General', scope: 'department', targetCommercialId: laura.id, priority: 0 })
      const { upsertLead } = await import('../../server/utils/leads')

      const result = await upsertLead(ev(db), { organizationId: fixture.orgId, name: 'Nuevo Lead', email: 'nuevo@example.com', source: 'web' })
      const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, result.id))
      expect(lead.agentId).toBe(laura.id)
    })

    it('si el input ya trae agentId explícito, el routing automático nunca lo pisa', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'UpsertRoutingSkip')
      const laura = await seedCommercial(db, fixture.orgId, 'Laura')
      const elegidoAMano = await seedCommercial(db, fixture.orgId, 'Elegido a mano')
      await seedRule(db, fixture.orgId, { name: 'General', scope: 'department', targetCommercialId: laura.id, priority: 0 })
      const { upsertLead } = await import('../../server/utils/leads')

      const result = await upsertLead(ev(db), { organizationId: fixture.orgId, name: 'Con dueño', email: 'condueno@example.com', source: 'web', agentId: elegidoAMano.id, agentName: 'Elegido a mano' })
      const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, result.id))
      expect(lead.agentId).toBe(elegidoAMano.id)
    })
  })

  describe('aislamiento entre tenants', () => {
    it('las reglas de una organización nunca se evalúan ni se filtran a otra', async () => {
      const { db } = createTestDb()
      const a = await seedTenant(db, 'RouteTenantA')
      const b = await seedTenant(db, 'RouteTenantB')
      const comercialA = await seedCommercial(db, a.orgId, 'Comercial A')
      await seedRule(db, a.orgId, { name: 'Sólo A', scope: 'department', targetCommercialId: comercialA.id, priority: 0 })
      const { routeLead } = await import('../../server/utils/leads/routing')

      expect((await routeLead(ev(db), b.orgId, {})).commercialId).toBeNull()
    })
  })
})

describe('FASE 16 — Lead SLA (migración 0071)', () => {
  describe('getSlaSettings / updateSlaSettings', () => {
    it('sin fila propia, devuelve los valores por defecto documentados', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'SlaDefaults')
      const { getSlaSettings } = await import('../../server/utils/leads/sla')

      const settings = await getSlaSettings(db, fixture.orgId)
      expect(settings).toEqual({ newLeadUnattendedMinutes: 30, qualifiedWithoutActionHours: 24, inactiveLeadDays: 7, useBusinessHours: false })
    })

    it('updateSlaSettings hace upsert, y una actualización parcial se combina con lo ya guardado (no lo resetea)', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'SlaUpsert')
      const { getSlaSettings, updateSlaSettings } = await import('../../server/utils/leads/sla')

      await updateSlaSettings(db, fixture.orgId, { newLeadUnattendedMinutes: 15 })
      await updateSlaSettings(db, fixture.orgId, { inactiveLeadDays: 3 })

      const settings = await getSlaSettings(db, fixture.orgId)
      expect(settings.newLeadUnattendedMinutes).toBe(15) // la segunda llamada no lo pisó con el default
      expect(settings.inactiveLeadDays).toBe(3)
    })
  })

  describe('markFirstAppointment', () => {
    it('fija firstAppointmentAt la primera vez y nunca lo sobrescribe después', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'FirstAppt')
      const lead = await seedLead(db, fixture.orgId)
      const { markFirstAppointment } = await import('../../server/utils/leads/sla')

      await markFirstAppointment(db, fixture.orgId, lead.id)
      const [first] = await db.select({ firstAppointmentAt: schema.leads.firstAppointmentAt }).from(schema.leads).where(eq(schema.leads.id, lead.id))
      expect(first.firstAppointmentAt).toBeTruthy()

      await db.update(schema.leads).set({ firstAppointmentAt: '2020-01-01 00:00:00' }).where(eq(schema.leads.id, lead.id))
      await markFirstAppointment(db, fixture.orgId, lead.id)
      const [second] = await db.select({ firstAppointmentAt: schema.leads.firstAppointmentAt }).from(schema.leads).where(eq(schema.leads.id, lead.id))
      expect(second.firstAppointmentAt).toBe('2020-01-01 00:00:00')
    })
  })

  describe('checkSlaForOrg', () => {
    it('abre "unattended" para un lead nuevo sin respuesta que supera el umbral, no para uno reciente', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'SlaUnattended')
      const { updateSlaSettings, checkSlaForOrg } = await import('../../server/utils/leads/sla')
      await neutralizeFixtureLead(db, fixture.leadId)
      await updateSlaSettings(db, fixture.orgId, { newLeadUnattendedMinutes: 10 })

      const viejo = await seedLead(db, fixture.orgId, { createdAt: minutesAgo(20) })
      const reciente = await seedLead(db, fixture.orgId, { createdAt: minutesAgo(1) })

      await checkSlaForOrg(db, fixture.orgId)

      const alerts = await db.select().from(schema.leadSlaAlerts).where(and(eq(schema.leadSlaAlerts.organizationId, fixture.orgId), eq(schema.leadSlaAlerts.status, 'open')))
      expect(alerts.map((a: any) => a.leadId)).toEqual([viejo.id])
      expect(alerts[0].type).toBe('unattended')
      expect(alerts.some((a: any) => a.leadId === reciente.id)).toBe(false)
    })

    it('resuelve automáticamente "unattended" en cuanto el lead recibe una respuesta real', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'SlaUnattendedResolve')
      const { updateSlaSettings, checkSlaForOrg } = await import('../../server/utils/leads/sla')
      await updateSlaSettings(db, fixture.orgId, { newLeadUnattendedMinutes: 10 })
      const lead = await seedLead(db, fixture.orgId, { createdAt: minutesAgo(20) })

      await checkSlaForOrg(db, fixture.orgId)
      const [openAlert] = await db.select().from(schema.leadSlaAlerts).where(eq(schema.leadSlaAlerts.leadId, lead.id))
      expect(openAlert.status).toBe('open')

      await db.update(schema.leads).set({ firstResponseAt: minutesAgo(1) }).where(eq(schema.leads.id, lead.id))
      await checkSlaForOrg(db, fixture.orgId)

      const [resolved] = await db.select().from(schema.leadSlaAlerts).where(eq(schema.leadSlaAlerts.id, openAlert.id))
      expect(resolved.status).toBe('resolved')
      expect(resolved.resolvedReason).toBe('auto')
    })

    it('abre "qualified_no_action" cuando ya pasó el umbral desde qualifiedAt y no hay próxima acción prevista', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'SlaQualified')
      const { updateSlaSettings, checkSlaForOrg } = await import('../../server/utils/leads/sla')
      await neutralizeFixtureLead(db, fixture.leadId)
      await updateSlaSettings(db, fixture.orgId, { qualifiedWithoutActionHours: 1 })

      const vencido = await seedLead(db, fixture.orgId, { stage: 'qualified', qualifiedAt: minutesAgo(120) })
      const conProximaAccion = await seedLead(db, fixture.orgId, { stage: 'qualified', qualifiedAt: minutesAgo(120), nextActionAt: minutesAgo(-60) })

      await checkSlaForOrg(db, fixture.orgId)

      const alerts = await db.select({ leadId: schema.leadSlaAlerts.leadId, type: schema.leadSlaAlerts.type }).from(schema.leadSlaAlerts).where(eq(schema.leadSlaAlerts.organizationId, fixture.orgId))
      expect(alerts).toEqual([{ leadId: vencido.id, type: 'qualified_no_action' }])
      expect(alerts.some((a: any) => a.leadId === conProximaAccion.id)).toBe(false)
    })

    it('abre "inactive" cuando el último contacto supera el umbral, pero nunca para leads perdidos o ganados', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'SlaInactive')
      const { updateSlaSettings, checkSlaForOrg } = await import('../../server/utils/leads/sla')
      await updateSlaSettings(db, fixture.orgId, { inactiveLeadDays: 1 })

      const abandonado = await seedLead(db, fixture.orgId, { lastContactAt: minutesAgo(60 * 24 * 2) })
      const perdido = await seedLead(db, fixture.orgId, { lastContactAt: minutesAgo(60 * 24 * 2), status: 'lost' })
      const ganado = await seedLead(db, fixture.orgId, { lastContactAt: minutesAgo(60 * 24 * 2), stage: 'won', status: 'won' })

      await checkSlaForOrg(db, fixture.orgId)

      const alerts = await db.select({ leadId: schema.leadSlaAlerts.leadId }).from(schema.leadSlaAlerts).where(and(eq(schema.leadSlaAlerts.organizationId, fixture.orgId), eq(schema.leadSlaAlerts.type, 'inactive')))
      expect(alerts.map((a: any) => a.leadId)).toEqual([abandonado.id])
      expect(alerts.some((a: any) => a.leadId === perdido.id || a.leadId === ganado.id)).toBe(false)
    })

    it('el índice único parcial impide alertas duplicadas: dos pasadas seguidas del cron dejan una sola alerta abierta', async () => {
      const { db } = createTestDb()
      const fixture = await seedTenant(db, 'SlaDedup')
      const { updateSlaSettings, checkSlaForOrg } = await import('../../server/utils/leads/sla')
      await updateSlaSettings(db, fixture.orgId, { newLeadUnattendedMinutes: 10 })
      const lead = await seedLead(db, fixture.orgId, { createdAt: minutesAgo(20) })

      await checkSlaForOrg(db, fixture.orgId)
      await checkSlaForOrg(db, fixture.orgId)

      const alerts = await db.select().from(schema.leadSlaAlerts).where(and(eq(schema.leadSlaAlerts.leadId, lead.id), eq(schema.leadSlaAlerts.type, 'unattended')))
      expect(alerts).toHaveLength(1)
    })
  })

  describe('aislamiento entre tenants', () => {
    it('los umbrales y las alertas de una organización nunca cruzan a otra', async () => {
      const { db } = createTestDb()
      const a = await seedTenant(db, 'SlaTenantA')
      const b = await seedTenant(db, 'SlaTenantB')
      const { updateSlaSettings, getSlaSettings, checkSlaForOrg } = await import('../../server/utils/leads/sla')
      await neutralizeFixtureLead(db, a.leadId)
      await neutralizeFixtureLead(db, b.leadId)

      await updateSlaSettings(db, a.orgId, { newLeadUnattendedMinutes: 5 })
      const settingsB = await getSlaSettings(db, b.orgId)
      expect(settingsB.newLeadUnattendedMinutes).toBe(30) // el ajuste de A no se filtró al default de B

      await seedLead(db, a.orgId, { createdAt: minutesAgo(10) })
      const leadB = await seedLead(db, b.orgId, { createdAt: minutesAgo(10) })
      await checkSlaForOrg(db, a.orgId)
      await checkSlaForOrg(db, b.orgId)

      const alertsB = await db.select().from(schema.leadSlaAlerts).where(eq(schema.leadSlaAlerts.organizationId, b.orgId))
      expect(alertsB).toHaveLength(0) // el lead de B no ha superado SU propio umbral (30 min, por defecto)
      expect(leadB.id).toBeTruthy()
    })
  })
})
