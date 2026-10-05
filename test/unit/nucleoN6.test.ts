import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Núcleo inmobiliario, bloque N6 (FASES 21-24) sobre una SQLite real con las
 * migraciones reales: cronología de actividad (operación, filtros, «el
 * cliente abrió la ficha»), edición completa y papelera de tareas,
 * negociación de ofertas con historial íntegro (oferta, contraoferta, nueva
 * oferta, aceptada, rechazada), operaciones con oficina, Kanban por etapas e
 * historial, y el vínculo con reservas, arras y contratos — siempre dentro
 * de la organización (referencia ajena = 404).
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})
vi.mock('../../server/utils/audit', () => ({ logAdminAction: vi.fn() }))
// Los endpoints se prueban llamando a su handler: la sesión la pone la prueba.
vi.mock('../../server/utils/auth', () => ({
  requireOrgScope: async (event: any) => ({ user: event.context.user, orgId: event.context.orgId }),
}))

// Globales que Nitro inyecta en los handlers de server/api.
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('createError', createError)
vi.stubGlobal('getQuery', (event: any) => event.context.query || {})
vi.stubGlobal('readBody', async (event: any) => event.context.body)
vi.stubGlobal('getRouterParam', (event: any, key: string) => event.context.params?.[key])

const ts = '2026-01-01 00:00:00'
let seq = 0

async function contact(db: any, orgId: number, name = `Contacto ${++seq}`) {
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name, status: 'active', createdAt: ts, updatedAt: ts }).returning()
  return row
}
async function lead(db: any, orgId: number, over: Record<string, any> = {}) {
  const [row] = await db
    .insert(schema.leads)
    .values({ organizationId: orgId, name: `Lead ${++seq}`, source: 'web', status: 'active', stage: 'qualified', score: 0, createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}
async function office(db: any, orgId: number, over: Record<string, any> = {}) {
  const [row] = await db.insert(schema.offices).values({ organizationId: orgId, name: `Oficina ${++seq}`, createdAt: ts, updatedAt: ts, ...over }).returning()
  return row
}
async function visit(db: any, orgId: number, over: Record<string, any> = {}) {
  const [row] = await db
    .insert(schema.visits)
    .values({ organizationId: orgId, clientName: `Cliente ${++seq}`, scheduledAt: '2030-02-01 10:00:00', status: 'scheduled', channel: 'in_person', createdAt: ts, ...over })
    .returning()
  return row
}
async function reservation(db: any, orgId: number) {
  const [row] = await db.insert(schema.reservations).values({ organizationId: orgId, reference: `R-${++seq}`, clientName: 'Comprador', amount: 6000, reservedAt: ts, createdAt: ts }).returning()
  return row
}
async function deposit(db: any, orgId: number) {
  const [row] = await db.insert(schema.depositPayments).values({ organizationId: orgId, amount: 30000, createdAt: ts }).returning()
  return row
}
async function contract(db: any, orgId: number) {
  const [row] = await db.insert(schema.contracts).values({ organizationId: orgId, title: `Arras ${++seq}`, clientName: 'Comprador', bodyText: 'x', createdAt: ts, updatedAt: ts }).returning()
  return row
}
async function loadLead(db: any, id: number) {
  return (await db.select().from(schema.leads).where(eq(schema.leads.id, id)))[0]
}

async function acceptedOffer(db: any, orgId: number, propertyId: number, propertyKind: 'agent' | 'developer', buyerContactId: number) {
  const { createOffer, submitOffer, acceptOffer } = await import('../../server/utils/offers/service')
  const offer = await createOffer(db, orgId, { propertyId, propertyKind, buyerContactId, amount: 400_000 })
  await submitOffer(db, orgId, offer.id, {}, { actorType: 'user' })
  return acceptOffer(db, orgId, offer.id, { actorType: 'seller' })
}
async function newDeal(db: any, orgId: number, propertyId: number, propertyKind: 'agent' | 'developer' = 'developer') {
  const buyer = await contact(db, orgId)
  const offer = await acceptedOffer(db, orgId, propertyId, propertyKind, buyer.id)
  const { createDeal } = await import('../../server/utils/deals/service')
  return createDeal(db, orgId, { acceptedOfferId: offer.id }, { createdBy: null })
}

const adminUser = (id: number, permissions: string | null = null) => ({ id, role: 'admin', email: 'admin@example.com', permissions }) as any
const ev = (db: any, orgId: number, user: any, extra: { body?: any; query?: any; params?: any } = {}) => ({ context: { db, orgId, user, ...extra } }) as any

// ---------------------------------------------------------------------------
// FASE 21 — Actividad
// ---------------------------------------------------------------------------

describe('N6 · actividad', () => {
  it('cada tipo de evento tiene etiqueta en castellano y un grupo de la cronología', async () => {
    const { ACTIVITY_EVENT_TYPES } = await import('../../server/utils/activity/service')
    const { ACTIVITY_EVENT_LABELS, ACTIVITY_GROUPS } = await import('../../utils/pipelineCatalog')
    const grouped = new Set(ACTIVITY_GROUPS.flatMap((g) => g.types))
    for (const t of ACTIVITY_EVENT_TYPES) {
      expect(ACTIVITY_EVENT_LABELS[t], `falta la etiqueta de ${t}`).toBeTruthy()
      expect(grouped.has(t), `${t} no está en ningún grupo`).toBe(true)
    }
    // Los grupos no inventan tipos que el servidor no conoce.
    for (const t of grouped) expect(ACTIVITY_EVENT_TYPES as readonly string[]).toContain(t)
  })

  it('la cronología de una operación junta sus eventos, los de su oferta, sus tareas y sus citas — y nada de otra operación ni de otra agencia', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6ActDealA')
    const b = await seedTenant(db, 'N6ActDealB')
    const deal = await newDeal(db, a.orgId, a.projectId)
    const other = await newDeal(db, a.orgId, a.propertyId, 'agent')
    const { transitionDealStage } = await import('../../server/utils/deals/service')
    const { createTask } = await import('../../server/utils/tasks/service')
    const { listActivity, recordActivity } = await import('../../server/utils/activity/service')

    await transitionDealStage(db, a.orgId, deal.id, 'reservation', { actorType: 'user', actorId: a.userId })
    await createTask(db, a.orgId, { type: 'document', title: 'Nota simple', dealId: deal.id })
    const v = await visit(db, a.orgId, { dealId: deal.id, type: 'notary' })
    await recordActivity(db, a.orgId, { eventType: 'APPOINTMENT_CREATED', entityType: 'appointment', entityId: v.id, appointmentId: v.id, actorType: 'user' })
    await createTask(db, a.orgId, { type: 'call', title: 'De la otra operación', dealId: other.id })

    const { rows } = await listActivity(db, a.orgId, { dealId: deal.id })
    const types = rows.map((r) => r.eventType)
    expect(types).toEqual(expect.arrayContaining(['DEAL_CREATED', 'DEAL_STAGE_CHANGED', 'OFFER_CREATED', 'OFFER_ACCEPTED', 'TASK_CREATED', 'APPOINTMENT_CREATED']))
    // La tarea de la otra operación no aparece, ni su DEAL_CREATED.
    expect(rows.filter((r) => r.eventType === 'TASK_CREATED')).toHaveLength(1)
    expect(rows.filter((r) => r.eventType === 'DEAL_CREATED').every((r) => r.entityId === deal.id)).toBe(true)

    // Otra agencia preguntando por esta operación: nada.
    expect((await listActivity(db, b.orgId, { dealId: deal.id })).rows).toEqual([])

    // Filtro por tipos.
    const onlyDeal = await listActivity(db, a.orgId, { dealId: deal.id, eventTypes: ['DEAL_STAGE_CHANGED'] })
    expect(onlyDeal.rows.map((r) => r.eventType)).toEqual(['DEAL_STAGE_CHANGED'])
  })

  it('GET /activity: dealId y eventTypes; un tipo desconocido es 422; cada fila trae el nombre del usuario que la hizo', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6ActApi')
    const deal = await newDeal(db, a.orgId, a.projectId)
    const { transitionDealStage } = await import('../../server/utils/deals/service')
    await transitionDealStage(db, a.orgId, deal.id, 'reservation', { actorType: 'user', actorId: a.userId })
    const handler = (await import('../../server/api/admin/saas/activity.get')).default as any

    const res = await handler(ev(db, a.orgId, adminUser(a.userId), { query: { dealId: String(deal.id), eventTypes: 'DEAL_STAGE_CHANGED' } }))
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0]).toMatchObject({ eventType: 'DEAL_STAGE_CHANGED', actorName: 'N6ActApi Admin' })
    await expect(handler(ev(db, a.orgId, adminUser(a.userId), { query: { dealId: String(deal.id), eventTypes: 'INVENTADO' } }))).rejects.toMatchObject({ statusCode: 422 })
    await expect(handler(ev(db, a.orgId, adminUser(a.userId), { query: {} }))).rejects.toMatchObject({ statusCode: 422 })
  })

  it('«el cliente abrió la ficha»: sólo con la lectura confirmada de una ficha enviada por WhatsApp, una sola vez', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6Opened')
    const person = await contact(db, a.orgId, 'Lectora')
    const l = await lead(db, a.orgId, { contactId: person.id })
    const [channel] = await db
      .insert(schema.commsChannels)
      .values({ organizationId: a.orgId, provider: 'meta_cloud', label: 'Meta', phoneE164: '+34900000001', externalPhoneId: 'n6-1', credentialsCiphertext: 'x', credentialsIv: 'y', status: 'active', isDefault: 1, createdAt: ts, updatedAt: ts })
      .returning()
    const [wa] = await db.insert(schema.commsContacts).values({ organizationId: a.orgId, phoneE164: '+34600000001', leadId: l.id, createdAt: ts, updatedAt: ts }).returning()
    const [conv] = await db.insert(schema.commsConversations).values({ organizationId: a.orgId, channelId: channel.id, contactId: wa.id, createdAt: ts, updatedAt: ts }).returning()
    const msg = (externalId: string, over: Record<string, any> = {}) =>
      db
        .insert(schema.commsMessages)
        .values({ organizationId: a.orgId, conversationId: conv.id, direction: 'out', type: 'property_share', externalId, status: 'delivered', propertyId: a.propertyId, propertyKind: 'agent', createdAt: ts, updatedAt: ts, ...over })
        .returning()
    await msg('wamid.share')
    await msg('wamid.text', { type: 'text', propertyId: null, propertyKind: null })
    const { applyMessageStatus } = await import('../../server/utils/comms/inbox')
    const { listActivity } = await import('../../server/utils/activity/service')
    const read = (externalId: string) => applyMessageStatus(db, { kind: 'status', externalId, status: 'read', timestamp: '2026-03-01T10:00:00Z', raw: {} })

    await read('wamid.share')
    await read('wamid.share') // un «read» repetido no duplica
    await read('wamid.text') // un mensaje que no es una ficha no cuenta

    const { rows } = await listActivity(db, a.orgId, { propertyId: a.propertyId, propertyKind: 'agent' })
    const opened = rows.filter((r) => r.eventType === 'PROPERTY_SHARE_OPENED')
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({ actorType: 'contact', leadId: l.id, contactId: person.id, entityType: 'comms_message' })
  })
})

// ---------------------------------------------------------------------------
// FASE 22 — Tareas
// ---------------------------------------------------------------------------

describe('N6 · tareas: edición completa, estados y papelera', () => {
  it('edita todos los campos —estado «en curso» incluido— y vincula contacto, lead, propiedad, cita y operación de la propia agencia', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6TaskEdit')
    const person = await contact(db, a.orgId)
    const l = await lead(db, a.orgId)
    const v = await visit(db, a.orgId)
    const deal = await newDeal(db, a.orgId, a.projectId)
    const { createTask, updateTask, listTasks, withTaskLabels } = await import('../../server/utils/tasks/service')

    const task = await createTask(db, a.orgId, { type: 'call', title: 'Llamar' })
    const edited = await updateTask(
      db,
      a.orgId,
      task.id,
      { title: 'Preparar documentación', type: 'document', priority: 'urgent', status: 'in_progress', dueAt: '2030-01-10 09:00:00', assigneeId: a.teamMemberId, contactId: person.id, leadId: l.id, propertyId: a.propertyId, propertyKind: 'agent', appointmentId: v.id, dealId: deal.id },
      { actorId: a.userId },
    )
    expect(edited).toMatchObject({ title: 'Preparar documentación', type: 'document', priority: 'urgent', status: 'in_progress', assigneeId: a.teamMemberId, contactId: person.id, leadId: l.id, propertyId: a.propertyId, propertyKind: 'agent', appointmentId: v.id, dealId: deal.id })

    // «Pendientes» (active) incluye las que están en curso; «open» ya no.
    expect((await listTasks(db, a.orgId, { status: 'active' })).map((t) => t.id)).toContain(task.id)
    expect((await listTasks(db, a.orgId, { status: 'open' })).map((t) => t.id)).not.toContain(task.id)

    const [labeled] = await withTaskLabels(db, a.orgId, await listTasks(db, a.orgId, { dealId: deal.id }))
    expect(labeled).toMatchObject({ contactName: person.name, leadName: l.name, assigneeName: 'N6TaskEdit Broker', propertyName: 'N6TaskEdit City' })
    expect(labeled.appointmentLabel).toContain(v.clientName)

    // La próxima acción del lead la refleja (tipo + fecha).
    expect(await loadLead(db, l.id)).toMatchObject({ nextActionType: 'task:document', nextActionAt: '2030-01-10 09:00:00' })

    // Desvincular con null.
    const unlinked = await updateTask(db, a.orgId, task.id, { contactId: null, appointmentId: null })
    expect(unlinked).toMatchObject({ contactId: null, appointmentId: null })
  })

  it('cancelar registra TASK_CANCELLED; reabrir una completada le quita completedAt', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6TaskStates')
    const person = await contact(db, a.orgId)
    const { createTask, updateTask } = await import('../../server/utils/tasks/service')
    const { listActivity } = await import('../../server/utils/activity/service')
    const t = await createTask(db, a.orgId, { type: 'call', title: 'X', contactId: person.id, status: 'in_progress' })
    expect(t.status).toBe('in_progress')
    await updateTask(db, a.orgId, t.id, { status: 'cancelled' }, { actorId: a.userId })
    const done = await updateTask(db, a.orgId, (await createTask(db, a.orgId, { type: 'call', title: 'Y' })).id, { status: 'completed' })
    expect(done.completedAt).toBeTruthy()
    expect((await updateTask(db, a.orgId, done.id, { status: 'open' })).completedAt).toBeNull()
    const { rows } = await listActivity(db, a.orgId, { contactId: person.id })
    expect(rows.map((r) => r.eventType)).toContain('TASK_CANCELLED')
    await expect(createTask(db, a.orgId, { type: 'call', title: 'Z', status: 'completed' as any })).rejects.toMatchObject({ statusCode: 422 })
  })

  it('referencias ajenas son 404 al crear y al editar; una propiedad de la papelera es 422, pero la que ya tenía se conserva', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6TaskRefA')
    const b = await seedTenant(db, 'N6TaskRefB')
    const contactB = await contact(db, b.orgId)
    const leadB = await lead(db, b.orgId)
    const dealB = await newDeal(db, b.orgId, b.projectId)
    const { createTask, updateTask } = await import('../../server/utils/tasks/service')
    const task = await createTask(db, a.orgId, { type: 'call', title: 'Mía', propertyId: a.propertyId, propertyKind: 'agent' })

    for (const patch of [
      { contactId: contactB.id },
      { leadId: leadB.id },
      { appointmentId: b.visitId },
      { dealId: dealB.id },
      { assigneeId: b.teamMemberId },
      { propertyId: b.propertyId, propertyKind: 'agent' as const },
      { propertyId: b.projectId, propertyKind: 'developer' as const },
    ]) {
      await expect(updateTask(db, a.orgId, task.id, patch)).rejects.toMatchObject({ statusCode: 404 })
      await expect(createTask(db, a.orgId, { type: 'call', title: 'Ajena', ...patch })).rejects.toMatchObject({ statusCode: 404 })
    }
    // La tarea de A no existe para B.
    await expect(updateTask(db, b.orgId, task.id, { title: 'intruso' })).rejects.toMatchObject({ statusCode: 404 })

    // Papelera: la propiedad que ya tenía puede seguir aunque se borre; cambiar a una borrada, no.
    await db.update(schema.agentProperties).set({ deletedAt: ts }).where(eq(schema.agentProperties.id, a.propertyId))
    await expect(updateTask(db, a.orgId, task.id, { title: 'Sigue siendo historia' })).resolves.toMatchObject({ propertyId: a.propertyId })
    const other = await createTask(db, a.orgId, { type: 'call', title: 'Otra' })
    await expect(updateTask(db, a.orgId, other.id, { propertyId: a.propertyId, propertyKind: 'agent' })).rejects.toMatchObject({ statusCode: 422 })
  })

  it('borrar manda a la papelera: fuera de los listados, de la ficha de la operación y de la próxima acción; la actividad se conserva', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6TaskTrash')
    const b = await seedTenant(db, 'N6TaskTrashB')
    const l = await lead(db, a.orgId)
    const deal = await newDeal(db, a.orgId, a.projectId)
    const { createTask, deleteTask, listTasks, updateTask } = await import('../../server/utils/tasks/service')
    const { getDealDetail } = await import('../../server/utils/deals/service')
    const { listActivity } = await import('../../server/utils/activity/service')

    const t = await createTask(db, a.orgId, { type: 'call', title: 'Para borrar', leadId: l.id, dealId: deal.id, dueAt: '2030-05-01 10:00:00' })
    expect((await loadLead(db, l.id)).nextActionType).toBe('task:call')

    await expect(deleteTask(db, b.orgId, t.id)).rejects.toMatchObject({ statusCode: 404 })
    const deleted = await deleteTask(db, a.orgId, t.id)
    expect(deleted.deletedAt).toBeTruthy()

    expect((await listTasks(db, a.orgId)).map((x) => x.id)).not.toContain(t.id)
    expect((await getDealDetail(db, a.orgId, deal.id)).tasks).toEqual([])
    expect((await getDealDetail(db, a.orgId, deal.id)).nextAction).toBeNull()
    expect(await loadLead(db, l.id)).toMatchObject({ nextActionType: null, nextActionAt: null })
    await expect(updateTask(db, a.orgId, t.id, { title: 'zombi' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(deleteTask(db, a.orgId, t.id)).rejects.toMatchObject({ statusCode: 404 })
    // La fila sigue (borrado lógico) y su TASK_CREATED también.
    expect((await db.select().from(schema.tasks).where(eq(schema.tasks.id, t.id)))[0].deletedAt).toBeTruthy()
    expect((await listActivity(db, a.orgId, { leadId: l.id })).rows.map((r) => r.eventType)).toContain('TASK_CREATED')
  })

  it('mover una tarea de un lead a otro recalcula la próxima acción de los dos', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6TaskMove')
    const l1 = await lead(db, a.orgId)
    const l2 = await lead(db, a.orgId)
    const { createTask, updateTask } = await import('../../server/utils/tasks/service')
    const t = await createTask(db, a.orgId, { type: 'whatsapp', title: 'Mover', leadId: l1.id, dueAt: '2030-03-01 10:00:00' })
    await updateTask(db, a.orgId, t.id, { leadId: l2.id })
    expect((await loadLead(db, l1.id)).nextActionType).toBeNull()
    expect(await loadLead(db, l2.id)).toMatchObject({ nextActionType: 'task:whatsapp', nextActionAt: '2030-03-01 10:00:00' })
  })

  it('PATCH /tasks/:id: relaciones, «deleted: true» y un id mal formado es 422', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6TaskApi')
    const person = await contact(db, a.orgId)
    const { createTask, listTasks } = await import('../../server/utils/tasks/service')
    const t = await createTask(db, a.orgId, { type: 'call', title: 'API' })
    const handler = (await import('../../server/api/admin/saas/tasks/[id].patch')).default as any
    const call = (body: any) => handler(ev(db, a.orgId, adminUser(a.userId), { params: { id: String(t.id) }, body }))

    expect(await call({ contactId: String(person.id), status: 'in_progress' })).toMatchObject({ contactId: person.id, status: 'in_progress' })
    await expect(call({ leadId: 'abc' })).rejects.toMatchObject({ statusCode: 422 })
    expect(await call({ contactId: '' })).toMatchObject({ contactId: null })
    await call({ deleted: true })
    expect((await listTasks(db, a.orgId)).map((x) => x.id)).not.toContain(t.id)
  })
})

// ---------------------------------------------------------------------------
// FASE 23 — Ofertas
// ---------------------------------------------------------------------------

describe('N6 · ofertas: negociación completa e historial inmutable', () => {
  it('oferta → contraoferta → nueva oferta → aceptada, cada revisión con sus términos completos y sin sobrescribir ninguna', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6Offer')
    const buyer = await contact(db, a.orgId, 'Compradora')
    const seller = await contact(db, a.orgId, 'Vendedor')
    const { createOffer, submitOffer, counterOffer, newOffer, acceptOffer, getOfferWithRevisions } = await import('../../server/utils/offers/service')
    const { listActivity } = await import('../../server/utils/activity/service')

    const offer = await createOffer(
      db,
      a.orgId,
      { propertyId: a.projectId, propertyKind: 'developer', buyerContactId: buyer.id, sellerContactIds: [seller.id], commercialId: a.teamMemberId, amount: 400_000, conditions: 'Entrega en 3 meses', financeCondition: 'mortgage_subject', expiration: '2030-06-30' },
      { createdBy: a.userId },
    )
    expect(offer.expiration).toBe('2030-06-30 23:59:59')
    await submitOffer(db, a.orgId, offer.id, {}, { actorType: 'user', actorId: a.userId })
    const countered = await counterOffer(db, a.orgId, offer.id, { amount: 430_000, conditions: 'Sin mobiliario', financeCondition: 'mortgage_approved', expiration: '2030-07-15' }, { actorType: 'seller' })
    expect(countered).toMatchObject({ status: 'countered', currentAmount: 430_000, currentConditions: 'Sin mobiliario', currentFinanceCondition: 'mortgage_approved', expiration: '2030-07-15 23:59:59' })

    // Nueva oferta sólo responde a una contraoferta.
    const resubmitted = await newOffer(db, a.orgId, offer.id, { amount: 415_000, conditions: 'Con mobiliario de cocina', financeCondition: 'cash', expiration: '2030-07-31 12:00' }, { actorType: 'buyer' })
    expect(resubmitted).toMatchObject({ status: 'submitted', currentAmount: 415_000, currentFinanceCondition: 'cash', expiration: '2030-07-31 12:00:00' })
    await expect(newOffer(db, a.orgId, offer.id, { amount: 1 }, { actorType: 'buyer' })).rejects.toMatchObject({ statusCode: 422 })

    const { offer: current, revisions } = await getOfferWithRevisions(db, a.orgId, offer.id)
    await acceptOffer(db, a.orgId, offer.id, { actorType: 'seller' }, current.currentRevisionId!)

    const after = await getOfferWithRevisions(db, a.orgId, offer.id)
    expect(after.revisions.map((r) => r.type)).toEqual(['created', 'submitted', 'countered', 'new_offer', 'accepted'])
    expect(after.revisions.map((r) => r.amount)).toEqual([400_000, 400_000, 430_000, 415_000, 415_000])
    const byType = Object.fromEntries(after.revisions.map((r) => [r.type, r]))
    expect(byType.created).toMatchObject({ conditions: 'Entrega en 3 meses', financeCondition: 'mortgage_subject', expiration: '2030-06-30 23:59:59', actorType: 'user', actorName: 'N6Offer Admin' })
    expect(byType.countered).toMatchObject({ conditions: 'Sin mobiliario', financeCondition: 'mortgage_approved', expiration: '2030-07-15 23:59:59', actorType: 'seller' })
    expect(byType.new_offer).toMatchObject({ conditions: 'Con mobiliario de cocina', financeCondition: 'cash', actorType: 'buyer' })
    // Las revisiones anteriores son exactamente las que había antes de aceptar: nada se reescribió.
    expect(after.revisions.slice(0, 4)).toEqual(revisions)
    expect(after.offer).toMatchObject({ status: 'accepted', buyerName: 'Compradora', sellers: [{ id: seller.id, name: 'Vendedor' }], commercialName: 'N6Offer Broker', propertyName: 'N6Offer Tower' })

    const events = (await listActivity(db, a.orgId, { contactId: buyer.id })).rows.map((r) => r.eventType)
    expect(events).toEqual(expect.arrayContaining(['OFFER_COUNTERED', 'OFFER_RESUBMITTED', 'OFFER_ACCEPTED']))
  })

  it('rechazada también queda en el historial; financiación fuera de catálogo, fecha mal formada o actor inventado son 422', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6OfferBad')
    const buyer = await contact(db, a.orgId)
    const { createOffer, submitOffer, counterOffer, rejectOffer, getOfferWithRevisions } = await import('../../server/utils/offers/service')
    await expect(createOffer(db, a.orgId, { propertyId: a.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 1000, financeCondition: 'trueque' })).rejects.toMatchObject({ statusCode: 422 })
    await expect(createOffer(db, a.orgId, { propertyId: a.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 1000, expiration: 'mañana' })).rejects.toMatchObject({ statusCode: 422 })
    const offer = await createOffer(db, a.orgId, { propertyId: a.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 1000 })
    await submitOffer(db, a.orgId, offer.id, {}, { actorType: 'user' })
    await expect(counterOffer(db, a.orgId, offer.id, { amount: 1100, financeCondition: 'trueque' }, { actorType: 'seller' })).rejects.toMatchObject({ statusCode: 422 })
    await expect(counterOffer(db, a.orgId, offer.id, { amount: 1100 }, { actorType: 'notario' as any })).rejects.toMatchObject({ statusCode: 422 })
    await rejectOffer(db, a.orgId, offer.id, { actorType: 'seller' })
    expect((await getOfferWithRevisions(db, a.orgId, offer.id)).revisions.map((r) => r.type)).toEqual(['created', 'submitted', 'rejected'])
  })

  it('lead, necesidad, comercial y match ajenos son 404; el comprador no puede ser vendedor; otra agencia no ve la oferta', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6OfferRefA')
    const b = await seedTenant(db, 'N6OfferRefB')
    const buyer = await contact(db, a.orgId)
    const leadB = await lead(db, b.orgId)
    const contactB = await contact(db, b.orgId)
    const [reqB] = await db.insert(schema.buyerRequirements).values({ organizationId: b.orgId, contactId: contactB.id, title: 'Ajena', status: 'active', createdAt: ts, updatedAt: ts }).returning()
    const { createOffer, getOfferWithRevisions, listOffers } = await import('../../server/utils/offers/service')
    const base = { propertyId: a.projectId, propertyKind: 'developer' as const, buyerContactId: buyer.id, amount: 1000 }
    await expect(createOffer(db, a.orgId, { ...base, leadId: leadB.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createOffer(db, a.orgId, { ...base, commercialId: b.teamMemberId })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createOffer(db, a.orgId, { ...base, buyerRequirementId: reqB.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createOffer(db, a.orgId, { ...base, matchId: 999_999 })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createOffer(db, a.orgId, { ...base, sellerContactIds: [contactB.id] })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createOffer(db, a.orgId, { ...base, sellerContactIds: [buyer.id] })).rejects.toMatchObject({ statusCode: 422 })
    const offer = await createOffer(db, a.orgId, base)
    await expect(getOfferWithRevisions(db, b.orgId, offer.id)).rejects.toMatchObject({ statusCode: 404 })
    expect(await listOffers(db, b.orgId)).toEqual([])
  })

  it('GET /offers: filtros por estado («open»), catálogo y comprador, con los nombres ya resueltos; la oferta aceptada trae su operación', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6OfferList')
    const buyer = await contact(db, a.orgId, 'Ana Compradora')
    const { createOffer } = await import('../../server/utils/offers/service')
    const draft = await createOffer(db, a.orgId, { propertyId: a.propertyId, propertyKind: 'agent', buyerContactId: buyer.id, amount: 250_000 })
    const deal = await newDeal(db, a.orgId, a.projectId)
    const handler = (await import('../../server/api/admin/saas/offers.get')).default as any
    const get = (query: any) => handler(ev(db, a.orgId, adminUser(a.userId), { query }))

    const open = (await get({ status: 'open' })).rows
    expect(open.map((o: any) => o.id)).toEqual([draft.id])
    expect(open[0]).toMatchObject({ buyerName: 'Ana Compradora', propertyName: 'N6OfferList City', dealId: null, isExpired: false })
    const agentOnly = (await get({ propertyKind: 'agent' })).rows
    expect(agentOnly.map((o: any) => o.id)).toEqual([draft.id])
    const accepted = (await get({ status: 'accepted' })).rows
    expect(accepted).toHaveLength(1)
    expect(accepted[0].dealId).toBe(deal.id)
    expect((await get({ buyerContactId: String(buyer.id) })).rows.map((o: any) => o.id)).toEqual([draft.id])
  })

  it('POST /offers/:id/counter con kind=new_offer registra la nueva oferta del comprador', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6OfferCounterApi')
    const buyer = await contact(db, a.orgId)
    const { createOffer, submitOffer, counterOffer } = await import('../../server/utils/offers/service')
    const offer = await createOffer(db, a.orgId, { propertyId: a.projectId, propertyKind: 'developer', buyerContactId: buyer.id, amount: 100 })
    await submitOffer(db, a.orgId, offer.id, {}, { actorType: 'user' })
    await counterOffer(db, a.orgId, offer.id, { amount: 150 }, { actorType: 'seller' })
    const handler = (await import('../../server/api/admin/saas/offers/[id]/counter.post')).default as any
    const res = await handler(ev(db, a.orgId, adminUser(a.userId), { params: { id: String(offer.id) }, body: { kind: 'new_offer', amount: 120, financeCondition: 'cash', expiration: '2030-01-01' } }))
    expect(res).toMatchObject({ status: 'submitted', currentAmount: 120, currentFinanceCondition: 'cash' })
    const [rev] = await db.select().from(schema.offerRevisions).where(and(eq(schema.offerRevisions.offerId, offer.id), eq(schema.offerRevisions.type, 'new_offer')))
    expect(rev).toMatchObject({ actorType: 'buyer', amount: 120 })
    await expect(handler(ev(db, a.orgId, adminUser(a.userId), { params: { id: String(offer.id) }, body: { kind: 'otra', amount: 1 } }))).rejects.toMatchObject({ statusCode: 422 })
  })
})

// ---------------------------------------------------------------------------
// FASE 24 — Operaciones
// ---------------------------------------------------------------------------

describe('N6 · operaciones: Kanban, oficina y documentos vinculados', () => {
  it('Kanban: mover de etapa deja historial (quién, motivo) sin sobrescribir; «Cerrada» sólo por la acción de cerrar', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6Kanban')
    const deal = await newDeal(db, a.orgId, a.projectId)
    const { transitionDealStage, listDeals, getDealDetail } = await import('../../server/utils/deals/service')

    await transitionDealStage(db, a.orgId, deal.id, 'reservation', { actorType: 'user', actorId: a.userId, reason: 'Reserva firmada' })
    await transitionDealStage(db, a.orgId, deal.id, 'deposit_contract', { actorType: 'user', actorId: a.userId })
    await transitionDealStage(db, a.orgId, deal.id, 'reservation', { actorType: 'user', actorId: a.userId, reason: 'Vuelta atrás' })
    await expect(transitionDealStage(db, a.orgId, deal.id, 'closed', { actorType: 'user' })).rejects.toMatchObject({ statusCode: 422 })

    expect((await listDeals(db, a.orgId, { stage: 'reservation' })).map((d) => d.id)).toEqual([deal.id])
    expect(await listDeals(db, a.orgId, { stage: 'deposit_contract' })).toEqual([])

    const { stageHistory } = await getDealDetail(db, a.orgId, deal.id)
    expect(stageHistory.map((h: any) => [h.fromStage, h.toStage])).toEqual([
      [null, 'accepted_offer'],
      ['accepted_offer', 'reservation'],
      ['reservation', 'deposit_contract'],
      ['deposit_contract', 'reservation'],
    ])
    expect(stageHistory[1]).toMatchObject({ reason: 'Reserva firmada', actorName: 'N6Kanban Admin' })
  })

  it('oficina editable y filtrable: sólo una oficina viva de la agencia (ajena o borrada = 404); el comercial igual', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6OfficeA')
    const b = await seedTenant(db, 'N6OfficeB')
    const officeA = await office(db, a.orgId, { name: 'Centro' })
    const gone = await office(db, a.orgId, { deletedAt: ts })
    const officeB = await office(db, b.orgId)
    const deal = await newDeal(db, a.orgId, a.projectId)
    const other = await newDeal(db, a.orgId, a.propertyId, 'agent')
    const { updateDeal, listDeals, withDealLabels } = await import('../../server/utils/deals/service')

    await expect(updateDeal(db, a.orgId, deal.id, { officeId: officeB.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(updateDeal(db, a.orgId, deal.id, { officeId: gone.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(updateDeal(db, a.orgId, deal.id, { commercialId: b.teamMemberId })).rejects.toMatchObject({ statusCode: 404 })
    await expect(updateDeal(db, b.orgId, deal.id, { officeId: officeB.id })).rejects.toMatchObject({ statusCode: 404 })

    expect(await updateDeal(db, a.orgId, deal.id, { officeId: officeA.id, commercialId: a.teamMemberId })).toMatchObject({ officeId: officeA.id, commercialId: a.teamMemberId })
    const filtered = await listDeals(db, a.orgId, { officeId: officeA.id })
    expect(filtered.map((d) => d.id)).toEqual([deal.id])
    expect((await listDeals(db, a.orgId)).map((d) => d.id)).toContain(other.id)
    const [labeled] = await withDealLabels(db, a.orgId, filtered)
    expect(labeled).toMatchObject({ officeName: 'Centro', commercialName: 'N6OfficeA Broker', propertyName: 'N6OfficeA Tower' })
    expect(await updateDeal(db, a.orgId, deal.id, { officeId: null })).toMatchObject({ officeId: null })
  })

  it('vincula reserva, arras y contrato de la agencia; ajenos 404, de otra operación 409, desvincular sólo lo propio', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6LinkA')
    const b = await seedTenant(db, 'N6LinkB')
    const deal = await newDeal(db, a.orgId, a.projectId)
    const other = await newDeal(db, a.orgId, a.propertyId, 'agent')
    const res = await reservation(db, a.orgId)
    const dep = await deposit(db, a.orgId)
    const con = await contract(db, a.orgId)
    const resB = await reservation(db, b.orgId)
    const { linkDealRecord, unlinkDealRecord, getDealDetail } = await import('../../server/utils/deals/service')
    const { listActivity } = await import('../../server/utils/activity/service')
    const actor = { actorType: 'user' as const, actorId: a.userId }

    await linkDealRecord(db, a.orgId, deal.id, 'reservation', res.id, actor)
    await linkDealRecord(db, a.orgId, deal.id, 'deposit', dep.id, actor)
    await linkDealRecord(db, a.orgId, deal.id, 'contract', con.id, actor)
    await linkDealRecord(db, a.orgId, deal.id, 'contract', con.id, actor) // idempotente

    const detail = await getDealDetail(db, a.orgId, deal.id, { includeFinance: true })
    expect(detail.records.reservations.linked.map((r: any) => r.id)).toEqual([res.id])
    expect(detail.records.deposits.linked.map((r: any) => r.id)).toEqual([dep.id])
    expect(detail.records.contracts.linked.map((r: any) => r.id)).toEqual([con.id])
    // El contrato del seedTenant sigue libre: es candidato; los de otra agencia, nunca.
    expect(detail.records.contracts.candidates.map((r: any) => r.id)).toEqual([a.contractId])
    expect(detail.records.reservations.candidates.map((r: any) => r.id)).not.toContain(resB.id)

    // Sin permiso de Finanzas, arras y contratos ni se leen.
    const crmOnly = await getDealDetail(db, a.orgId, deal.id, { includeFinance: false })
    expect(crmOnly.records).toMatchObject({ financeVisible: false, deposits: { linked: [], candidates: [] }, contracts: { linked: [], candidates: [] } })

    await expect(linkDealRecord(db, a.orgId, deal.id, 'reservation', resB.id, actor)).rejects.toMatchObject({ statusCode: 404 })
    await expect(linkDealRecord(db, b.orgId, deal.id, 'reservation', resB.id, actor)).rejects.toMatchObject({ statusCode: 404 })
    await expect(linkDealRecord(db, a.orgId, other.id, 'reservation', res.id, actor)).rejects.toMatchObject({ statusCode: 409 })
    await expect(unlinkDealRecord(db, a.orgId, other.id, 'reservation', res.id, actor)).rejects.toMatchObject({ statusCode: 404 })

    await unlinkDealRecord(db, a.orgId, deal.id, 'reservation', res.id, actor)
    expect((await db.select().from(schema.reservations).where(eq(schema.reservations.id, res.id)))[0].dealOperationId).toBeNull()
    await linkDealRecord(db, a.orgId, other.id, 'reservation', res.id, actor)

    const types = (await listActivity(db, a.orgId, { dealId: deal.id })).rows.map((r) => r.eventType)
    expect(types.filter((t) => t === 'DEAL_RECORD_LINKED')).toHaveLength(3)
    expect(types).toContain('DEAL_RECORD_UNLINKED')
  })

  it('POST /deal-operations: link/update validados; arras y contratos exigen Finanzas (403); la reserva basta con CRM', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6DealApi')
    const deal = await newDeal(db, a.orgId, a.projectId)
    const res = await reservation(db, a.orgId)
    const dep = await deposit(db, a.orgId)
    const handler = (await import('../../server/api/admin/saas/deal-operations.post')).default as any
    const crmOnly = adminUser(a.userId, JSON.stringify(['crm:write']))
    const post = (user: any, body: any) => handler(ev(db, a.orgId, user, { body }))

    expect(await post(crmOnly, { id: deal.id, action: 'link', kind: 'reservation', recordId: res.id })).toMatchObject({ dealOperationId: deal.id })
    await expect(post(crmOnly, { id: deal.id, action: 'link', kind: 'deposit', recordId: dep.id })).rejects.toMatchObject({ statusCode: 403 })
    expect(await post(adminUser(a.userId), { id: deal.id, action: 'link', kind: 'deposit', recordId: dep.id })).toMatchObject({ dealOperationId: deal.id })
    await expect(post(adminUser(a.userId), { id: deal.id, action: 'link', kind: 'factura', recordId: 1 })).rejects.toMatchObject({ statusCode: 422 })
    await expect(post(adminUser(a.userId), { id: deal.id, action: 'update', officeId: 'x' })).rejects.toMatchObject({ statusCode: 422 })

    const getHandler = (await import('../../server/api/admin/saas/deal-operations.get')).default as any
    const list = await getHandler(ev(db, a.orgId, adminUser(a.userId), { query: {} }))
    expect(list.rows.find((d: any) => d.id === deal.id)).toMatchObject({ linkedRecords: 2 })
    // Un usuario sólo de CRM cuenta sólo la reserva (no ve las arras).
    const listCrm = await getHandler(ev(db, a.orgId, adminUser(a.userId, JSON.stringify(['crm:read'])), { query: {} }))
    expect(listCrm.rows.find((d: any) => d.id === deal.id)).toMatchObject({ linkedRecords: 1 })
  })

  it('una operación borrada (deletedAt) no sale en el listado ni se abre (404)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N6DealTrash')
    const deal = await newDeal(db, a.orgId, a.projectId)
    await db.update(schema.dealOperations).set({ deletedAt: ts }).where(eq(schema.dealOperations.id, deal.id))
    const { listDeals, getDealDetail } = await import('../../server/utils/deals/service')
    const { createTask } = await import('../../server/utils/tasks/service')
    expect(await listDeals(db, a.orgId)).toEqual([])
    await expect(getDealDetail(db, a.orgId, deal.id)).rejects.toMatchObject({ statusCode: 404 })
    // Tampoco se le cuelga trabajo nuevo.
    await expect(createTask(db, a.orgId, { type: 'call', title: 'X', dealId: deal.id })).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ---------------------------------------------------------------------------
// Catálogo compartido
// ---------------------------------------------------------------------------

describe('N6 · catálogo compartido', () => {
  it('la próxima acción del lead se lee con su tipo', async () => {
    const { nextActionLabel } = await import('../../utils/pipelineCatalog')
    expect(nextActionLabel('task:call')).toBe('Tarea · Llamada')
    expect(nextActionLabel('appointment:property_viewing')).toBe('Cita · Visita a inmueble')
    expect(nextActionLabel(null)).toBe('—')
  })

  it('los servicios usan las mismas listas que el panel', async () => {
    const tasks = await import('../../server/utils/tasks/service')
    const offers = await import('../../server/utils/offers/service')
    const deals = await import('../../server/utils/deals/service')
    const catalog = await import('../../utils/pipelineCatalog')
    expect(tasks.TASK_STATUSES).toBe(catalog.TASK_STATUSES)
    expect(offers.OFFER_STATUSES).toBe(catalog.OFFER_STATUSES)
    expect(deals.DEAL_STAGES).toBe(catalog.DEAL_STAGES)
    for (const s of catalog.DEAL_STAGES) expect(catalog.DEAL_STAGE_LABELS[s]).toBeTruthy()
    for (const s of catalog.TASK_STATUSES) expect(catalog.TASK_STATUS_LABELS[s]).toBeTruthy()
    for (const s of catalog.OFFER_REVISION_TYPES) expect(catalog.OFFER_REVISION_LABELS[s]).toBeTruthy()
  })
})
