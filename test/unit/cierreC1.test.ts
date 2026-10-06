import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Cierre C1 del núcleo inmobiliario, sobre una SQLite real con las
 * migraciones reales:
 *  - FASE 25 — edición inline del listado de propiedades: es el MISMO PUT del
 *    motor genérico que usa el editor, así que un cambio de precio deja una
 *    (y sólo una) fila en el histórico de cada catálogo, y estado/precio se
 *    validan en el servidor;
 *  - FASE 22 — papelera de tareas: ver y restaurar, con TASK_TRASHED /
 *    TASK_RESTORED y la próxima acción del lead recalculada;
 *  - FASE 24 — papelera de operaciones: qué la bloquea (cerrada, documentos
 *    vinculados), restaurar, y nada cruza de agencia (404).
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})
vi.mock('../../server/utils/audit', () => ({ logAdminAction: vi.fn() }))
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

const ts = '2026-01-01 00:00:00'
let seq = 0

async function contact(db: any, orgId: number) {
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name: `Contacto C1 ${++seq}`, status: 'active', createdAt: ts, updatedAt: ts }).returning()
  return row
}
async function lead(db: any, orgId: number) {
  const [row] = await db
    .insert(schema.leads)
    .values({ organizationId: orgId, name: `Lead C1 ${++seq}`, source: 'web', status: 'active', stage: 'qualified', score: 0, createdAt: ts, updatedAt: ts })
    .returning()
  return row
}
async function loadLead(db: any, id: number) {
  return (await db.select().from(schema.leads).where(eq(schema.leads.id, id)))[0]
}
async function reservation(db: any, orgId: number) {
  const [row] = await db.insert(schema.reservations).values({ organizationId: orgId, reference: `R-C1-${++seq}`, clientName: 'Comprador', amount: 6000, reservedAt: ts, createdAt: ts }).returning()
  return row
}
async function deposit(db: any, orgId: number) {
  const [row] = await db.insert(schema.depositPayments).values({ organizationId: orgId, amount: 30000, createdAt: ts }).returning()
  return row
}
async function newDeal(db: any, orgId: number, propertyId: number, propertyKind: 'agent' | 'developer' = 'developer') {
  const buyer = await contact(db, orgId)
  const { createOffer, submitOffer, acceptOffer } = await import('../../server/utils/offers/service')
  const offer = await createOffer(db, orgId, { propertyId, propertyKind, buyerContactId: buyer.id, amount: 400_000 })
  await submitOffer(db, orgId, offer.id, {}, { actorType: 'user' })
  const accepted = await acceptOffer(db, orgId, offer.id, { actorType: 'seller' })
  const { createDeal } = await import('../../server/utils/deals/service')
  const deal = await createDeal(db, orgId, { acceptedOfferId: accepted.id }, { createdBy: null })
  return { deal, offerId: accepted.id, buyerId: buyer.id }
}

const adminUser = (id: number, permissions: string | null = null) => ({ id, role: 'admin', email: 'admin@example.com', permissions }) as any
const ev = (db: any, orgId: number, user: any, extra: { body?: any; query?: any; params?: any } = {}) => ({ context: { db, orgId, user, ...extra } }) as any

// ---------------------------------------------------------------------------
// FASE 25 — Edición inline en el listado de propiedades
// ---------------------------------------------------------------------------

describe('C1 · edición inline del listado: el mismo PUT que el editor', () => {
  async function putHandler() {
    return (await import('../../server/api/admin/[resource]/[id].put')).default as any
  }
  const put = (handler: any, db: any, orgId: number, userId: number, resource: string, id: number, body: any) => handler(ev(db, orgId, adminUser(userId), { params: { resource, id: String(id) }, body }))

  it('obra nueva: cambiar el precio desde la fila deja UNA fila en price_history (con el anterior y quién); el mismo precio no deja ninguna', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C1InlineDev')
    const handler = await putHandler()
    const history = () => db.select().from(schema.priceHistory).where(eq(schema.priceHistory.developerPropertyId, a.projectId))

    expect(await history()).toHaveLength(0)
    await put(handler, db, a.orgId, a.userId, 'developer-properties', a.projectId, { price: 480_000 })
    const rows = await history()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ price: 480_000, previousPrice: 500_000, changedBy: a.userId, reason: null })
    expect((await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, a.projectId)))[0].price).toBe(480_000)

    // Reenviar el mismo precio (p. ej. Enter dos veces) no fabrica otro punto del histórico.
    await put(handler, db, a.orgId, a.userId, 'developer-properties', a.projectId, { price: 480_000 })
    expect(await history()).toHaveLength(1)
  })

  it('2ª mano: el precio va a agent_property_price_history; estado y comercial se guardan con sus reglas de siempre', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C1InlineAgent')
    const handler = await putHandler()

    await put(handler, db, a.orgId, a.userId, 'properties', a.propertyId, { price: 310_000 })
    const rows = await db.select().from(schema.agentPropertyPriceHistory).where(eq(schema.agentPropertyPriceHistory.propertyId, a.propertyId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ price: 310_000, previousPrice: 300_000, changedBy: a.userId })

    await put(handler, db, a.orgId, a.userId, 'properties', a.propertyId, { status: 'sold' })
    await put(handler, db, a.orgId, a.userId, 'properties', a.propertyId, { agentId: a.teamMemberId })
    const [row] = await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, a.propertyId))
    expect(row).toMatchObject({ status: 'sold', agentId: a.teamMemberId, price: 310_000 })
    // «Sin comercial» también se puede elegir desde la fila.
    await put(handler, db, a.orgId, a.userId, 'properties', a.propertyId, { agentId: null })
    expect((await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, a.propertyId)))[0].agentId).toBeNull()
  })

  it('validación en el servidor: estado fuera del catálogo y precio negativo son 422 y no dejan histórico; un comercial de otra agencia es 404', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C1InlineVal')
    const b = await seedTenant(db, 'C1InlineValB')
    const handler = await putHandler()

    // El estado de 2ª mano no vale en obra nueva, ni al revés.
    await expect(put(handler, db, a.orgId, a.userId, 'developer-properties', a.projectId, { status: 'sold' })).rejects.toMatchObject({ statusCode: 422 })
    await expect(put(handler, db, a.orgId, a.userId, 'properties', a.propertyId, { status: 'ready' })).rejects.toMatchObject({ statusCode: 422 })
    await expect(put(handler, db, a.orgId, a.userId, 'developer-properties', a.projectId, { price: -5 })).rejects.toMatchObject({ statusCode: 422 })
    await expect(put(handler, db, a.orgId, a.userId, 'developer-properties', a.projectId, { price: 'mucho' })).rejects.toMatchObject({ statusCode: 422 })
    expect(await db.select().from(schema.priceHistory).where(eq(schema.priceHistory.developerPropertyId, a.projectId))).toHaveLength(0)

    await expect(put(handler, db, a.orgId, a.userId, 'developer-properties', a.projectId, { agentId: b.teamMemberId })).rejects.toMatchObject({ statusCode: 404 })
    // Un estado válido sí se guarda.
    await put(handler, db, a.orgId, a.userId, 'developer-properties', a.projectId, { status: 'ready' })
    expect((await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, a.projectId)))[0].status).toBe('ready')
  })

  it('aislamiento: la fila de otra agencia es 404 y no se toca ni su precio ni su histórico', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C1InlineIsoA')
    const b = await seedTenant(db, 'C1InlineIsoB')
    const handler = await putHandler()

    await expect(put(handler, db, b.orgId, b.userId, 'developer-properties', a.projectId, { price: 1 })).rejects.toMatchObject({ statusCode: 404 })
    await expect(put(handler, db, b.orgId, b.userId, 'properties', a.propertyId, { status: 'sold' })).rejects.toMatchObject({ statusCode: 404 })
    expect((await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, a.projectId)))[0].price).toBe(500_000)
    expect((await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, a.propertyId)))[0].status).toBe('available')
    expect(await db.select().from(schema.priceHistory).where(eq(schema.priceHistory.developerPropertyId, a.projectId))).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// FASE 22 — Papelera de tareas
// ---------------------------------------------------------------------------

describe('C1 · tareas: ver la papelera y restaurar', () => {
  it('borrar registra TASK_TRASHED; restaurar la devuelve tal cual, recalcula la próxima acción del lead y registra TASK_RESTORED una sola vez', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C1TaskRestore')
    const l = await lead(db, a.orgId)
    const { createTask, deleteTask, restoreTask, listTasks } = await import('../../server/utils/tasks/service')
    const { listActivity } = await import('../../server/utils/activity/service')

    const t = await createTask(db, a.orgId, { type: 'call', title: 'Llamar', leadId: l.id, dueAt: '2030-05-01 10:00:00', priority: 'high' }, { createdBy: a.userId })
    await deleteTask(db, a.orgId, t.id, { actorId: a.userId })
    expect((await loadLead(db, l.id)).nextActionType).toBeNull()
    // Sólo en la papelera.
    expect((await listTasks(db, a.orgId)).map((x) => x.id)).not.toContain(t.id)
    expect((await listTasks(db, a.orgId, { trashed: true })).map((x) => x.id)).toEqual([t.id])

    const restored = await restoreTask(db, a.orgId, t.id, { actorId: a.userId })
    expect(restored).toMatchObject({ id: t.id, deletedAt: null, status: 'open', priority: 'high', dueAt: '2030-05-01 10:00:00', leadId: l.id })
    expect((await listTasks(db, a.orgId)).map((x) => x.id)).toContain(t.id)
    expect(await listTasks(db, a.orgId, { trashed: true })).toEqual([])
    expect(await loadLead(db, l.id)).toMatchObject({ nextActionType: 'task:call', nextActionAt: '2030-05-01 10:00:00' })

    // Restaurar lo que ya está vivo no deja otro evento.
    await restoreTask(db, a.orgId, t.id, { actorId: a.userId })
    const events = (await listActivity(db, a.orgId, { leadId: l.id })).rows
    expect(events.filter((e) => e.eventType === 'TASK_TRASHED')).toHaveLength(1)
    const restoredEvents = events.filter((e) => e.eventType === 'TASK_RESTORED')
    expect(restoredEvents).toHaveLength(1)
    expect(restoredEvents[0]).toMatchObject({ entityType: 'task', entityId: t.id, actorType: 'user', actorId: a.userId })
  })

  it('otra agencia ni ve la papelera ajena ni restaura (404)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C1TaskIsoA')
    const b = await seedTenant(db, 'C1TaskIsoB')
    const { createTask, deleteTask, restoreTask, listTasks } = await import('../../server/utils/tasks/service')
    const t = await createTask(db, a.orgId, { type: 'email', title: 'Ajena' })
    await deleteTask(db, a.orgId, t.id)

    expect(await listTasks(db, b.orgId, { trashed: true })).toEqual([])
    await expect(restoreTask(db, b.orgId, t.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(restoreTask(db, a.orgId, 999_999)).rejects.toMatchObject({ statusCode: 404 })
    expect((await db.select().from(schema.tasks).where(eq(schema.tasks.id, t.id)))[0].deletedAt).toBeTruthy()
  })

  it('PATCH { deleted: false } restaura y GET ?trashed=1 lista sólo la papelera de la agencia, con sus filtros', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C1TaskApi')
    const b = await seedTenant(db, 'C1TaskApiB')
    const { createTask } = await import('../../server/utils/tasks/service')
    const patch = (await import('../../server/api/admin/saas/tasks/[id].patch')).default as any
    const list = (await import('../../server/api/admin/saas/tasks.get')).default as any

    const call = await createTask(db, a.orgId, { type: 'call', title: 'Llamada' })
    const mail = await createTask(db, a.orgId, { type: 'email', title: 'Email' })
    const other = await createTask(db, b.orgId, { type: 'call', title: 'De B' })
    for (const [org, id] of [[a.orgId, call.id], [a.orgId, mail.id], [b.orgId, other.id]] as const) {
      await patch(ev(db, org, adminUser(a.userId), { params: { id: String(id) }, body: { deleted: true } }))
    }

    const trash = await list(ev(db, a.orgId, adminUser(a.userId), { query: { trashed: '1' } }))
    expect(trash.rows.map((r: any) => r.id).sort()).toEqual([call.id, mail.id].sort())
    const onlyCalls = await list(ev(db, a.orgId, adminUser(a.userId), { query: { trashed: '1', type: 'call' } }))
    expect(onlyCalls.rows.map((r: any) => r.id)).toEqual([call.id])
    expect((await list(ev(db, a.orgId, adminUser(a.userId), { query: {} }))).rows).toEqual([])

    // La tarea de B no se restaura desde A.
    await expect(patch(ev(db, a.orgId, adminUser(a.userId), { params: { id: String(other.id) }, body: { deleted: false } }))).rejects.toMatchObject({ statusCode: 404 })
    expect(await patch(ev(db, a.orgId, adminUser(a.userId), { params: { id: String(call.id) }, body: { deleted: false } }))).toMatchObject({ id: call.id, deletedAt: null })
    expect((await list(ev(db, a.orgId, adminUser(a.userId), { query: {} }))).rows.map((r: any) => r.id)).toEqual([call.id])
  })
})

// ---------------------------------------------------------------------------
// FASE 24 — Papelera de operaciones
// ---------------------------------------------------------------------------

describe('C1 · operaciones: papelera y restaurar', () => {
  it('una operación activa va a la papelera (fuera del listado, ficha 404) y vuelve tal cual; deja DEAL_TRASHED y DEAL_RESTORED', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C1DealTrash')
    const { deal, buyerId } = await newDeal(db, a.orgId, a.projectId)
    const { trashDeal, restoreDeal, listDeals, getDealDetail, transitionDealStage } = await import('../../server/utils/deals/service')
    const { listActivity } = await import('../../server/utils/activity/service')
    const actor = { actorType: 'user' as const, actorId: a.userId }
    await transitionDealStage(db, a.orgId, deal.id, 'financing', actor)

    const trashed = await trashDeal(db, a.orgId, deal.id, actor)
    expect(trashed.deletedAt).toBeTruthy()
    expect(await listDeals(db, a.orgId)).toEqual([])
    expect((await listDeals(db, a.orgId, { trashed: true })).map((d) => d.id)).toEqual([deal.id])
    await expect(getDealDetail(db, a.orgId, deal.id)).rejects.toMatchObject({ statusCode: 404 })
    // En la papelera no se mueve ni se vuelve a borrar.
    await expect(transitionDealStage(db, a.orgId, deal.id, 'notary', actor)).rejects.toMatchObject({ statusCode: 404 })
    await expect(trashDeal(db, a.orgId, deal.id, actor)).rejects.toMatchObject({ statusCode: 404 })

    const restored = await restoreDeal(db, a.orgId, deal.id, actor)
    expect(restored).toMatchObject({ id: deal.id, deletedAt: null, stage: 'financing', status: 'active' })
    expect((await listDeals(db, a.orgId)).map((d) => d.id)).toEqual([deal.id])
    const detail = await getDealDetail(db, a.orgId, deal.id)
    expect(detail.stageHistory.map((h: any) => h.toStage)).toEqual(['accepted_offer', 'financing'])

    const events = (await listActivity(db, a.orgId, { contactId: buyerId })).rows.map((r) => r.eventType)
    expect(events.filter((t) => t === 'DEAL_TRASHED')).toHaveLength(1)
    expect(events.filter((t) => t === 'DEAL_RESTORED')).toHaveLength(1)
    // Y, ya restaurada, en la cronología de la propia operación.
    expect((await listActivity(db, a.orgId, { dealId: deal.id })).rows.map((r) => r.eventType)).toEqual(expect.arrayContaining(['DEAL_TRASHED', 'DEAL_RESTORED']))
  })

  it('bloqueos (409): cerrada, o con reserva / arras vinculadas — y desvinculando se puede', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C1DealBlock')
    const { trashDeal, closeDeal, linkDealRecord, unlinkDealRecord, listDeals } = await import('../../server/utils/deals/service')
    const actor = { actorType: 'user' as const, actorId: a.userId }

    const closed = (await newDeal(db, a.orgId, a.projectId)).deal
    await closeDeal(db, a.orgId, closed.id, actor)
    await expect(trashDeal(db, a.orgId, closed.id, actor)).rejects.toMatchObject({ statusCode: 409, statusMessage: expect.stringContaining('cerrada') })

    const linked = (await newDeal(db, a.orgId, a.propertyId, 'agent')).deal
    const res = await reservation(db, a.orgId)
    const dep = await deposit(db, a.orgId)
    await linkDealRecord(db, a.orgId, linked.id, 'reservation', res.id, actor)
    await linkDealRecord(db, a.orgId, linked.id, 'deposit', dep.id, actor)
    // Con Finanzas se detalla; sin ella, sólo que hay documentos de Finanzas.
    await expect(trashDeal(db, a.orgId, linked.id, actor, { includeFinance: true })).rejects.toMatchObject({ statusCode: 409, statusMessage: expect.stringContaining('1 reserva y 1 arras / depósito') })
    const crmOnly = trashDeal(db, a.orgId, linked.id, actor, { includeFinance: false })
    await expect(crmOnly).rejects.toMatchObject({ statusCode: 409, statusMessage: expect.stringContaining('documentos de Finanzas') })
    await expect(trashDeal(db, a.orgId, linked.id, actor, { includeFinance: false })).rejects.not.toMatchObject({ statusMessage: expect.stringContaining('arras / depósito') })

    await unlinkDealRecord(db, a.orgId, linked.id, 'reservation', res.id, actor)
    await unlinkDealRecord(db, a.orgId, linked.id, 'deposit', dep.id, actor)
    await trashDeal(db, a.orgId, linked.id, actor)
    expect((await listDeals(db, a.orgId, { trashed: true })).map((d) => d.id)).toEqual([linked.id])
    // La cerrada sigue donde estaba.
    expect((await listDeals(db, a.orgId)).map((d) => d.id)).toEqual([closed.id])
  })

  it('una cancelada sí va a la papelera; su oferta sigue ocupada (409 que dice dónde está) y el detalle de la oferta lo sabe', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C1DealOffer')
    const { deal, offerId } = await newDeal(db, a.orgId, a.projectId)
    const { cancelDeal, trashDeal, restoreDeal, createDeal } = await import('../../server/utils/deals/service')
    const { getOfferWithRevisions } = await import('../../server/utils/offers/service')
    const actor = { actorType: 'user' as const, actorId: a.userId }

    await cancelDeal(db, a.orgId, deal.id, { ...actor, reason: 'Financiación denegada' })
    await trashDeal(db, a.orgId, deal.id, actor)
    await expect(createDeal(db, a.orgId, { acceptedOfferId: offerId })).rejects.toMatchObject({ statusCode: 409, statusMessage: expect.stringContaining('papelera') })
    expect((await getOfferWithRevisions(db, a.orgId, offerId)).offer).toMatchObject({ dealId: deal.id, dealTrashed: true })

    await restoreDeal(db, a.orgId, deal.id, actor)
    expect((await getOfferWithRevisions(db, a.orgId, offerId)).offer).toMatchObject({ dealId: deal.id, dealTrashed: false })
    await expect(createDeal(db, a.orgId, { acceptedOfferId: offerId })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Ya existe una operación para esta oferta' })
  })

  it('aislamiento: otra agencia no manda a la papelera, no restaura y no ve la papelera ajena (404)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C1DealIsoA')
    const b = await seedTenant(db, 'C1DealIsoB')
    const { deal } = await newDeal(db, a.orgId, a.projectId)
    const { trashDeal, restoreDeal, listDeals } = await import('../../server/utils/deals/service')
    const actorB = { actorType: 'user' as const, actorId: b.userId }

    await expect(trashDeal(db, b.orgId, deal.id, actorB)).rejects.toMatchObject({ statusCode: 404 })
    await trashDeal(db, a.orgId, deal.id, { actorType: 'user', actorId: a.userId })
    expect(await listDeals(db, b.orgId, { trashed: true })).toEqual([])
    await expect(restoreDeal(db, b.orgId, deal.id, actorB)).rejects.toMatchObject({ statusCode: 404 })
    const [row] = await db.select().from(schema.dealOperations).where(and(eq(schema.dealOperations.id, deal.id), eq(schema.dealOperations.organizationId, a.orgId)))
    expect(row.deletedAt).toBeTruthy()
  })

  it('POST /deal-operations { action: trash | restore } y GET ?trashed=1, con el permiso de Finanzas decidiendo el detalle del 409', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C1DealApi')
    const b = await seedTenant(db, 'C1DealApiB')
    const post = (await import('../../server/api/admin/saas/deal-operations.post')).default as any
    const get = (await import('../../server/api/admin/saas/deal-operations.get')).default as any
    const { linkDealRecord } = await import('../../server/utils/deals/service')
    const { deal } = await newDeal(db, a.orgId, a.projectId)
    const withDeposit = (await newDeal(db, a.orgId, a.propertyId, 'agent')).deal
    await linkDealRecord(db, a.orgId, withDeposit.id, 'deposit', (await deposit(db, a.orgId)).id, { actorType: 'user', actorId: a.userId })
    const crmOnly = adminUser(a.userId, JSON.stringify(['crm:write']))

    await expect(post(ev(db, a.orgId, crmOnly, { body: { id: withDeposit.id, action: 'trash' } }))).rejects.toMatchObject({ statusCode: 409, statusMessage: expect.stringContaining('Finanzas') })
    await expect(post(ev(db, b.orgId, adminUser(b.userId), { body: { id: deal.id, action: 'trash' } }))).rejects.toMatchObject({ statusCode: 404 })
    expect(await post(ev(db, a.orgId, crmOnly, { body: { id: deal.id, action: 'trash' } }))).toMatchObject({ id: deal.id, deletedAt: expect.any(String) })

    const trash = await get(ev(db, a.orgId, adminUser(a.userId), { query: { trashed: '1' } }))
    expect(trash.rows.map((r: any) => r.id)).toEqual([deal.id])
    expect(trash.rows[0]).toMatchObject({ buyerName: expect.any(String), linkedRecords: 0 })
    expect((await get(ev(db, a.orgId, adminUser(a.userId), { query: {} }))).rows.map((r: any) => r.id)).toEqual([withDeposit.id])
    expect((await get(ev(db, b.orgId, adminUser(b.userId), { query: { trashed: '1' } }))).rows).toEqual([])

    expect(await post(ev(db, a.orgId, crmOnly, { body: { id: deal.id, action: 'restore' } }))).toMatchObject({ id: deal.id, deletedAt: null })
    expect((await get(ev(db, a.orgId, adminUser(a.userId), { query: { trashed: '1' } }))).rows).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Lo que el editor inline valida antes de llamar al servidor
// ---------------------------------------------------------------------------

describe('C1 · validación inmediata del precio en la fila', () => {
  it('lee números escritos a la española y rechaza lo que no lo es', async () => {
    const { parseInlineNumber } = await import('../../utils/inlineEdit')
    expect(parseInlineNumber('450000')).toBe(450_000)
    expect(parseInlineNumber('450.000')).toBe(450_000)
    expect(parseInlineNumber('1.250.000,50')).toBe(1_250_000.5)
    expect(parseInlineNumber('450000,5')).toBe(450_000.5)
    expect(parseInlineNumber('450000.5')).toBe(450_000.5)
    expect(parseInlineNumber(' 1 250 000 € ')).toBe(1_250_000)
    expect(parseInlineNumber('')).toBeNull()
    expect(parseInlineNumber('mucho')).toBeNull()
    expect(parseInlineNumber('4,5,6')).toBeNull()
  })

  it('el precio: obligatorio desde la fila, no negativo y con un tope de cordura', async () => {
    const { validateInlinePrice } = await import('../../utils/inlineEdit')
    expect(validateInlinePrice(480_000)).toBeNull()
    expect(validateInlinePrice(0)).toBeNull()
    expect(validateInlinePrice(null)).toMatch(/Indica un precio/)
    expect(validateInlinePrice(-1)).toMatch(/negativo/)
    expect(validateInlinePrice(5_000_000_000)).toMatch(/demasiado alto/)
  })
})
