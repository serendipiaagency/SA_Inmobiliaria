import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * El lead desde el panel (núcleo inmobiliario, FASES 12-16): alta manual con
 * deduplicación (unificar / crear igualmente), edición, ficha con
 * historiales, primer contacto y primera respuesta humana, reglas de
 * enrutado por oficina/equipo/horario y la primera cita — siempre dentro de
 * la organización. Base real (sqlite-proxy + migraciones reales).
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})
vi.mock('../../server/utils/audit', () => ({ logAdminAction: vi.fn() }))

const ts = '2026-01-01 00:00:00'
let seq = 0
const ev = (db: any) => ({ context: { db } }) as any
const user = (id: number) => ({ id, role: 'admin', email: 'admin@example.com' }) as any

async function office(db: any, orgId: number, name = `Oficina ${++seq}`) {
  const [row] = await db.insert(schema.offices).values({ organizationId: orgId, name, createdAt: ts, updatedAt: ts }).returning()
  return row
}
async function team(db: any, orgId: number, officeId: number | null, name = `Equipo ${++seq}`) {
  const [row] = await db.insert(schema.teams).values({ organizationId: orgId, name, officeId, createdAt: ts, updatedAt: ts }).returning()
  return row
}
async function lead(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db
    .insert(schema.leads)
    .values({ organizationId: orgId, name: `Lead ${seq}`, source: 'web', status: 'new', stage: 'new', score: 0, createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}
async function loadLead(db: any, id: number) {
  return (await db.select().from(schema.leads).where(eq(schema.leads.id, id)))[0]
}

describe('leadInputFromBody', () => {
  it('normaliza lo que llega y sólo eso', async () => {
    const { leadInputFromBody } = await import('../../server/utils/leads/admin')
    expect(leadInputFromBody({ name: '  Marta  ', email: ' MARTA@X.TEST ', source: 'portal', budget: '350000', officeId: '', priority: 'high', language: 'en' })).toEqual({
      name: 'Marta',
      email: 'marta@x.test',
      source: 'portal',
      budget: 350000,
      officeId: null,
      priority: 'high',
      language: 'en',
    })
  })

  it('rechaza valores fuera de catálogo y datos mal formados (422, nunca se ignoran)', async () => {
    const { leadInputFromBody } = await import('../../server/utils/leads/admin')
    expect(() => leadInputFromBody({ name: ' ' })).toThrow(/nombre/)
    expect(() => leadInputFromBody({ email: 'no-es-email' })).toThrow(/email/)
    expect(() => leadInputFromBody({ source: 'paloma mensajera' })).toThrow(/Origen/)
    expect(() => leadInputFromBody({ priority: 'para ayer' })).toThrow(/Prioridad/)
    expect(() => leadInputFromBody({ language: 'klingon' })).toThrow(/Idioma/)
    expect(() => leadInputFromBody({ budget: -5 })).toThrow(/presupuesto/)
    expect(() => leadInputFromBody({ officeId: 'abc' })).toThrow(/officeId/)
    expect(() => leadInputFromBody({ propertyKind: 'otro' })).toThrow(/propertyKind/)
  })
})

describe('alta manual de un lead', () => {
  it('crea el lead con su autor, enlaza o crea el contacto y lo enruta si no se eligió comercial', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'AltaA')
    const { createLeadFromAdmin } = await import('../../server/utils/leads/admin')
    const res = await createLeadFromAdmin(ev(db), a.orgId, user(a.userId), {
      name: 'Marta Ruiz',
      email: 'marta.alta@example.com',
      phone: '+34 600 111 222',
      source: 'walk_in',
      sourceDetail: 'Oficina centro',
      language: 'en',
      priority: 'high',
      originalMessage: 'Busco un ático con terraza',
      budget: 420000,
    })
    const row = await loadLead(db, res.id)
    expect(row).toMatchObject({ organizationId: a.orgId, name: 'Marta Ruiz', source: 'walk_in', language: 'en', priority: 'high', createdBy: a.userId, stage: 'new', originalMessage: 'Busco un ático con terraza' })
    expect(row.contactId).toBeTruthy()
    expect(row.convertedAt).toBeTruthy()
  })

  it('con comercial elegido no enruta: lo asigna y deja la asignación manual en el historial', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'AltaComercial')
    const { createLeadFromAdmin } = await import('../../server/utils/leads/admin')
    const res = await createLeadFromAdmin(ev(db), a.orgId, user(a.userId), { name: 'Luis', phone: '600 222 333', source: 'call', agentId: a.teamMemberId })
    const row = await loadLead(db, res.id)
    expect(row.agentId).toBe(a.teamMemberId)
    const history = await db.select().from(schema.leadAssignmentHistory).where(eq(schema.leadAssignmentHistory.leadId, res.id))
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ toCommercialId: a.teamMemberId, assignedBy: a.userId, reason: 'Asignado a mano en el alta' })
  })

  it('exige nombre, origen y algún dato de contacto; oficina, equipo, comercial o propiedad ajenos son 404', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'AltaValA')
    const b = await seedTenant(db, 'AltaValB')
    const officeB = await office(db, b.orgId)
    const { createLeadFromAdmin } = await import('../../server/utils/leads/admin')
    const create = (body: Record<string, any>) => createLeadFromAdmin(ev(db), a.orgId, user(a.userId), body)
    await expect(create({ email: 'x@example.com', source: 'web' })).rejects.toMatchObject({ statusCode: 422 })
    await expect(create({ name: 'Sin origen', email: 'x@example.com' })).rejects.toMatchObject({ statusCode: 422 })
    await expect(create({ name: 'Sin datos', source: 'web' })).rejects.toMatchObject({ statusCode: 422 })
    await expect(create({ name: 'Ajeno', email: 'o@example.com', source: 'web', officeId: officeB.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(create({ name: 'Ajeno', email: 'c@example.com', source: 'web', agentId: b.teamMemberId })).rejects.toMatchObject({ statusCode: 404 })
    await expect(create({ name: 'Ajeno', email: 'p@example.com', source: 'web', propertyId: b.propertyId, propertyKind: 'agent' })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('un equipo de otra oficina no se puede combinar con esta oficina (422)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'AltaEquipo')
    const o1 = await office(db, a.orgId)
    const o2 = await office(db, a.orgId)
    const t2 = await team(db, a.orgId, o2.id)
    const { createLeadFromAdmin } = await import('../../server/utils/leads/admin')
    await expect(createLeadFromAdmin(ev(db), a.orgId, user(a.userId), { name: 'X', email: 'eq@example.com', source: 'web', officeId: o1.id, teamId: t2.id })).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('papelera y referencias ajenas fuera del lead', () => {
  it('una propiedad de la papelera no se pone como propiedad de interés (422)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'LeadTrash')
    await db.update(schema.agentProperties).set({ deletedAt: ts }).where(eq(schema.agentProperties.id, a.propertyId))
    const { createLeadFromAdmin } = await import('../../server/utils/leads/admin')
    await expect(createLeadFromAdmin(ev(db), a.orgId, user(a.userId), { name: 'X', email: 'trash@example.com', source: 'web', propertyId: a.propertyId, propertyKind: 'agent' })).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: expect.stringMatching(/papelera/),
    })
  })

  it('los comparables de mercado sólo salen de la propia agencia', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'MarketA')
    const b = await seedTenant(db, 'MarketB')
    // Misma comunidad en las dos agencias: B no puede alimentar las cifras públicas de A.
    await db.update(schema.developerProperties).set({ community: 'Bahía' }).where(eq(schema.developerProperties.id, a.projectId))
    await db.update(schema.developerProperties).set({ community: 'Bahía', price: 900000, area: 100 }).where(eq(schema.developerProperties.id, b.projectId))
    const { getMarketStats } = await import('../../server/utils/market')
    const [project] = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, a.projectId))
    expect((await getMarketStats(db, project)).comparableCount).toBe(0)
  })

  it('un contrato no puede apuntar a la propiedad de otra agencia (404)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'ContractA')
    const b = await seedTenant(db, 'ContractB')
    const { resolveContractBindings } = await import('../../server/utils/contracts/bindings')
    await expect(resolveContractBindings(ev(db), a.orgId, { clientName: 'X', assetKind: 'property', assetId: b.projectId })).rejects.toMatchObject({ statusCode: 404 })
    await expect(resolveContractBindings(ev(db), a.orgId, { clientName: 'X', assetKind: 'otro', assetId: a.projectId })).rejects.toMatchObject({ statusCode: 422 })
    const ok = await resolveContractBindings(ev(db), a.orgId, { clientName: 'X', assetKind: 'property', assetId: a.projectId })
    expect(ok['property.name']).toBe('ContractA Tower')
  })
})

describe('deduplicación antes de crear (FASE 14)', () => {
  it('mismo email, mismo teléfono (vía contacto) o mismo id externo del mismo origen → 409 con los candidatos', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'DupA')
    const { createLeadFromAdmin } = await import('../../server/utils/leads/admin')
    const first = await createLeadFromAdmin(ev(db), a.orgId, user(a.userId), { name: 'Elena', email: 'elena@example.com', phone: '+34 611 000 111', source: 'portal', externalId: 'IDL-77' })

    const byEmail = await createLeadFromAdmin(ev(db), a.orgId, user(a.userId), { name: 'Elena G.', email: 'ELENA@example.com', source: 'call' }).catch((e) => e)
    expect(byEmail.statusCode).toBe(409)
    expect(byEmail.data.duplicates[0]).toMatchObject({ leadId: first.id, matchedOn: 'email' })

    const byPhone = await createLeadFromAdmin(ev(db), a.orgId, user(a.userId), { name: 'Elena', phone: '+34611000111', source: 'call' }).catch((e) => e)
    expect(byPhone.statusCode).toBe(409)
    expect(byPhone.data.duplicates.map((d: any) => d.leadId)).toContain(first.id)

    const byExternal = await createLeadFromAdmin(ev(db), a.orgId, user(a.userId), { name: 'Otra', email: 'otra@example.com', source: 'portal', externalId: 'IDL-77' }).catch((e) => e)
    expect(byExternal.statusCode).toBe(409)
    expect(byExternal.data.duplicates[0]).toMatchObject({ leadId: first.id, matchedOn: 'id externo' })
  })

  it('«crear igualmente» crea otro; «unificar» completa el existente sin crear nada', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'DupB')
    const { createLeadFromAdmin } = await import('../../server/utils/leads/admin')
    const first = await createLeadFromAdmin(ev(db), a.orgId, user(a.userId), { name: 'Pablo', email: 'pablo@example.com', source: 'web', notes: 'Primera nota' })

    const forced = await createLeadFromAdmin(ev(db), a.orgId, user(a.userId), { name: 'Pablo', email: 'pablo@example.com', source: 'call', force: true })
    expect(forced.id).not.toBe(first.id)

    const merged = await createLeadFromAdmin(ev(db), a.orgId, user(a.userId), { name: 'Pablo', email: 'pablo@example.com', phone: '622 333 444', source: 'call', language: 'fr', notes: 'Llamó otra vez', mergeIntoLeadId: first.id })
    expect(merged).toMatchObject({ id: first.id, merged: true })
    const row = await loadLead(db, first.id)
    expect(row).toMatchObject({ phone: '622 333 444', language: 'fr', notes: 'Primera nota\n\nLlamó otra vez' })
    // El origen no se pisa al unificar: el lead sigue siendo el que entró por la web.
    expect(row.source).toBe('web')
  })

  it('nunca encuentra duplicados en otra agencia', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'DupCrossA')
    const b = await seedTenant(db, 'DupCrossB')
    const { createLeadFromAdmin, findLeadDuplicates } = await import('../../server/utils/leads/admin')
    await createLeadFromAdmin(ev(db), b.orgId, user(b.userId), { name: 'Compartido', email: 'compartido@example.com', source: 'web' })
    expect(await findLeadDuplicates(ev(db), a.orgId, { email: 'compartido@example.com' })).toEqual([])
    // Y en A se crea sin aviso.
    const res = await createLeadFromAdmin(ev(db), a.orgId, user(a.userId), { name: 'Compartido', email: 'compartido@example.com', source: 'web' })
    expect(res.id).toBeTruthy()
  })

  it('unificar con un lead de otra agencia es 404', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'MergeA')
    const b = await seedTenant(db, 'MergeB')
    const { createLeadFromAdmin } = await import('../../server/utils/leads/admin')
    await expect(createLeadFromAdmin(ev(db), a.orgId, user(a.userId), { name: 'X', email: 'm@example.com', source: 'web', mergeIntoLeadId: b.leadId })).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('edición y ficha del lead', () => {
  it('edita los datos de captación, pero nunca el mensaje original ni el comercial; un email de otro lead es 409', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'EditA')
    const other = await lead(db, a.orgId, { email: 'ocupado@example.com' })
    const target = await lead(db, a.orgId, { email: 'mio@example.com', originalMessage: 'Original' })
    const { updateLeadFromAdmin } = await import('../../server/utils/leads/admin')

    await updateLeadFromAdmin(ev(db), a.orgId, user(a.userId), target.id, { sourceDetail: 'Feria', utmCampaign: 'otoño', originalMessage: 'Reescrito', agentId: a.teamMemberId, priority: 'urgent' })
    const row = await loadLead(db, target.id)
    expect(row).toMatchObject({ sourceDetail: 'Feria', utmCampaign: 'otoño', priority: 'urgent', originalMessage: 'Original', agentId: null })

    const dup = await updateLeadFromAdmin(ev(db), a.orgId, user(a.userId), target.id, { email: 'ocupado@example.com' }).catch((e) => e)
    expect(dup.statusCode).toBe(409)
    expect(dup.data.duplicates[0].leadId).toBe(other.id)
    // Con force, se guarda.
    await updateLeadFromAdmin(ev(db), a.orgId, user(a.userId), target.id, { email: 'ocupado@example.com', force: true })
    expect((await loadLead(db, target.id)).email).toBe('ocupado@example.com')
  })

  it('enlazar un contacto es la conversión: se fecha la primera vez', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'EditConv')
    const [c] = await db.insert(schema.contacts).values({ organizationId: a.orgId, name: 'Persona', status: 'active', createdAt: ts, updatedAt: ts }).returning()
    const target = await lead(db, a.orgId)
    const { updateLeadFromAdmin } = await import('../../server/utils/leads/admin')
    await updateLeadFromAdmin(ev(db), a.orgId, user(a.userId), target.id, { contactId: c.id })
    const row = await loadLead(db, target.id)
    expect(row.contactId).toBe(c.id)
    expect(row.convertedAt).toBeTruthy()
  })

  it('la ficha trae el historial de fases (con perdido y reactivado), el de asignaciones y los nombres; otra agencia → 404', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'FichaA')
    const b = await seedTenant(db, 'FichaB')
    const target = await lead(db, a.orgId)
    const { transitionLeadStage, setLeadOutcome } = await import('../../server/utils/leads/pipeline')
    const { reassignLead } = await import('../../server/utils/leads/routing')
    const { getLeadDetail, updateLeadFromAdmin } = await import('../../server/utils/leads/admin')
    await transitionLeadStage(ev(db), a.orgId, target.id, { toStage: 'contacted', reason: 'Llamada hecha' }, { userId: a.userId })
    await setLeadOutcome(ev(db), a.orgId, target.id, { lost: true, lostReason: 'no_response', note: 'Tres intentos' }, { userId: a.userId })
    await setLeadOutcome(ev(db), a.orgId, target.id, { lost: false }, { userId: a.userId })
    await reassignLead(ev(db), a.orgId, target.id, a.teamMemberId, { userId: a.userId, reason: 'Habla inglés' })

    const detail = await getLeadDetail(ev(db), a.orgId, target.id)
    expect(detail.stageHistory.map((h: any) => h.toStage)).toEqual(['reactivated', 'lost', 'contacted'])
    expect(detail.stageHistory[1]).toMatchObject({ fromStage: 'contacted', reason: 'No responde — Tres intentos', userName: 'FichaA Admin' })
    expect(detail.stageHistory[2]).toMatchObject({ fromStage: 'new', reason: 'Llamada hecha' })
    expect(detail.assignmentHistory[0]).toMatchObject({ toCommercialName: 'FichaA Broker', reason: 'Habla inglés', assignedByName: 'FichaA Admin' })
    // Pasar a Contactado a mano fija también el primer contacto.
    expect(detail.row.firstContactAt).toBeTruthy()
    expect(detail.row.firstResponseAt).toBeTruthy()

    await expect(getLeadDetail(ev(db), b.orgId, target.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(updateLeadFromAdmin(ev(db), b.orgId, user(b.userId), target.id, { notes: 'intruso' })).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('primer contacto y primera respuesta humana (FASE 16)', () => {
  it('se fijan una sola vez, actualizan el último contacto y cierran la alerta «sin atender»', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'SlaA')
    const target = await lead(db, a.orgId, { lastContactAt: ts })
    await db.insert(schema.leadSlaAlerts).values({ organizationId: a.orgId, leadId: target.id, type: 'unattended', status: 'open', openedAt: ts, createdAt: ts })
    const { markLeadContacted } = await import('../../server/utils/leads/sla')

    await markLeadContacted(db, a.orgId, { leadId: target.id }, { human: false, at: '2026-03-01 10:00:00' })
    let row = await loadLead(db, target.id)
    expect(row).toMatchObject({ firstContactAt: '2026-03-01 10:00:00', firstResponseAt: null, lastContactAt: '2026-03-01 10:00:00' })

    await markLeadContacted(db, a.orgId, { leadId: target.id }, { human: true, at: '2026-03-02 09:00:00' })
    await markLeadContacted(db, a.orgId, { leadId: target.id }, { human: true, at: '2026-03-05 09:00:00' })
    row = await loadLead(db, target.id)
    expect(row).toMatchObject({ firstContactAt: '2026-03-01 10:00:00', firstResponseAt: '2026-03-02 09:00:00', lastContactAt: '2026-03-05 09:00:00' })
    const [alert] = await db.select().from(schema.leadSlaAlerts).where(eq(schema.leadSlaAlerts.leadId, target.id))
    expect(alert.status).toBe('resolved')
  })

  it('por contacto marca sólo sus leads abiertos, y nunca los de otra agencia', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'SlaContA')
    const b = await seedTenant(db, 'SlaContB')
    const [c] = await db.insert(schema.contacts).values({ organizationId: a.orgId, name: 'Persona', status: 'active', createdAt: ts, updatedAt: ts }).returning()
    const open = await lead(db, a.orgId, { contactId: c.id })
    const won = await lead(db, a.orgId, { contactId: c.id, status: 'won', stage: 'won' })
    const foreign = await lead(db, b.orgId, { contactId: c.id })
    const { markLeadContacted } = await import('../../server/utils/leads/sla')
    await markLeadContacted(db, a.orgId, { contactId: c.id }, { human: true })
    expect((await loadLead(db, open.id)).firstResponseAt).toBeTruthy()
    expect((await loadLead(db, won.id)).firstResponseAt).toBeNull()
    expect((await loadLead(db, foreign.id)).firstResponseAt).toBeNull()
    // Con leadId de otra agencia no toca nada.
    await markLeadContacted(db, a.orgId, { leadId: foreign.id }, { human: true })
    expect((await loadLead(db, foreign.id)).firstContactAt).toBeNull()
  })

  it('una cita creada desde el panel fija la primera cita; un lead de otra agencia es 404', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'CitaA')
    const b = await seedTenant(db, 'CitaB')
    const target = await lead(db, a.orgId)
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const base = { clientName: 'Cliente', clientEmail: 'cliente@example.com', agentId: a.teamMemberId, scheduledAt: '2026-12-01 10:00:00' }
    await createAdminAppointment(db, a.orgId, { ...base, leadId: target.id })
    expect((await loadLead(db, target.id)).firstAppointmentAt).toBeTruthy()
    await expect(createAdminAppointment(db, a.orgId, { ...base, scheduledAt: '2026-12-02 10:00:00', leadId: b.leadId })).rejects.toMatchObject({ statusCode: 404 })
    const visits = await db.select().from(schema.visits).where(and(eq(schema.visits.organizationId, a.orgId), eq(schema.visits.leadId, b.leadId)))
    expect(visits).toHaveLength(0)
  })
})

describe('reglas de enrutado: validación (FASE 15)', () => {
  it('ámbito del catálogo, horario bien formado y oficina/equipo de la agencia', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'RuleA')
    const b = await seedTenant(db, 'RuleB')
    const teamA = await team(db, a.orgId, null)
    const teamB = await team(db, b.orgId, null)
    const officeA = await office(db, a.orgId)
    const { validateRoutingRule } = await import('../../server/utils/leads/routing')
    await expect(validateRoutingRule(db, a.orgId, { scope: 'astrología' }, null)).rejects.toMatchObject({ statusCode: 422 })
    await expect(validateRoutingRule(db, a.orgId, { scope: 'zone', scheduleJson: '{"from":"9h"}' }, null)).rejects.toMatchObject({ statusCode: 422 })
    await expect(validateRoutingRule(db, a.orgId, { scope: 'team', matchValue: String(teamB.id) }, null)).rejects.toMatchObject({ statusCode: 404 })
    await expect(validateRoutingRule(db, a.orgId, { scope: 'team' }, null)).rejects.toMatchObject({ statusCode: 422 })
    await expect(validateRoutingRule(db, a.orgId, { scope: 'team', matchValue: String(teamA.id), scheduleJson: '{"days":[1,2,3,4,5],"from":"09:00","to":"18:00","timezone":"Europe/Madrid"}' }, null)).resolves.toBeUndefined()
    await expect(validateRoutingRule(db, a.orgId, { scope: 'office' }, null)).resolves.toBeUndefined()
    await expect(validateRoutingRule(db, a.orgId, { scope: 'office', matchValue: String(officeA.id) }, null)).resolves.toBeUndefined()
    // En una edición vale el estado resultante: cambiar sólo el valor de una regla de equipo se valida igual.
    await expect(validateRoutingRule(db, a.orgId, { matchValue: String(teamB.id) }, { scope: 'team', matchValue: String(teamA.id) })).rejects.toMatchObject({ statusCode: 404 })
  })
})
