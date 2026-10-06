import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Cierre C1 del núcleo inmobiliario, sobre HTTP real y en el panel:
 *
 *  - FASE 25 — edición inline en el listado de propiedades de los dos
 *    catálogos (precio, estado y comercial desde la fila): es el MISMO
 *    `PUT /api/admin/<recurso>/:id` del editor, así que el cambio de precio
 *    deja una fila en el histórico, y estado/precio se validan (422). Y fase
 *    y comercial en la Tabla de Leads, por las rutas del Kanban.
 *  - FASE 22 — la papelera de Tareas: verla y «Restaurar» (PATCH
 *    `{ deleted: false }`, GET `?trashed=1`).
 *  - FASE 24 — mandar una operación a la papelera y restaurarla
 *    (POST `{ action: 'trash' | 'restore' }`, GET `?trashed=1`), con sus
 *    bloqueos (cerrada, documentos vinculados → 409).
 *
 * Nada cruza de agencia (404) y sin sesión no se entra (401). Ninguna ruta
 * nueva: el presupuesto de rutas de Nitro está agotado.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('Cierre C1 — edición inline, papelera de tareas y de operaciones', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let developerId: number
  let commercialId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    // Dentro de un describe con `storageState`, un contexto nuevo hereda la sesión: el anónimo la vacía a propósito.
    anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } })

    const dev = await a.post('/api/admin/developers', { data: { name: `Dev C1 ${RUN}`, email: `dev-c1-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))

    const team = await a.post('/api/admin/team', { data: { name: `Comercial C1 ${RUN}`, email: `comercial-c1-${RUN}@example.com`, position: 'Comercial', slug: `comercial-c1-${RUN}` } })
    expect(team.ok(), await team.text()).toBeTruthy()
    commercialId = (await team.json()).id
    cleanup.push(() => a.delete(`/api/admin/team/${commercialId}`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
    await anon?.dispose()
  })

  async function createDeveloperProperty(name: string) {
    const res = await a.post('/api/admin/developer-properties', { data: { developerId, name, status: 'new', price: 500000, transactionType: 'sale', city: 'E2E-C1' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    return id
  }

  async function createAgentProperty(slug: string) {
    const res = await a.post('/api/admin/properties', { data: { slug, price: 300000, transactionType: 'sale', status: 'available', city: 'E2E-C1' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/properties/${id}?hard=1`))
    return id
  }

  async function seedContact(tag: string) {
    const res = await a.post('/api/admin/saas/contacts', { data: { name: `C1 ${tag} ${RUN}`, email: `c1-${tag}-${RUN}@example.com` } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).id as number
  }

  async function newDeal(propertyId: number, tag: string) {
    const buyerContactId = await seedContact(tag)
    const offer = await (await a.post('/api/admin/saas/offers', { data: { propertyId, propertyKind: 'developer', buyerContactId, amount: 450000 } })).json()
    await a.post(`/api/admin/saas/offers/${offer.id}/submit`, { data: {} })
    await a.post(`/api/admin/saas/offers/${offer.id}/accept`, { data: {} })
    const res = await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: offer.id } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return { deal: await res.json(), offerId: offer.id as number }
  }

  // ---------------------------------------------------------------------------
  // FASE 25 — edición inline
  // ---------------------------------------------------------------------------

  test('API: el PUT de la fila deja una fila en el histórico de precios (una por cambio real) y valida estado y precio en los dos catálogos', async () => {
    const devId = await createDeveloperProperty(`Torre C1 API ${RUN}`)
    const agentId = await createAgentProperty(`c1-api-${RUN}`)

    for (const [resource, id, okStatus, badStatus] of [
      ['developer-properties', devId, 'ready', 'sold'],
      ['properties', agentId, 'sold', 'ready'],
    ] as const) {
      const put = (data: Record<string, unknown>) => a.put(`/api/admin/${resource}/${id}`, { data })
      const history = async () => (await (await a.get(`/api/admin/${resource}/${id}`)).json()).priceHistory as any[]
      const before = (await history()).length

      const changed = await put({ price: 420000 })
      expect(changed.ok(), await changed.text()).toBeTruthy()
      // El mismo precio otra vez (p. ej. Enter dos veces) no fabrica otra fila.
      expect((await put({ price: 420000 })).ok()).toBeTruthy()
      const rows = await history()
      expect(rows.length, `${resource}: una sola fila nueva`).toBe(before + 1)
      expect(rows[0]).toMatchObject({ price: 420000 })

      expect((await put({ price: -1 })).status(), `${resource}: precio negativo`).toBe(422)
      expect((await put({ status: badStatus })).status(), `${resource}: estado de otro catálogo`).toBe(422)
      expect((await history()).length).toBe(before + 1)
      expect((await put({ status: okStatus })).ok()).toBeTruthy()
      expect((await put({ agentId: commercialId })).ok()).toBeTruthy()

      const { row } = await (await a.get(`/api/admin/${resource}/${id}`)).json()
      expect(row).toMatchObject({ price: 420000, status: okStatus, agentId: commercialId })

      // Otra agencia no toca la fila; sin sesión, tampoco.
      expect((await b.put(`/api/admin/${resource}/${id}`, { data: { price: 1 } })).status()).toBe(404)
      expect((await anon.put(`/api/admin/${resource}/${id}`, { data: { price: 1 } })).status()).toBe(401)
    }
  })

  test('panel: precio, estado y comercial se editan desde la fila del listado (Enter guarda, Esc cancela, error visible)', async ({ page }) => {
    const name = `Torre C1 Inline ${RUN}`
    const id = await createDeveloperProperty(name)
    await page.addInitScript(() => localStorage.setItem('sa-admin-developer-properties-view', 'list'))
    await page.goto(`/admin/developer-properties?q=${encodeURIComponent(name)}`)
    const row = page.locator('tbody tr', { hasText: name })
    await expect(row).toBeVisible()

    // Precio: validación inmediata, Esc no guarda nada.
    await page.getByTestId(`property-inline-price-${id}-open`).click()
    const price = page.getByTestId(`property-inline-price-${id}-input`)
    await price.fill('-5')
    await expect(page.getByTestId(`property-inline-price-${id}-error`)).toContainText('negativo')
    await price.press('Escape')
    await expect(page.getByTestId(`property-inline-price-${id}-input`)).toHaveCount(0)
    expect((await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row.price).toBe(500000)

    // Enter guarda, a la española, y queda en el histórico.
    await page.getByTestId(`property-inline-price-${id}-open`).click()
    await price.fill('455.000')
    await price.press('Enter')
    await expect(page.getByTestId(`property-inline-price-${id}-open`)).toContainText('455.000')
    const detail = await (await a.get(`/api/admin/developer-properties/${id}`)).json()
    expect(detail.row.price).toBe(455000)
    expect(detail.priceHistory[0]).toMatchObject({ price: 455000, previousPrice: 500000 })

    // Estado y comercial: se elige y se guarda.
    await page.getByTestId(`property-inline-status-${id}-open`).click()
    await page.getByTestId(`property-inline-status-${id}-input`).selectOption('under_construction')
    await expect(page.getByTestId(`property-inline-status-${id}-open`)).toContainText('En construcción')
    await page.getByTestId(`property-inline-agent-${id}-open`).click()
    await page.getByTestId(`property-inline-agent-${id}-input`).selectOption(String(commercialId))
    await expect(page.getByTestId(`property-inline-agent-${id}-open`)).toContainText(`Comercial C1 ${RUN}`)
    expect((await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row).toMatchObject({ status: 'under_construction', agentId: commercialId })
  })

  test('panel: fase y comercial desde la Tabla de Leads, con el historial de fases y el motivo de «Perdido» como en el Kanban', async ({ page }) => {
    const name = `Lead C1 ${RUN}`
    const created = await a.post('/api/admin/leads', { data: { name, email: `lead-c1-${RUN}@example.com`, source: 'web', force: true } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const leadId = (await created.json()).id as number

    await page.goto('/admin/leads?view=table')
    await page.getByPlaceholder(/Buscar por nombre, email o propiedad/).fill(name)
    await expect(page.locator('tbody tr', { hasText: name })).toBeVisible()

    await page.getByTestId(`lead-inline-stage-${leadId}-open`).click()
    await page.getByTestId(`lead-inline-stage-${leadId}-input`).selectOption('qualified')
    // El cambio de fase pide su motivo (cierre del núcleo, FASE 13).
    await page.getByTestId('lead-stage-reason-text').fill('Presupuesto confirmado por teléfono')
    await page.getByTestId('lead-stage-reason-confirm').click()
    await expect(page.getByTestId(`lead-inline-stage-${leadId}-open`)).toContainText('Cualificados')

    // «Perdido» pide el motivo (mismo modal que el Kanban).
    await page.getByTestId(`lead-inline-stage-${leadId}-open`).click()
    await page.getByTestId(`lead-inline-stage-${leadId}-input`).selectOption('lost')
    await page.getByTestId('lead-lost-reason-no_response').check()
    await page.getByTestId('lead-lost-confirm').click()
    await expect(page.getByTestId(`lead-inline-stage-${leadId}-open`)).toContainText('Perdido')

    await page.getByTestId(`lead-inline-agent-${leadId}-open`).click()
    await page.getByTestId(`lead-inline-agent-${leadId}-input`).selectOption(String(commercialId))
    await expect(page.getByTestId(`lead-inline-agent-${leadId}-open`)).toContainText(`Comercial C1 ${RUN}`)

    const detail = await (await a.get(`/api/admin/leads/${leadId}`)).json()
    expect(detail.row).toMatchObject({ stage: 'qualified', status: 'lost', agentId: commercialId })
    expect(detail.stageHistory.map((h: any) => h.toStage)).toEqual(expect.arrayContaining(['qualified', 'lost']))
    expect(detail.assignmentHistory.some((h: any) => h.toCommercialId === commercialId)).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // FASE 22 — papelera de tareas
  // ---------------------------------------------------------------------------

  test('tareas: la papelera se lista con ?trashed=1, se restaura con { deleted: false }, deja actividad y no cruza de agencia', async () => {
    const contactId = await seedContact('task')
    const task = await (await a.post('/api/admin/saas/tasks', { data: { type: 'call', title: `Tarea C1 ${RUN}`, contactId, priority: 'high' } })).json()
    expect((await a.patch(`/api/admin/saas/tasks/${task.id}`, { data: { deleted: true } })).ok()).toBeTruthy()

    const ids = async (ctx: APIRequestContext, query: Record<string, string>) => ((await (await ctx.get('/api/admin/saas/tasks', { params: query })).json()).rows || []).map((r: any) => r.id)
    expect(await ids(a, { status: 'active' })).not.toContain(task.id)
    expect(await ids(a, { trashed: '1' })).toContain(task.id)
    expect(await ids(b, { trashed: '1' })).not.toContain(task.id)

    expect((await b.patch(`/api/admin/saas/tasks/${task.id}`, { data: { deleted: false } })).status()).toBe(404)
    expect((await anon.patch(`/api/admin/saas/tasks/${task.id}`, { data: { deleted: false } })).status()).toBe(401)
    const restored = await a.patch(`/api/admin/saas/tasks/${task.id}`, { data: { deleted: false } })
    expect(restored.ok(), await restored.text()).toBeTruthy()
    expect(await restored.json()).toMatchObject({ id: task.id, deletedAt: null, priority: 'high', status: 'open' })
    expect(await ids(a, { status: 'active' })).toContain(task.id)

    const activity = await (await a.get('/api/admin/saas/activity', { params: { contactId: String(contactId) } })).json()
    const types = activity.rows.map((r: any) => r.eventType)
    expect(types).toEqual(expect.arrayContaining(['TASK_TRASHED', 'TASK_RESTORED']))
  })

  test('panel: Tareas → Papelera → Restaurar', async ({ page }) => {
    const task = await (await a.post('/api/admin/saas/tasks', { data: { type: 'email', title: `Tarea C1 panel ${RUN}` } })).json()
    expect((await a.patch(`/api/admin/saas/tasks/${task.id}`, { data: { deleted: true } })).ok()).toBeTruthy()

    await page.goto('/admin/tareas')
    await page.getByTestId('tasks-trash-toggle').click()
    await expect(page).toHaveURL(/bucket=trash/)
    await expect(page.getByTestId('tasks-trash-notice')).toBeVisible()
    const row = page.getByTestId(`task-row-${task.id}`)
    await expect(row).toBeVisible()
    await page.getByTestId(`task-restore-${task.id}`).click()
    await expect(page.getByTestId(`task-row-${task.id}`)).toHaveCount(0)

    await page.getByTestId('tasks-trash-toggle').click()
    await expect(page.getByTestId(`task-row-${task.id}`)).toBeVisible()
    // Restaurada, se vuelve a trabajar con ella como con cualquier otra.
    await page.getByTestId(`task-status-${task.id}`).selectOption('cancelled')
    await expect(page.getByText('Tarea: cancelada')).toBeVisible()
    expect((await (await a.get('/api/admin/saas/tasks', { params: { status: 'cancelled' } })).json()).rows.map((r: any) => r.id)).toContain(task.id)
  })

  // ---------------------------------------------------------------------------
  // FASE 24 — papelera de operaciones
  // ---------------------------------------------------------------------------

  test('operaciones: papelera y restaurar por API; cerrada o con contrato vinculado = 409; su oferta lo sabe; otra agencia 404', async () => {
    const propertyId = await createDeveloperProperty(`Torre C1 Deals ${RUN}`)
    const { deal, offerId } = await newDeal(propertyId, 'deal-a')
    const post = (ctx: APIRequestContext, data: Record<string, unknown>) => ctx.post('/api/admin/saas/deal-operations', { data })
    const ids = async (query: Record<string, string>) => ((await (await a.get('/api/admin/saas/deal-operations', { params: query })).json()).rows || []).map((r: any) => r.id)

    expect((await post(b, { id: deal.id, action: 'trash' })).status()).toBe(404)
    expect((await post(anon, { id: deal.id, action: 'trash' })).status()).toBe(401)
    const trashed = await post(a, { id: deal.id, action: 'trash' })
    expect(trashed.ok(), await trashed.text()).toBeTruthy()
    expect(await ids({})).not.toContain(deal.id)
    expect(await ids({ trashed: '1' })).toContain(deal.id)
    expect((await a.get('/api/admin/saas/deal-operations', { params: { id: String(deal.id) } })).status()).toBe(404)

    // La oferta sigue ocupada y lo dice.
    const again = await post(a, { acceptedOfferId: offerId })
    expect(again.status()).toBe(409)
    expect(await again.text()).toContain('papelera')
    expect((await (await a.get(`/api/admin/saas/offers/${offerId}`)).json()).offer).toMatchObject({ dealId: deal.id, dealTrashed: true })

    expect((await post(b, { id: deal.id, action: 'restore' })).status()).toBe(404)
    const restored = await post(a, { id: deal.id, action: 'restore' })
    expect(restored.ok(), await restored.text()).toBeTruthy()
    expect(await ids({})).toContain(deal.id)
    const activity = await (await a.get('/api/admin/saas/activity', { params: { dealId: String(deal.id) } })).json()
    expect(activity.rows.map((r: any) => r.eventType)).toEqual(expect.arrayContaining(['DEAL_TRASHED', 'DEAL_RESTORED']))

    // Con un contrato vinculado no va a la papelera (409 con el motivo); desvinculado, sí.
    const template = await (await a.post('/api/admin/saas/contract-templates', { data: { name: `Arras C1 ${RUN}`, type: 'arras', bodyTemplate: 'Arras de {{client.name}}' } })).json()
    const contract = await (await a.post('/api/admin/saas/contracts', { data: { templateId: template.id, title: `Arras C1 ${RUN}`, clientName: 'Compradora' } })).json()
    expect((await post(a, { id: deal.id, action: 'link', kind: 'contract', recordId: contract.id })).ok()).toBeTruthy()
    const blocked = await post(a, { id: deal.id, action: 'trash' })
    expect(blocked.status()).toBe(409)
    expect(await blocked.text()).toContain('contrato')
    expect((await post(a, { id: deal.id, action: 'unlink', kind: 'contract', recordId: contract.id })).ok()).toBeTruthy()

    // Cerrada: nunca.
    const closed = (await newDeal(propertyId, 'deal-closed')).deal
    expect((await post(a, { id: closed.id, action: 'close' })).ok()).toBeTruthy()
    const closedTrash = await post(a, { id: closed.id, action: 'trash' })
    expect(closedTrash.status()).toBe(409)
    expect(await closedTrash.text()).toContain('cerrada')
  })

  test('panel: «Mandar a la papelera» en la ficha, la papelera (también a 375 px) y «Restaurar»', async ({ page }) => {
    const propertyId = await createDeveloperProperty(`Torre C1 Panel ${RUN}`)
    const { deal } = await newDeal(propertyId, 'deal-panel')

    await page.goto(`/admin/deal-operations/${deal.id}`)
    await page.getByTestId('deal-trash').click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('¿Mandar la operación a la papelera?')
    await dialog.getByRole('button', { name: 'Mandar a la papelera' }).click()
    await expect(page).toHaveURL(/\/admin\/deal-operations$/)
    await expect(page.getByTestId(`deal-card-${deal.id}`)).toHaveCount(0)

    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByTestId('deals-trash-toggle').click()
    await expect(page).toHaveURL(/trashed=1/)
    await expect(page.getByTestId('deals-trash-notice')).toBeVisible()
    const row = page.getByTestId(`deal-trash-row-${deal.id}`)
    await expect(row).toBeVisible()
    await expect(row).toContainText('Borrada el')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, 'la papelera de operaciones no debe desplazarse en horizontal a 375 px').toBeLessThanOrEqual(1)

    await page.getByTestId(`deal-restore-${deal.id}`).click()
    await expect(page.getByTestId(`deal-trash-row-${deal.id}`)).toHaveCount(0)
    await page.getByTestId('deals-trash-toggle').click()
    await expect(page.getByTestId(`deal-card-${deal.id}`)).toBeVisible()
  })
})
