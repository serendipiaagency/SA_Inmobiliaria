import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * Cierre D3a del núcleo inmobiliario — campos transversales de FASE 0 en
 * citas, tareas, operaciones y fichas, sobre una SQLite real con las
 * migraciones reales (incluida la 0089):
 *
 *  - Notas en la ficha de la propiedad (los dos catálogos), de la cita y de
 *    la operación: el recurso `notes` valida tipo y entidad en la agencia
 *    (ajena → 404) y el listado nunca enseña las de otra.
 *  - «Creado por»: nombre del usuario de la agencia resuelto en el servidor,
 *    en lote, y «usuario eliminado» cuando ya no existe.
 *  - Papelera de citas: qué la bloquea (409 con motivo), que lo eliminado no
 *    salga en calendario, iCal, recordatorios, huecos libres, dashboard,
 *    fichas ni Domain Tools, que libere su hueco, y restaurar.
 *  - Oficina de la tarea (`tasks.office_id`): validación (404), filtro en
 *    Tareas y la misma regla en el dashboard comercial.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})
vi.mock('../../server/utils/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../../server/utils/rateLimit', () => ({ rateLimit: vi.fn(async () => undefined) }))
// Los endpoints se prueban llamando a su handler: la sesión la pone la prueba.
vi.mock('../../server/utils/auth', () => ({
  requireOrgScope: async (event: any) => ({ user: event.context.user, orgId: event.context.orgId }),
  requireSuperAdmin: async () => {
    throw createError({ statusCode: 403, statusMessage: 'Sólo super admin' })
  },
}))

// Globales que Nitro inyecta en los handlers de server/api.
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('createError', createError)
vi.stubGlobal('getQuery', (event: any) => event.context.query || {})
vi.stubGlobal('readBody', async (event: any) => event.context.body)
vi.stubGlobal('getRouterParam', (event: any, key: string) => event.context.params?.[key])
vi.stubGlobal('getRequestURL', () => new URL('https://agencia.example/api'))

// Los handlers del motor genérico arrastran medio servidor: se cargan una vez,
// aquí y con margen, para que una máquina cargada no agote los 5 s de una prueba.
beforeAll(async () => {
  await Promise.all([
    import('../../server/api/admin/[resource]/index.post'),
    import('../../server/api/admin/[resource]/index.get'),
    import('../../server/api/admin/saas/contacts/[id].get'),
    import('../../server/api/admin/saas/visits.get'),
    import('../../server/api/admin/saas/visits/[id].patch'),
    import('../../server/api/admin/saas/tasks.get'),
    import('../../server/api/admin/saas/tasks.post'),
    import('../../server/api/admin/saas/tasks/[id].patch'),
    import('../../server/utils/tools/execute'),
  ])
}, 120_000)

const ts = '2026-01-01 00:00:00'
let seq = 0
const updCtx = { userId: null, env: {} }

const adminUser = (id: number) => ({ id, role: 'admin', email: 'admin@example.com', permissions: null }) as any
const ev = (db: any, orgId: number, userId: number, extra: { body?: any; query?: any; params?: any } = {}) => ({ context: { db, orgId, user: adminUser(userId), ...extra } }) as any

async function commercial(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db
    .insert(schema.teamMembers)
    .values({ organizationId: orgId, name: `Comercial D3a ${seq}`, slug: `d3a-comercial-${seq}`, email: `d3a-comercial-${seq}@example.com`, position: 'Comercial', slotDurationMinutes: 60, createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}
async function office(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db.insert(schema.offices).values({ organizationId: orgId, name: `Oficina D3a ${seq}`, createdAt: ts, updatedAt: ts, ...over }).returning()
  return row
}
async function contact(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name: `Contacto D3a ${seq}`, email: `d3a-contacto-${seq}@example.com`, status: 'active', createdAt: ts, updatedAt: ts, ...over }).returning()
  return row
}
async function lead(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db.insert(schema.leads).values({ organizationId: orgId, name: `Lead D3a ${seq}`, email: `d3a-lead-${seq}@example.com`, source: 'web', status: 'new', stage: 'new', score: 0, createdAt: ts, updatedAt: ts, ...over }).returning()
  return row
}
async function panelUser(db: any, orgId: number | null, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db.insert(schema.users).values({ organizationId: orgId, name: `Usuaria D3a ${seq}`, email: `d3a-user-${seq}@example.com`, password: 'x', role: 'admin', createdAt: ts, updatedAt: ts, ...over }).returning()
  return row
}
async function visitRow(db: any, id: number) {
  return (await db.select().from(schema.visits).where(eq(schema.visits.id, id)))[0]
}
async function leadRow(db: any, id: number) {
  return (await db.select().from(schema.leads).where(eq(schema.leads.id, id)))[0]
}
async function activitiesOf(db: any, appointmentId: number) {
  return (await db.select().from(schema.activities).where(eq(schema.activities.appointmentId, appointmentId))).map((r: any) => r.eventType)
}
async function newDeal(db: any, t: TenantFixture, opts: { createdBy?: number | null } = {}) {
  const buyer = await contact(db, t.orgId)
  const { createOffer, submitOffer, acceptOffer } = await import('../../server/utils/offers/service')
  const offer = await createOffer(db, t.orgId, { propertyId: t.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 400_000 })
  await submitOffer(db, t.orgId, offer.id, {}, { actorType: 'user' })
  const accepted = await acceptOffer(db, t.orgId, offer.id, { actorType: 'seller' })
  const { createDeal } = await import('../../server/utils/deals/service')
  return createDeal(db, t.orgId, { acceptedOfferId: accepted.id }, { createdBy: opts.createdBy ?? null })
}
async function appointment(db: any, t: TenantFixture, over: Record<string, any> = {}) {
  const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
  return createAdminAppointment(db, t.orgId, { clientName: 'Cliente D3a', clientEmail: 'cliente-d3a@example.com', agentId: t.teamMemberId, scheduledAt: '2030-03-04 10:00', propertyId: t.projectId, propertyKind: 'developer', createdBy: t.userId, ...over } as any)
}
async function trash() {
  return import('../../server/utils/appointments/trash')
}

// ---------------------------------------------------------------------------
// 1. Notas en la ficha de la propiedad, la cita y la operación
// ---------------------------------------------------------------------------

describe('D3a · notas en propiedad (los dos catálogos), cita y operación', () => {
  async function handlers() {
    const post = (await import('../../server/api/admin/[resource]/index.post')).default as any
    const list = (await import('../../server/api/admin/[resource]/index.get')).default as any
    return { post, list }
  }

  it('se crean por el recurso genérico `notes`, rellenan su columna, llevan autor y sólo las ve su agencia', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3aNotasA')
    const b = await seedTenant(db, 'D3aNotasB')
    const deal = await newDeal(db, a)
    const { post, list } = await handlers()
    const create = (t: TenantFixture, body: any) => post(ev(db, t.orgId, t.userId, { params: { resource: 'notes' }, body }))
    const read = (t: TenantFixture, query: any) => list(ev(db, t.orgId, t.userId, { params: { resource: 'notes' }, query: { perPage: 100, ...query } }))

    const targets = [
      { entityType: 'property', entityId: a.projectId, propertyKind: 'developer', column: 'propertyId' },
      { entityType: 'property', entityId: a.propertyId, propertyKind: 'agent', column: 'propertyId' },
      { entityType: 'appointment', entityId: a.visitId, column: 'appointmentId' },
      { entityType: 'deal', entityId: deal.id, column: 'dealOperationId' },
    ] as const
    for (const target of targets) {
      const body = { entityType: target.entityType, entityId: target.entityId, propertyKind: (target as any).propertyKind ?? null, body: `Nota sobre ${target.entityType} ${target.entityId}` }
      const res = await create(a, body)
      expect(res, target.entityType).toMatchObject({ ok: true })
      const [row] = await db.select().from(schema.notes).where(eq(schema.notes.id, res.id))
      expect(row).toMatchObject({ organizationId: a.orgId, entityType: target.entityType, entityId: target.entityId, createdBy: a.userId, [target.column]: target.entityId })

      const query: Record<string, any> = { entityType: target.entityType, entityId: target.entityId }
      if ((target as any).propertyKind) query.propertyKind = (target as any).propertyKind
      const mine = await read(a, query)
      expect(mine.rows.map((r: any) => r.id)).toEqual([res.id])
      expect(mine.rows[0].authorName).toBe('D3aNotasA Admin')
      // Otra agencia que pregunta por el mismo id no ve nada (su listado va acotado a ella).
      expect((await read(b, query)).rows).toEqual([])
    }
    // Los dos catálogos no se mezclan aunque el id coincidiera: cada nota lleva su `propertyKind`.
    const agentNotes = await read(a, { entityType: 'property', entityId: a.propertyId, propertyKind: 'agent' })
    expect(agentNotes.rows.every((r: any) => r.propertyKind === 'agent')).toBe(true)
  })

  it('una propiedad, cita u operación de otra agencia (o inexistente) es 404, y un tipo desconocido 422', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3aNotasIsoA')
    const b = await seedTenant(db, 'D3aNotasIsoB')
    const foreignDeal = await newDeal(db, b)
    const { post } = await handlers()
    const create = (body: any) => post(ev(db, a.orgId, a.userId, { params: { resource: 'notes' }, body: { body: 'Intento', ...body } }))

    await expect(create({ entityType: 'property', entityId: b.projectId, propertyKind: 'developer' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(create({ entityType: 'property', entityId: b.propertyId, propertyKind: 'agent' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(create({ entityType: 'appointment', entityId: b.visitId })).rejects.toMatchObject({ statusCode: 404 })
    await expect(create({ entityType: 'deal', entityId: foreignDeal.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(create({ entityType: 'deal', entityId: 999_999 })).rejects.toMatchObject({ statusCode: 404 })
    // Una propiedad sin catálogo no se adivina.
    await expect(create({ entityType: 'property', entityId: a.projectId })).rejects.toMatchObject({ statusCode: 422 })
    await expect(create({ entityType: 'factura', entityId: 1 })).rejects.toMatchObject({ statusCode: 422 })
    expect(await db.select().from(schema.notes).where(eq(schema.notes.organizationId, a.orgId))).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Quién lo creó
// ---------------------------------------------------------------------------

describe('D3a · «Creado por»: nombre del usuario de la agencia, resuelto en el servidor', () => {
  it('withCreatorNames: usuario de la agencia, super admin, usuario borrado («usuario eliminado») y nunca el de otra agencia', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3aCreadorA')
    const b = await seedTenant(db, 'D3aCreadorB')
    const gone = await panelUser(db, a.orgId)
    await db.delete(schema.users).where(eq(schema.users.id, gone.id))
    const platform = await panelUser(db, null, { role: 'super_admin', name: 'Soporte plataforma' })
    const { withCreatorNames } = await import('../../server/utils/crm/labels')

    const rows = await withCreatorNames(db, a.orgId, [{ id: 1, createdBy: a.userId }, { id: 2, createdBy: gone.id }, { id: 3, createdBy: platform.id }, { id: 4, createdBy: b.userId }, { id: 5, createdBy: null }])
    expect(rows.map((r) => [r.id, r.createdByName, r.createdByDeleted])).toEqual([
      [1, 'D3aCreadorA Admin', false],
      [2, null, true],
      [3, 'Soporte plataforma', false],
      // El usuario de OTRA agencia nunca resuelve: no se filtra su nombre.
      [4, null, true],
      // Sin autor (reserva pública, sistema): ni nombre ni «eliminado».
      [5, null, false],
    ])
  })

  it('en lote: más de 100 autores distintos se resuelven sin pasar del límite de parámetros de D1', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3aCreadorLote')
    const users: number[] = []
    for (let i = 0; i < 130; i++) users.push((await panelUser(db, a.orgId)).id)
    const { withCreatorNames } = await import('../../server/utils/crm/labels')
    const rows = await withCreatorNames(db, a.orgId, users.map((createdBy, id) => ({ id, createdBy })))
    expect(rows.every((r) => r.createdByName && !r.createdByDeleted)).toBe(true)
  })

  it('ficha del contacto, de la cita, de la operación y fila de la tarea traen createdByName (o createdByDeleted)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3aCreadorFichas')
    const gone = await panelUser(db, a.orgId)

    // Contacto: GET /api/admin/saas/contacts/:id
    const c = await contact(db, a.orgId, { createdBy: a.userId })
    const contactHandler = (await import('../../server/api/admin/saas/contacts/[id].get')).default as any
    const contact360 = await contactHandler(ev(db, a.orgId, a.userId, { params: { id: String(c.id) } }))
    expect(contact360.contact).toMatchObject({ createdByName: 'D3aCreadorFichas Admin', createdByDeleted: false })

    // Cita: la ficha (getAppointment) y GET ?id=
    const visit = await appointment(db, a, { createdBy: gone.id })
    await db.delete(schema.users).where(eq(schema.users.id, gone.id))
    const { getAppointment } = await import('../../server/utils/appointments/query')
    expect(await getAppointment(db, a.orgId, visit.id)).toMatchObject({ createdBy: gone.id, createdByName: null, createdByDeleted: true })

    // Operación: getDealDetail
    const deal = await newDeal(db, a, { createdBy: a.userId })
    const { getDealDetail } = await import('../../server/utils/deals/service')
    expect((await getDealDetail(db, a.orgId, deal.id)).deal).toMatchObject({ createdByName: 'D3aCreadorFichas Admin', createdByDeleted: false })

    // Tarea: cada fila de GET /api/admin/saas/tasks
    const { createTask } = await import('../../server/utils/tasks/service')
    await createTask(db, a.orgId, { type: 'call', title: 'Llamar' }, { createdBy: a.userId })
    await createTask(db, a.orgId, { type: 'call', title: 'Automática' }, { createdBy: null })
    const tasksHandler = (await import('../../server/api/admin/saas/tasks.get')).default as any
    const { rows } = await tasksHandler(ev(db, a.orgId, a.userId, { query: { status: 'active' } }))
    const byTitle = Object.fromEntries(rows.map((r: any) => [r.title, r]))
    expect(byTitle.Llamar).toMatchObject({ createdByName: 'D3aCreadorFichas Admin', createdByDeleted: false })
    expect(byTitle['Automática']).toMatchObject({ createdByName: null, createdByDeleted: false })
  })
})

// ---------------------------------------------------------------------------
// 3. Papelera de citas
// ---------------------------------------------------------------------------

describe('D3a · papelera de citas: eliminar y restaurar', () => {
  it('eliminar una cita agendada: sale de la Lista, del calendario y de su ficha, libera el hueco, recalcula el lead y deja APPOINTMENT_TRASHED', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3aPapelera')
    const l = await lead(db, a.orgId)
    const visit = await appointment(db, a, { leadId: l.id })
    expect((await leadRow(db, l.id)).nextActionType).toBe('appointment:property_viewing')
    expect((await leadRow(db, l.id)).firstAppointmentAt).toBeTruthy()

    const { trashAppointment } = await trash()
    await trashAppointment(db, a.orgId, visit.id, { actorId: a.userId })

    const row = await visitRow(db, visit.id)
    expect(row.deletedAt).toBeTruthy()
    // Se guarda cancelada (para liberar el índice único del hueco), con el motivo de la papelera.
    const { APPOINTMENT_TRASH_REASON, trashedFromStatus } = await import('../../utils/appointmentCatalog')
    expect(row).toMatchObject({ status: 'cancelled', cancellationReason: APPOINTMENT_TRASH_REASON, cancelledAt: row.deletedAt })
    expect(trashedFromStatus(row)).toBe('scheduled')

    const { listAppointments, getAppointment } = await import('../../server/utils/appointments/query')
    expect((await listAppointments(db, a.orgId, {})).map((r) => r.id)).not.toContain(visit.id)
    expect((await listAppointments(db, a.orgId, { from: '2030-03-01', to: '2030-03-31' })).map((r) => r.id)).not.toContain(visit.id)
    expect(await getAppointment(db, a.orgId, visit.id)).toBeNull()
    const trashed = await listAppointments(db, a.orgId, { trashed: true })
    expect(trashed.map((r) => r.id)).toEqual([visit.id])
    expect(trashed[0]).toMatchObject({ trashedFromStatus: 'scheduled', createdByName: 'D3aPapelera Admin' })

    // Próxima acción y «primera cita» del lead: ya no hay ninguna cita.
    expect(await leadRow(db, l.id)).toMatchObject({ nextActionType: null, nextActionAt: null, firstAppointmentAt: null })
    const events = await db.select().from(schema.activities).where(and(eq(schema.activities.appointmentId, visit.id), eq(schema.activities.eventType, 'APPOINTMENT_TRASHED')))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ actorType: 'user', actorId: a.userId, leadId: l.id })
    expect(JSON.parse(events[0].metadataJson)).toMatchObject({ status: 'scheduled', scheduledAt: '2030-03-04 10:00:00' })

    // La cita correcta se puede volver a dar de alta en el MISMO hueco (índice único parcial).
    const again = await appointment(db, a, { leadId: l.id, clientName: 'Cliente correcto' })
    expect(again.id).not.toBe(visit.id)
  })

  it('nada de la papelera sale en el iCal, los recordatorios, los huecos libres, los solapes, el dashboard ni la ficha de lead u operación', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3aLecturas')
    const agent = await commercial(db, a.orgId)
    const l = await lead(db, a.orgId)
    const deal = await newDeal(db, a)
    // Red de seguridad: una fila de la papelera AGENDADA (no sólo las que trash.ts cancela).
    const [ghost] = await db
      .insert(schema.visits)
      .values({ organizationId: a.orgId, clientName: 'Fantasma', clientEmail: 'f@example.com', agentId: agent.id, agentName: agent.name, scheduledAt: '2030-06-10 10:00:00', endsAt: '2030-06-10 11:00:00', durationMinutes: 60, status: 'scheduled', type: 'property_viewing', timezone: 'UTC', leadId: l.id, dealId: deal.id, managementToken: 'tok-fantasma-d3a', deletedAt: ts, createdAt: ts })
      .returning()

    const { buildAgentIcs } = await import('../../server/utils/appointments/ical')
    expect(await buildAgentIcs(db, { id: agent.id, name: agent.name, organizationId: a.orgId }, { nowTs: '2030-06-01 00:00:00' })).not.toContain(`visit-${ghost.id}@`)

    const { dueReminderVisits } = await import('../../server/utils/appointments/reminderWindow')
    const now = new Date('2030-06-09T10:00:00Z')
    expect((await dueReminderVisits(db, 'reminder24hSentAt', now, 23.5 * 3600_000, 24.5 * 3600_000)).map((v) => v.id)).not.toContain(ghost.id)

    const { computeAvailableSlots, hasOverlappingVisit } = await import('../../server/utils/appointments/availability')
    await db.insert(schema.agentAvailability).values({ organizationId: a.orgId, agentId: agent.id, dayOfWeek: 1, startTime: '09:00', endTime: '12:00', createdAt: ts })
    const slots = await computeAvailableSlots(db, a.orgId, agent.id, '2030-06-10', 60, { nowWall: '2030-01-01 00:00:00' })
    expect(slots.map((s) => s.start)).toContain('2030-06-10 10:00:00')
    expect(await hasOverlappingVisit(db, a.orgId, agent.id, '2030-06-10 10:30:00', '2030-06-10 11:30:00')).toBe(false)

    const { getCommercialDashboard, parseDashboardScope } = await import('../../server/utils/dashboard/commercial')
    const dash = await getCommercialDashboard(db, a.orgId, parseDashboardScope({ from: '2030-06-01', to: '2030-06-30' }, Date.parse('2030-06-01T00:00:00Z')))
    expect(dash.kpis.upcomingViewings.value).toBe(0)

    const { getDealDetail } = await import('../../server/utils/deals/service')
    const detail = await getDealDetail(db, a.orgId, deal.id)
    expect(detail.appointments.map((v: any) => v.id)).not.toContain(ghost.id)
    expect(detail.nextAction).toBeNull()
    const { getLeadDetail } = await import('../../server/utils/leads/admin')
    expect((await getLeadDetail({ context: { db } } as any, a.orgId, l.id)).visits.map((v: any) => v.id)).not.toContain(ghost.id)

    const { syncLeadNextAction } = await import('../../server/utils/leads/nextAction')
    await syncLeadNextAction(db, a.orgId, l.id)
    expect((await leadRow(db, l.id)).nextActionAt).toBeNull()

    // El enlace de gestión del cliente: 404, como si no existiera.
    const publicGet = (await import('../../server/api/public/appointments/[token].get')).default as any
    await expect(publicGet({ context: { db, params: { token: 'tok-fantasma-d3a' } } })).rejects.toMatchObject({ statusCode: 404 })
    const publicCancel = (await import('../../server/api/public/appointments/[token]/cancel.post')).default as any
    await expect(publicCancel({ context: { db, params: { token: 'tok-fantasma-d3a' } } })).rejects.toMatchObject({ statusCode: 404 })

    // Domain Tools / INMO: no existe.
    const { executeTool } = await import('../../server/utils/tools/execute')
    const toolCtx = { event: { context: { db }, node: { req: { headers: {} } } } as any, db, env: {}, orgId: a.orgId, user: { id: a.userId, name: 'Admin', email: 'admin@example.com', role: 'admin', organizationId: a.orgId, permissions: null }, source: 'api' as const }
    expect(await executeTool(toolCtx as any, 'reschedule_viewing', { appointmentId: ghost.id, scheduledAt: '2030-06-11 10:00' }, { confirmed: true })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('restaurar la devuelve agendada (próxima acción y primera cita incluidas) y deja APPOINTMENT_RESTORED una sola vez', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3aRestaurar')
    const l = await lead(db, a.orgId)
    const visit = await appointment(db, a, { leadId: l.id })
    const before = await leadRow(db, l.id)
    const { trashAppointment, restoreAppointment } = await trash()
    await trashAppointment(db, a.orgId, visit.id, { actorId: a.userId })

    const restored = await restoreAppointment(db, a.orgId, visit.id, { actorId: a.userId })
    expect(restored).toMatchObject({ id: visit.id, status: 'scheduled', deletedAt: null })
    expect(await visitRow(db, visit.id)).toMatchObject({ status: 'scheduled', cancellationReason: null, cancelledAt: null, deletedAt: null })
    expect(await leadRow(db, l.id)).toMatchObject({ nextActionType: 'appointment:property_viewing', nextActionAt: '2030-03-04 10:00:00', firstAppointmentAt: visit.createdAt })
    expect(before.firstAppointmentAt).toBeTruthy()

    // Restaurar dos veces no deja dos eventos.
    await restoreAppointment(db, a.orgId, visit.id, { actorId: a.userId })
    const events = await activitiesOf(db, visit.id)
    expect(events.filter((e: string) => e === 'APPOINTMENT_TRASHED')).toHaveLength(1)
    expect(events.filter((e: string) => e === 'APPOINTMENT_RESTORED')).toHaveLength(1)
    const { listAppointments } = await import('../../server/utils/appointments/query')
    expect((await listAppointments(db, a.orgId, {})).map((r) => r.id)).toContain(visit.id)
  })

  it('restaurar una cita que ya estaba cancelada la deja cancelada con su motivo; si su hueco se ocupó, 409 y sigue en la papelera', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3aRestaurarReglas')
    const { updateAppointment } = await import('../../server/utils/appointments/update')
    const { trashAppointment, restoreAppointment } = await trash()

    const cancelled = await appointment(db, a, { scheduledAt: '2030-04-01 09:00' })
    await updateAppointment(db, a.orgId, cancelled.id, { status: 'cancelled', cancellationReason: 'El cliente no puede asistir' }, updCtx)
    await trashAppointment(db, a.orgId, cancelled.id)
    expect(await visitRow(db, cancelled.id)).toMatchObject({ status: 'cancelled', cancellationReason: 'El cliente no puede asistir' })
    await restoreAppointment(db, a.orgId, cancelled.id)
    expect(await visitRow(db, cancelled.id)).toMatchObject({ status: 'cancelled', cancellationReason: 'El cliente no puede asistir', deletedAt: null })

    const wrong = await appointment(db, a, { scheduledAt: '2030-04-02 09:00' })
    await trashAppointment(db, a.orgId, wrong.id)
    const right = await appointment(db, a, { scheduledAt: '2030-04-02 09:00', clientName: 'La buena' })
    await expect(restoreAppointment(db, a.orgId, wrong.id)).rejects.toMatchObject({ statusCode: 409 })
    expect((await visitRow(db, wrong.id)).deletedAt).toBeTruthy()
    expect((await visitRow(db, right.id)).status).toBe('scheduled')
  })

  it('qué la bloquea (409 con motivo, y no se toca nada): parada de tour, realizada, con resultado, no presentado, confirmada por el cliente, avisada al cliente y con ofertas', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3aBloqueos')
    const { updateAppointment } = await import('../../server/utils/appointments/update')
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')
    const { trashAppointment } = await trash()
    let hour = 8
    const next = (over: Record<string, any> = {}) => appointment(db, a, { scheduledAt: `2030-05-06 ${String(++hour).padStart(2, '0')}:00`, ...over })
    const blocked = async (id: number, pattern: RegExp) => {
      const err = await trashAppointment(db, a.orgId, id).catch((e) => e)
      expect(err, String(pattern)).toMatchObject({ statusCode: 409 })
      expect(err.statusMessage).toMatch(pattern)
      expect((await visitRow(db, id)).deletedAt).toBeNull()
    }

    const [tour] = await db.insert(schema.propertyTours).values({ organizationId: a.orgId, clientName: 'Cliente tour', createdAt: ts }).returning()
    const stop = await next()
    await db.update(schema.visits).set({ tourId: tour.id, tourStopOrder: 0 }).where(eq(schema.visits.id, stop.id))
    await blocked(stop.id, /tour/)

    const done = await next()
    await updateAppointment(db, a.orgId, done.id, { status: 'completed' }, updCtx)
    await blocked(done.id, /ya se realizó/)
    await recordVisitOutcome(db, a.orgId, done.id, { outcome: 'wants_to_think' })
    await blocked(done.id, /resultado/)

    const noShow = await next()
    await updateAppointment(db, a.orgId, noShow.id, { status: 'no_show' }, updCtx)
    await blocked(noShow.id, /no se presentó/)

    const confirmed = await next()
    await db.update(schema.visits).set({ confirmationStatus: 'confirmed' }).where(eq(schema.visits.id, confirmed.id))
    await blocked(confirmed.id, /confirmó/)

    const notified = await next()
    await db.insert(schema.appointmentNotifications).values({ organizationId: a.orgId, visitId: notified.id, type: 'confirmation', channel: 'email', recipient: 'cliente-d3a@example.com', message: 'Tu cita', delivered: 1, createdAt: ts })
    await blocked(notified.id, /aviso/)
    // Un aviso que no llegó a salir (sin proveedor) o el interno no cuentan.
    const notSent = await next()
    await db.insert(schema.appointmentNotifications).values([
      { organizationId: a.orgId, visitId: notSent.id, type: 'confirmation', channel: 'email', recipient: 'x@example.com', message: 'Tu cita', delivered: 0, createdAt: ts },
      { organizationId: a.orgId, visitId: notSent.id, type: 'confirmation', channel: 'internal', message: 'Tu cita', delivered: 1, createdAt: ts },
    ])
    await trashAppointment(db, a.orgId, notSent.id)
    expect((await visitRow(db, notSent.id)).deletedAt).toBeTruthy()

    const buyer = await contact(db, a.orgId)
    const withOffer = await next({ contactId: buyer.id })
    const { createOffer } = await import('../../server/utils/offers/service')
    const offer = await createOffer(db, a.orgId, { propertyId: a.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 450_000 })
    await blocked(withOffer.id, new RegExp(`#${offer.id}`))

    // Una cita realizada que se marcó por error: vuelve a agendada y entonces sí.
    const mistaken = await next()
    await updateAppointment(db, a.orgId, mistaken.id, { status: 'completed' }, updCtx)
    await blocked(mistaken.id, /agendada/)
    await updateAppointment(db, a.orgId, mistaken.id, { status: 'scheduled' }, updCtx)
    await trashAppointment(db, a.orgId, mistaken.id)
    expect((await visitRow(db, mistaken.id)).deletedAt).toBeTruthy()
  })

  it('aislamiento y estados: otra agencia 404 (eliminar y restaurar), dos veces 404, y una cita de la papelera no se edita ni admite resultado', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3aAisladaA')
    const b = await seedTenant(db, 'D3aAisladaB')
    const { trashAppointment, restoreAppointment } = await trash()
    await expect(trashAppointment(db, a.orgId, b.visitId)).rejects.toMatchObject({ statusCode: 404 })
    await trashAppointment(db, b.orgId, b.visitId)
    await expect(restoreAppointment(db, a.orgId, b.visitId)).rejects.toMatchObject({ statusCode: 404 })
    expect((await visitRow(db, b.visitId)).deletedAt).toBeTruthy()
    await expect(trashAppointment(db, b.orgId, b.visitId)).rejects.toMatchObject({ statusCode: 404 })

    const visit = await appointment(db, a)
    await trashAppointment(db, a.orgId, visit.id)
    const { updateAppointment } = await import('../../server/utils/appointments/update')
    await expect(updateAppointment(db, a.orgId, visit.id, { notes: 'Cambio' }, updCtx)).rejects.toMatchObject({ statusCode: 404 })
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')
    await expect(recordVisitOutcome(db, a.orgId, visit.id, { outcome: 'interested' })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('por HTTP: PATCH { deleted: true | false } y GET ?trashed=1 (con su contador) y ?id= de una eliminada (404)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3aHttp')
    const b = await seedTenant(db, 'D3aHttpB')
    const visit = await appointment(db, a)
    const patch = (await import('../../server/api/admin/saas/visits/[id].patch')).default as any
    const get = (await import('../../server/api/admin/saas/visits.get')).default as any

    const trashed = await patch(ev(db, a.orgId, a.userId, { params: { id: String(visit.id) }, body: { deleted: true } }))
    expect(trashed).toMatchObject({ ok: true, id: visit.id })
    const list = await get(ev(db, a.orgId, a.userId, { query: {} }))
    expect(list.rows.map((r: any) => r.id)).not.toContain(visit.id)
    expect(list.trashedCount).toBe(1)
    const bin = await get(ev(db, a.orgId, a.userId, { query: { trashed: '1' } }))
    expect(bin.rows.map((r: any) => r.id)).toEqual([visit.id])
    await expect(get(ev(db, a.orgId, a.userId, { query: { id: String(visit.id) } }))).rejects.toMatchObject({ statusCode: 404 })
    // La papelera de otra agencia no enseña nada de ésta.
    expect((await get(ev(db, b.orgId, b.userId, { query: { trashed: '1' } }))).rows).toEqual([])
    await expect(patch(ev(db, b.orgId, b.userId, { params: { id: String(visit.id) }, body: { deleted: false } }))).rejects.toMatchObject({ statusCode: 404 })

    const restored = await patch(ev(db, a.orgId, a.userId, { params: { id: String(visit.id) }, body: { deleted: false } }))
    expect(restored).toMatchObject({ ok: true, status: 'scheduled' })
    expect((await get(ev(db, a.orgId, a.userId, { query: { id: String(visit.id) } }))).row).toMatchObject({ id: visit.id, createdByName: 'D3aHttp Admin' })
  })

  it('el catálogo de Activity tiene etiqueta y grupo para los dos eventos nuevos', async () => {
    const { ACTIVITY_EVENT_TYPES } = await import('../../server/utils/activity/service')
    const { ACTIVITY_EVENT_LABELS, ACTIVITY_GROUPS } = await import('../../utils/pipelineCatalog')
    for (const t of ['APPOINTMENT_TRASHED', 'APPOINTMENT_RESTORED']) {
      expect(ACTIVITY_EVENT_TYPES).toContain(t)
      expect(ACTIVITY_EVENT_LABELS[t]).toBeTruthy()
      expect(ACTIVITY_GROUPS.find((g) => g.key === 'citas')?.types).toContain(t)
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Oficina de la tarea
// ---------------------------------------------------------------------------

describe('D3a · oficina de la tarea (migración 0089)', () => {
  async function setup(name: string) {
    const { db } = createTestDb()
    const a = await seedTenant(db, name)
    const b = await seedTenant(db, `${name}B`)
    const madrid = await office(db, a.orgId, { name: 'Madrid' })
    const sevilla = await office(db, a.orgId, { name: 'Sevilla' })
    const laura = await commercial(db, a.orgId, { officeId: madrid.id })
    const pablo = await commercial(db, a.orgId, { officeId: sevilla.id })
    return { db, a, b, madrid, sevilla, laura, pablo }
  }

  it('se valida en la agencia: ajena, inexistente o borrada = 404; sin oficina es la de su responsable', async () => {
    const { db, a, b, madrid, sevilla, laura } = await setup('D3aOficinaVal')
    const foreign = await office(db, b.orgId)
    const closed = await office(db, a.orgId, { deletedAt: ts })
    const { createTask, updateTask, withTaskLabels } = await import('../../server/utils/tasks/service')

    for (const officeId of [foreign.id, closed.id, 999_999]) {
      await expect(createTask(db, a.orgId, { type: 'call', title: 'X', officeId })).rejects.toMatchObject({ statusCode: 404 })
    }
    const own = await createTask(db, a.orgId, { type: 'call', title: 'Con oficina', assigneeId: laura.id, officeId: sevilla.id })
    const inherited = await createTask(db, a.orgId, { type: 'call', title: 'Sin oficina', assigneeId: laura.id })
    expect(own.officeId).toBe(sevilla.id)
    expect(inherited.officeId).toBeNull()

    const labeled = Object.fromEntries((await withTaskLabels(db, a.orgId, [own, inherited])).map((r) => [r.title, r]))
    expect(labeled['Con oficina']).toMatchObject({ effectiveOfficeId: sevilla.id, officeName: 'Sevilla', officeFromAssignee: false })
    expect(labeled['Sin oficina']).toMatchObject({ effectiveOfficeId: madrid.id, officeName: 'Madrid', officeFromAssignee: true })

    await expect(updateTask(db, a.orgId, inherited.id, { officeId: foreign.id })).rejects.toMatchObject({ statusCode: 404 })
    expect((await updateTask(db, a.orgId, inherited.id, { officeId: sevilla.id })).officeId).toBe(sevilla.id)
    expect((await updateTask(db, a.orgId, inherited.id, { officeId: null })).officeId).toBeNull()
    // Conservar una oficina que después se cerró no se vuelve a juzgar (sólo lo que cambia).
    const temp = await office(db, a.orgId)
    const kept = await createTask(db, a.orgId, { type: 'call', title: 'Oficina que cierra', officeId: temp.id })
    await db.update(schema.offices).set({ deletedAt: ts }).where(eq(schema.offices.id, temp.id))
    expect((await updateTask(db, a.orgId, kept.id, { title: 'Sigue', officeId: temp.id })).title).toBe('Sigue')
  })

  it('por HTTP: POST y PATCH aceptan officeId (mal formado 422, ajena 404) y GET filtra por la oficina efectiva', async () => {
    const { db, a, b, madrid, sevilla, laura, pablo } = await setup('D3aOficinaHttp')
    const post = (await import('../../server/api/admin/saas/tasks.post')).default as any
    const patch = (await import('../../server/api/admin/saas/tasks/[id].patch')).default as any
    const get = (await import('../../server/api/admin/saas/tasks.get')).default as any
    const create = (body: any) => post(ev(db, a.orgId, a.userId, { body: { type: 'call', ...body } }))

    await expect(create({ title: 'Mal', officeId: 'madrid' })).rejects.toMatchObject({ statusCode: 422 })
    await expect(create({ title: 'Ajena', officeId: (await office(db, b.orgId)).id })).rejects.toMatchObject({ statusCode: 404 })

    const t1 = await create({ title: 'Laura sin oficina', assigneeId: laura.id }) // Madrid (la de Laura)
    const t2 = await create({ title: 'Laura en Sevilla', assigneeId: laura.id, officeId: sevilla.id }) // Sevilla
    const t3 = await create({ title: 'Pablo en Madrid', assigneeId: pablo.id, officeId: String(madrid.id) }) // Madrid
    const t4 = await create({ title: 'Pablo sin oficina', assigneeId: pablo.id }) // Sevilla
    expect(t3.officeId).toBe(madrid.id)

    const titles = async (officeId: number) => (await get(ev(db, a.orgId, a.userId, { query: { status: 'active', officeId: String(officeId) } }))).rows.map((r: any) => r.title).sort()
    expect(await titles(madrid.id)).toEqual(['Laura sin oficina', 'Pablo en Madrid'])
    expect(await titles(sevilla.id)).toEqual(['Laura en Sevilla', 'Pablo sin oficina'])

    // Cambiarla por PATCH; '' vuelve a «la de su responsable».
    await patch(ev(db, a.orgId, a.userId, { params: { id: String(t1.id) }, body: { officeId: sevilla.id } }))
    expect(await titles(madrid.id)).toEqual(['Pablo en Madrid'])
    await patch(ev(db, a.orgId, a.userId, { params: { id: String(t1.id) }, body: { officeId: '' } }))
    expect(await titles(madrid.id)).toEqual(['Laura sin oficina', 'Pablo en Madrid'])
    await expect(patch(ev(db, a.orgId, a.userId, { params: { id: String(t4.id) }, body: { officeId: 'x' } }))).rejects.toMatchObject({ statusCode: 422 })
    expect(t2.officeId).toBe(sevilla.id)
  })

  it('dashboard comercial: las tareas vencidas de una oficina cuentan por la oficina de la tarea y, si no tiene, por la de su responsable', async () => {
    const { db, a, madrid, sevilla, laura, pablo } = await setup('D3aOficinaDash')
    const { createTask } = await import('../../server/utils/tasks/service')
    const past = '2026-01-02 09:00:00'
    await createTask(db, a.orgId, { type: 'call', title: 'Laura · sin oficina', assigneeId: laura.id, dueAt: past })
    await createTask(db, a.orgId, { type: 'call', title: 'Laura · Sevilla', assigneeId: laura.id, dueAt: past, officeId: sevilla.id })
    await createTask(db, a.orgId, { type: 'call', title: 'Pablo · Madrid', assigneeId: pablo.id, dueAt: past, officeId: madrid.id })
    await createTask(db, a.orgId, { type: 'call', title: 'Pablo · Madrid 2', assigneeId: pablo.id, dueAt: past, officeId: madrid.id })
    await createTask(db, a.orgId, { type: 'call', title: 'Pablo · sin oficina', assigneeId: pablo.id, dueAt: past })
    await createTask(db, a.orgId, { type: 'call', title: 'Pablo · Madrid sin vencer', assigneeId: pablo.id, officeId: madrid.id })

    const { getCommercialDashboard, parseDashboardScope } = await import('../../server/utils/dashboard/commercial')
    const overdue = async (officeId?: number) => (await getCommercialDashboard(db, a.orgId, parseDashboardScope({ from: '2026-01-01', to: '2026-01-31', ...(officeId ? { officeId: String(officeId) } : {}) }))).kpis.overdueTasks
    expect((await overdue()).value).toBe(5)
    // Madrid: la de Laura sin oficina + las dos de Pablo en Madrid (por su responsable serían 2: las de Laura).
    const m = await overdue(madrid.id)
    expect(m.value).toBe(3)
    expect(m.link).toBe(`/admin/tareas?bucket=overdue&officeId=${madrid.id}`)
    // Sevilla: la de Laura en Sevilla + la de Pablo sin oficina (por su responsable serían 3).
    expect((await overdue(sevilla.id)).value).toBe(2)
  })
})
