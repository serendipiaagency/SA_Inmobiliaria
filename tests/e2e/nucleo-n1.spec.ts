import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Núcleo inmobiliario, bloque N1 (migración 0086): oficinas y equipos como
 * entidades, ficha ampliada de la propiedad (FASES 1-6), tipo/subtipo común a
 * los dos catálogos, campos condicionales, búsqueda de campos e histórico de
 * precios con precio anterior, usuario y motivo.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

const visible = (page: import('@playwright/test').Page, testId: string) => page.locator(`[data-testid="${testId}"]:visible`)
const step = (page: import('@playwright/test').Page, key: string) => visible(page, `property-editor-step-${key}`)

test.describe('N1 — oficinas, equipos y ficha ampliada', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
  })

  test('oficinas y equipos: alta, nombre único, papelera y restaurar; y nunca se cruzan entre agencias', async () => {
    const name = `Oficina Centro ${RUN}`
    const office = await a.post('/api/admin/offices', { data: { name, city: 'Málaga', timezone: 'Europe/Madrid' } })
    expect(office.ok(), await office.text()).toBeTruthy()
    const officeId = (await office.json()).id
    cleanup.push(() => a.delete(`/api/admin/offices/${officeId}?hard=1`))

    // Mismo nombre entre oficinas vivas: 409 legible, no un 500 de D1.
    const dup = await a.post('/api/admin/offices', { data: { name } })
    expect(dup.status()).toBe(409)
    // Zona horaria inventada: 422.
    expect((await a.post('/api/admin/offices', { data: { name: `${name} 2`, timezone: 'Marte/Olympus' } })).status()).toBe(422)

    const team = await a.post('/api/admin/teams', { data: { name: `Equipo Lujo ${RUN}`, officeId } })
    expect(team.ok(), await team.text()).toBeTruthy()
    const teamId = (await team.json()).id
    cleanup.push(() => a.delete(`/api/admin/teams/${teamId}?hard=1`))

    // Otra agencia ni la ve ni la puede usar.
    expect((await b.get(`/api/admin/offices/${officeId}`)).status()).toBe(404)
    expect((await b.post('/api/admin/teams', { data: { name: `Intruso ${RUN}`, officeId } })).status()).toBe(404)

    // Papelera: borrar la manda allí, el listado normal ya no la tiene y se restaura.
    expect((await a.delete(`/api/admin/offices/${officeId}`)).ok()).toBeTruthy()
    const live = await (await a.get('/api/admin/offices', { params: { q: name } })).json()
    expect(live.rows.map((r: any) => r.id)).not.toContain(officeId)
    const trashed = await (await a.get('/api/admin/offices', { params: { q: name, trashed: 1 } })).json()
    expect(trashed.rows.map((r: any) => r.id)).toContain(officeId)
    expect((await a.post(`/api/admin/offices/${officeId}/restore`)).ok()).toBeTruthy()
  })

  test('la ficha ampliada se guarda en el alta y en la edición, valida tipo↔subtipo y la oficina ajena', async () => {
    const officeB = await b.post('/api/admin/offices', { data: { name: `Oficina B ${RUN}` } })
    const officeBId = (await officeB.json()).id
    cleanup.push(() => b.delete(`/api/admin/offices/${officeBId}?hard=1`))

    // Subtipo de otro tipo: 422 antes de crear nada.
    const mismatch = await a.post('/api/admin/properties', { data: { slug: `n1-bad-${RUN}`, propertyType: 'Retail', subtype: 'penthouse_duplex', price: 1 } })
    expect(mismatch.status()).toBe(422)
    // Oficina de otra agencia: 404, como cualquier referencia ajena.
    const foreign = await a.post('/api/admin/properties', { data: { slug: `n1-foreign-${RUN}`, propertyType: 'Apartment', officeId: officeBId, price: 1 } })
    expect(foreign.status()).toBe(404)

    const created = await a.post('/api/admin/properties', {
      data: { slug: `n1-ok-${RUN}`, propertyType: 'Penthouse', subtype: 'penthouse_duplex', price: 500000, area: 100, heating: 'central', ibiAnnual: 640, cadastralReference: '9872023VH5797S0001WX' },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    const id = (await created.json()).id
    cleanup.push(() => a.delete(`/api/admin/properties/${id}`))

    let row = (await (await a.get(`/api/admin/properties/${id}`)).json()).row
    expect(row).toMatchObject({ subtype: 'penthouse_duplex', heating: 'central', ibiAnnual: 640, cadastralReference: '9872023VH5797S0001WX' })

    // Cambiar el tipo vacía un subtipo que ya no le corresponde; el resto de la ficha se queda.
    expect((await a.put(`/api/admin/properties/${id}`, { data: { propertyType: 'Retail' } })).ok()).toBeTruthy()
    row = (await (await a.get(`/api/admin/properties/${id}`)).json()).row
    expect(row.subtype).toBeNull()
    expect(row.heating).toBe('central')

    // Otra agencia no ve la ficha (ni, por tanto, su parte legal).
    expect((await b.get(`/api/admin/properties/${id}`)).status()).toBe(404)
  })

  test('editor: buscar un campo, condicionales por operación, subtipos por tipo y precio con motivo en el histórico', async ({ page }) => {
    const created = await a.post('/api/admin/properties', {
      data: { slug: `n1-editor-${RUN}`, propertyType: 'Penthouse', transactionType: 'sale', price: 400000, area: 100, city: 'E2E-N1' },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    const id = (await created.json()).id
    cleanup.push(() => a.delete(`/api/admin/properties/${id}`))

    await page.goto(`/admin/properties/${id}`)
    await expect(page.getByTestId('property-editor-steps')).toBeVisible()

    // Subtipo: sólo los del tipo elegido, en castellano.
    await expect(page.locator('[data-field="subtype"] select option[value="penthouse_duplex"]')).toHaveText('Ático dúplex')
    await expect(page.locator('[data-field="subtype"] select option[value="loft"]')).toHaveCount(0)

    // Buscar «IBI» lleva al paso Precio y deja el campo a la vista.
    await page.getByTestId('property-field-search').locator('input').fill('IBI')
    await page.getByTestId('property-field-search').getByRole('button', { name: /IBI/ }).click()
    await expect(visible(page, 'property-editor-section-title')).toHaveText('Precio')
    await expect(page.locator('[data-field="ibiAnnual"] input')).toBeVisible()

    // Precio por m² calculado (400.000 / 100).
    // Con su unidad en la moneda de la agencia (cierre D1p / D3b): «4000 AED/m²», «4000 €/m²»…
    await expect(page.locator('[data-field="pricePerSquareMeter"] [data-computed]')).toHaveText(/^4000 \S+\/m²$/)

    // Venta: precio mínimo autorizado sí, fianza no. Alquiler: al revés.
    await expect(page.locator('[data-field="priceMinAuthorized"] input')).toBeVisible()
    await expect(page.locator('[data-field="rentDeposit"]')).toHaveCount(0)

    // Precio nuevo con motivo + IBI: autoguardado, sin pulsar Guardar.
    await page.locator('[data-field="ibiAnnual"] input').fill('512')
    await page.locator('[data-field="priceChangeReason"] input').fill('Ajuste tras visitas')
    await page.locator('[data-field="price"] input').fill('380000')
    await expect(page.getByTestId('property-editor-save-state')).toHaveText('Guardado', { timeout: 6000 })

    const after = await (await a.get(`/api/admin/properties/${id}`)).json()
    expect(after.row.price).toBe(380000)
    expect(after.row.ibiAnnual).toBe(512)
    expect(after.priceHistory[0]).toMatchObject({ price: 380000, previousPrice: 400000, reason: 'Ajuste tras visitas' })
    expect(after.priceHistory[0].changedByName).toBeTruthy()
    await expect(page.getByTestId('property-price-history-reason').first()).toHaveText('Ajuste tras visitas')

    // Pasar a alquiler enseña fianza y depósito y esconde los precios de venta.
    await step(page, 'info').click()
    await page.locator('[data-field="transactionType"] select').selectOption('rent')
    await step(page, 'price').click()
    await expect(page.locator('[data-field="rentDeposit"] input')).toBeVisible()
    await expect(page.locator('[data-field="priceMinAuthorized"]')).toHaveCount(0)
  })

  test('el listado genérico de Oficinas enseña la papelera y nombra las relaciones', async ({ page }) => {
    const office = await a.post('/api/admin/offices', { data: { name: `Oficina Lista ${RUN}` } })
    const officeId = (await office.json()).id
    cleanup.push(() => a.delete(`/api/admin/offices/${officeId}?hard=1`))
    const team = await a.post('/api/admin/teams', { data: { name: `Equipo Lista ${RUN}`, officeId } })
    const teamId = (await team.json()).id
    cleanup.push(() => a.delete(`/api/admin/teams/${teamId}?hard=1`))

    await page.goto('/admin/teams')
    const row = page.locator('tr', { hasText: `Equipo Lista ${RUN}` })
    // La columna Oficina enseña el nombre, no el id.
    await expect(row.locator('[data-field="officeId"]')).toHaveText(`Oficina Lista ${RUN}`)
    await expect(page.getByTestId('resource-trash-toggle')).toBeVisible()
  })
})
