import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Núcleo inmobiliario, bloque N6 (FASES 21-24): tareas editables de punta a
 * punta (estado «en curso», relaciones, papelera), ofertas con contraoferta
 * y nueva oferta completas e historial inmutable, operaciones con oficina,
 * Kanban por etapas e historial, vínculo con contratos y la cronología de
 * la operación — y nada cruza de agencia (404).
 *
 * Todo por las rutas que ya existían (presupuesto de rutas de Nitro = 0):
 * PATCH /tasks/:id (`deleted: true`), POST /offers/:id/counter
 * (`kind: 'new_offer'`), GET|POST /deal-operations (`action: 'update' |
 * 'link' | 'unlink'`) y GET /activity (`dealId`, `eventTypes`).
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('N6 — actividad, tareas, ofertas y operaciones', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let developerPropertyId: number
  let agentPropertyId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })

    const dev = await (await a.post('/api/admin/developers', { data: { name: `Dev N6 ${RUN}`, email: `dev-n6-${RUN}@mm.test`, status: 'active' } })).json()
    developerPropertyId = (await (await a.post('/api/admin/developer-properties', { data: { developerId: dev.id, name: `Torre N6 ${RUN}`, status: 'new', price: 500000, transactionType: 'sale' } })).json()).id
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${developerPropertyId}`))
    agentPropertyId = (await (await a.post('/api/admin/properties', { data: { slug: `e2e-n6-${RUN}`, price: 300000, transactionType: 'sale', status: 'available' } })).json()).id
    cleanup.push(() => a.delete(`/api/admin/properties/${agentPropertyId}`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
  })

  async function seedContact(ctx: APIRequestContext, tag: string) {
    const res = await ctx.post('/api/admin/saas/contacts', { data: { name: `N6 ${tag} ${RUN}`, email: `n6-${tag}-${RUN}@example.com` } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).id as number
  }

  async function acceptedOfferAndDeal(buyerContactId: number) {
    const offer = await (await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, amount: 450000 } })).json()
    await a.post(`/api/admin/saas/offers/${offer.id}/submit`, { data: {} })
    await a.post(`/api/admin/saas/offers/${offer.id}/accept`, { data: {} })
    const deal = await (await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: offer.id } })).json()
    expect(deal.id).toBeTruthy()
    return deal
  }

  test('tareas: crear con relaciones, editar todo (también «en curso»), referencias ajenas 404 y papelera', async () => {
    const contactId = await seedContact(a, 'tarea')
    const foreignContactId = await seedContact(b, 'tarea-ajena')
    const lead = await (await a.post('/api/admin/leads', { data: { name: `Lead N6 ${RUN}`, email: `lead-n6-${RUN}@example.com`, source: 'call' } })).json()

    const created = await a.post('/api/admin/saas/tasks', { data: { type: 'call', title: 'Llamar N6', contactId, leadId: lead.id, propertyId: agentPropertyId, propertyKind: 'agent', dueAt: '2031-01-10 10:00:00' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const task = await created.json()

    const edited = await a.patch(`/api/admin/saas/tasks/${task.id}`, { data: { title: 'Preparar dossier', type: 'document', priority: 'high', status: 'in_progress', propertyId: developerPropertyId, propertyKind: 'developer' } })
    expect(edited.ok(), await edited.text()).toBeTruthy()
    expect(await edited.json()).toMatchObject({ title: 'Preparar dossier', type: 'document', priority: 'high', status: 'in_progress', propertyId: developerPropertyId, propertyKind: 'developer' })

    const { rows } = await (await a.get('/api/admin/saas/tasks', { params: { status: 'active', contactId: String(contactId) } })).json()
    expect(rows.map((r: any) => r.id)).toContain(task.id)
    expect(rows.find((r: any) => r.id === task.id)).toMatchObject({ leadName: `Lead N6 ${RUN}`, contactName: `N6 tarea ${RUN}` })

    // La próxima acción del lead lleva su tipo.
    const leadDetail = await (await a.get(`/api/admin/leads/${lead.id}`)).json()
    expect(leadDetail.row).toMatchObject({ nextActionType: 'task:document', nextActionAt: '2031-01-10 10:00:00' })

    expect((await a.patch(`/api/admin/saas/tasks/${task.id}`, { data: { contactId: foreignContactId } })).status()).toBe(404)
    expect((await a.post('/api/admin/saas/tasks', { data: { type: 'call', title: 'Ajena', contactId: foreignContactId } })).status()).toBe(404)
    expect((await b.patch(`/api/admin/saas/tasks/${task.id}`, { data: { title: 'intruso' } })).status()).toBe(404)
    expect((await b.patch(`/api/admin/saas/tasks/${task.id}`, { data: { deleted: true } })).status()).toBe(404)

    expect((await a.patch(`/api/admin/saas/tasks/${task.id}`, { data: { deleted: true } })).ok()).toBeTruthy()
    const after = await (await a.get('/api/admin/saas/tasks', { params: { contactId: String(contactId) } })).json()
    expect(after.rows.map((r: any) => r.id)).not.toContain(task.id)
    expect((await (await a.get(`/api/admin/leads/${lead.id}`)).json()).row.nextActionType).toBeNull()
  })

  test('ofertas: vendedor, financiación y vencimiento; contraoferta y nueva oferta completas; historial inmutable; otra agencia 404', async () => {
    const buyerContactId = await seedContact(a, 'compradora')
    const sellerContactId = await seedContact(a, 'vendedor')
    const create = await a.post('/api/admin/saas/offers', {
      data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, sellerContactIds: [sellerContactId], amount: 400000, conditions: 'Entrega en 3 meses', financeCondition: 'mortgage_subject', expiration: '2031-06-30' },
    })
    expect(create.ok(), await create.text()).toBeTruthy()
    const offer = await create.json()
    expect(offer.expiration).toBe('2031-06-30 23:59:59')

    expect((await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, amount: 1, financeCondition: 'trueque' } })).status()).toBe(422)

    await a.post(`/api/admin/saas/offers/${offer.id}/submit`, { data: {} })
    const countered = await (await a.post(`/api/admin/saas/offers/${offer.id}/counter`, { data: { amount: 430000, conditions: 'Sin mobiliario', financeCondition: 'mortgage_approved', expiration: '2031-07-15', actorType: 'seller' } })).json()
    expect(countered).toMatchObject({ status: 'countered', currentAmount: 430000, currentFinanceCondition: 'mortgage_approved' })
    const renewed = await (await a.post(`/api/admin/saas/offers/${offer.id}/counter`, { data: { kind: 'new_offer', amount: 415000, conditions: 'Con cocina', financeCondition: 'cash', expiration: '2031-07-31' } })).json()
    expect(renewed).toMatchObject({ status: 'submitted', currentAmount: 415000, currentFinanceCondition: 'cash' })

    const detail = await (await a.get(`/api/admin/saas/offers/${offer.id}`)).json()
    const accepted = await a.post(`/api/admin/saas/offers/${offer.id}/accept`, { data: { revisionId: detail.offer.currentRevisionId, actorType: 'seller' } })
    expect(accepted.ok(), await accepted.text()).toBeTruthy()

    const { offer: final, revisions } = await (await a.get(`/api/admin/saas/offers/${offer.id}`)).json()
    expect(revisions.map((r: any) => r.type)).toEqual(['created', 'submitted', 'countered', 'new_offer', 'accepted'])
    expect(revisions.map((r: any) => r.amount)).toEqual([400000, 400000, 430000, 415000, 415000])
    expect(revisions[2]).toMatchObject({ conditions: 'Sin mobiliario', financeCondition: 'mortgage_approved', actorType: 'seller' })
    expect(revisions[3]).toMatchObject({ conditions: 'Con cocina', financeCondition: 'cash', actorType: 'buyer' })
    expect(final).toMatchObject({ status: 'accepted', sellerContactIds: [sellerContactId] })

    // Listado global con filtros y panel por propiedad.
    const byProperty = await (await a.get('/api/admin/saas/offers', { params: { propertyId: String(developerPropertyId), propertyKind: 'developer', status: 'accepted' } })).json()
    expect(byProperty.rows.map((o: any) => o.id)).toContain(offer.id)
    expect(byProperty.rows.find((o: any) => o.id === offer.id)).toMatchObject({ buyerName: `N6 compradora ${RUN}`, sellers: [{ id: sellerContactId }] })

    expect((await b.get(`/api/admin/saas/offers/${offer.id}`)).status()).toBe(404)
    expect((await b.post(`/api/admin/saas/offers/${offer.id}/counter`, { data: { amount: 1 } })).status()).toBe(404)
  })

  test('operaciones: oficina editable y filtrable, Kanban con historial, contrato vinculado y su cronología; otra agencia 404', async () => {
    const buyerContactId = await seedContact(a, 'operacion')
    const deal = await acceptedOfferAndDeal(buyerContactId)

    const officeA = await (await a.post('/api/admin/offices', { data: { name: `Oficina N6 ${RUN}` } })).json()
    cleanup.push(() => a.delete(`/api/admin/offices/${officeA.id}?hard=1`))
    const officeB = await (await b.post('/api/admin/offices', { data: { name: `Oficina N6 B ${RUN}` } })).json()
    cleanup.push(() => b.delete(`/api/admin/offices/${officeB.id}?hard=1`))

    expect((await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'update', officeId: officeB.id } })).status()).toBe(404)
    expect((await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'update', officeId: officeA.id } })).ok()).toBeTruthy()
    const byOffice = await (await a.get('/api/admin/saas/deal-operations', { params: { officeId: String(officeA.id) } })).json()
    expect(byOffice.rows.map((d: any) => d.id)).toEqual([deal.id])
    expect(byOffice.rows[0]).toMatchObject({ officeName: `Oficina N6 ${RUN}` })

    // Kanban: mover de etapa con motivo; queda en el historial.
    const moved = await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'stage', toStage: 'reservation', reason: 'Reserva firmada' } })
    expect((await moved.json()).stage).toBe('reservation')
    const byStage = await (await a.get('/api/admin/saas/deal-operations', { params: { stage: 'reservation' } })).json()
    expect(byStage.rows.map((d: any) => d.id)).toContain(deal.id)

    // Contrato de la agencia vinculado; el de otra agencia, 404.
    const template = await (await a.post('/api/admin/saas/contract-templates', { data: { name: `Arras N6 ${RUN}`, type: 'arras', bodyTemplate: 'Arras de {{client.name}}' } })).json()
    const contract = await (await a.post('/api/admin/saas/contracts', { data: { templateId: template.id, title: `Arras N6 ${RUN}`, clientName: 'Compradora' } })).json()
    const templateB = await (await b.post('/api/admin/saas/contract-templates', { data: { name: `Arras B ${RUN}`, type: 'arras', bodyTemplate: 'x' } })).json()
    const contractB = await (await b.post('/api/admin/saas/contracts', { data: { templateId: templateB.id, title: `Arras B ${RUN}`, clientName: 'Otra' } })).json()

    expect((await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'link', kind: 'contract', recordId: contractB.id } })).status()).toBe(404)
    expect((await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'link', kind: 'contract', recordId: contract.id } })).ok()).toBeTruthy()
    expect((await b.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'link', kind: 'contract', recordId: contractB.id } })).status()).toBe(404)

    const detail = await (await a.get('/api/admin/saas/deal-operations', { params: { id: String(deal.id) } })).json()
    expect(detail.records.contracts.linked.map((c: any) => c.id)).toEqual([contract.id])
    expect(detail.stageHistory.map((h: any) => h.toStage)).toEqual(['accepted_offer', 'reservation'])
    expect(detail.stageHistory[1].reason).toBe('Reserva firmada')
    const contracts = await (await a.get('/api/admin/saas/contracts')).json()
    expect(contracts.find((c: any) => c.id === contract.id).dealOperationId).toBe(deal.id)

    const activity = await (await a.get('/api/admin/saas/activity', { params: { dealId: String(deal.id) } })).json()
    expect(activity.rows.map((r: any) => r.eventType)).toEqual(expect.arrayContaining(['DEAL_CREATED', 'DEAL_STAGE_CHANGED', 'DEAL_RECORD_LINKED', 'OFFER_ACCEPTED']))
    expect((await (await b.get('/api/admin/saas/activity', { params: { dealId: String(deal.id) } })).json()).rows).toEqual([])
    expect((await b.get('/api/admin/saas/deal-operations', { params: { id: String(deal.id) } })).status()).toBe(404)

    expect((await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'unlink', kind: 'contract', recordId: contract.id } })).ok()).toBeTruthy()
  })

  test('pantallas: Kanban de Operaciones, Ofertas y Tareas cargan, y el menú lleva a las nuevas', async ({ page }) => {
    await page.goto('/admin/deal-operations')
    await expect(page.getByRole('heading', { name: 'Operaciones' })).toBeVisible()
    await expect(page.getByTestId('deals-column-accepted_offer')).toBeVisible()
    await expect(page.getByTestId('deals-column-signature')).toBeVisible()

    await page.goto('/admin/ofertas')
    await expect(page.getByRole('heading', { name: 'Ofertas' })).toBeVisible()

    await page.goto('/admin/tareas')
    await expect(page.getByTestId('tasks-bucket')).toBeVisible()
    await expect(page.getByTestId('tasks-bucket').locator('option[value="in_progress"]')).toHaveText('En curso')

    // La pantalla antigua sigue en su URL, con su nuevo nombre.
    await page.goto('/admin/operaciones')
    await expect(page.getByRole('heading', { name: 'Cierres y comisiones' })).toBeVisible()
  })
})
