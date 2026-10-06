import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'
import { formatDisplayPrice, formatMoney } from '../../utils/currency'

/**
 * Cierre D3b de la auditoría del núcleo inmobiliario, sobre HTTP real, el
 * panel y la web pública:
 *
 * - FASE 5: la moneda de la agencia (Sistema → Configuración) es la fuente de
 *   verdad. El panel formatea con ella sin convertir; la web pública la toma
 *   como base (`/api/public/tenant`) y el selector del visitante convierte
 *   desde ella. Sólo códigos que la plataforma conoce.
 * - FASE 1/27: los tipos de la web salen del catálogo común, sólo los que la
 *   agencia tiene publicados (`facets=types`), con su rótulo en castellano.
 * - FASE 2: código postal en los filtros y «Buscar cerca de aquí» en el mapa;
 *   cuentan en la insignia y se guardan con la búsqueda. Geolocalización
 *   abierta sólo para el propio origen y sólo en la web pública.
 * - FASE 28: «Crear catálogo» con propiedades de 2ª mano, con el motor de
 *   Asset Export Studio: sólo las de la agencia (ajena = 404) y el PDF real.
 *
 * La agencia A es la de la web pública del dominio primario. Su moneda se
 * cambia durante la prueba y se deja como estaba al terminar.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const DIGITS = RUN.replace(/[^0-9]/g, '').slice(-6)

test.describe('Cierre D3b — moneda de la agencia, web pública y catálogo de 2ª mano', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let originalCurrency: string
  let developerId: number
  let devName: string
  let devId: number
  // Un punto en mitad del Atlántico: ningún otro spec pone nada ahí.
  const SPOT = { lat: 10.1234, lng: -40.5678 }
  const POSTAL = `Z${DIGITS}`
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    // Dentro de este describe, newContext() sin storageState heredaría la sesión de A.
    anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } })

    originalCurrency = (await (await a.get('/api/admin/active-org-info')).json()).currency

    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora D3b ${RUN}`, email: `d3b-dev-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))

    devName = `Ático D3b ${RUN}`
    const res = await a.post('/api/admin/developer-properties', {
      data: { developerId, name: devName, status: 'new', transactionType: 'sale', propertyType: 'Penthouse', price: 432100, area: 100, postalCode: POSTAL, lat: SPOT.lat, lng: SPOT.lng, community: `Zona D3b ${RUN}` },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    devId = (await res.json()).id
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${devId}?hard=1`))
  })

  test.afterAll(async () => {
    // La moneda de A, como estaba (AED si nunca se eligió: mismo comportamiento).
    await a?.post('/api/admin/saas/settings', { data: { currency: originalCurrency || 'AED' } }).catch(() => null)
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
    await anon?.dispose()
  })

  test('FASE 5 — la moneda de Configuración manda: sólo códigos conocidos, y el panel y la web la reciben', async () => {
    expect((await a.post('/api/admin/saas/settings', { data: { currency: 'XYZ' } })).status()).toBe(422)
    expect((await a.post('/api/admin/saas/settings', { data: { currency: 'eur' } })).ok()).toBeTruthy()
    expect((await (await a.get('/api/admin/saas/settings')).json()).currency).toBe('EUR')
    expect((await (await a.get('/api/admin/active-org-info')).json()).currency).toBe('EUR')
    expect((await (await anon.get('/api/public/tenant')).json()).currency).toBe('EUR')
    // La de A no es la de B.
    const infoB = await (await b.get('/api/admin/active-org-info')).json()
    expect(infoB.id).not.toBe((await (await a.get('/api/admin/active-org-info')).json()).id)
  })

  test('FASE 5 — el panel pinta el precio en la moneda de la agencia, sin convertir', async ({ page }) => {
    await page.goto('/admin/developer-properties')
    await page.getByPlaceholder(/Nombre, referencia, dirección/).fill(devName)
    await page.getByPlaceholder(/Nombre, referencia, dirección/).press('Enter')
    await expect(page.getByText(devName).first()).toBeVisible()
    await expect(page.getByText(formatMoney(432100, 'EUR')).first()).toBeVisible()
  })

  test('FASE 5 — la web toma la moneda de la agencia como base y el selector del visitante convierte desde ella', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await page.goto(`/propiedades?q=${encodeURIComponent(devName)}`)
    await expect(page.getByText(devName).first()).toBeVisible()
    // Sin elección del visitante: la base, tal cual («432.100 €»).
    await expect(page.getByText(formatDisplayPrice(432100, 'EUR', 'EUR')).first()).toBeVisible()
    // El visitante elige AED: convertido DESDE euros, no «desde AED».
    await context.addCookies([{ name: 'display_currency', value: 'AED', url: BASE_URL }])
    await page.reload()
    await expect(page.getByText(formatDisplayPrice(432100, 'EUR', 'AED')).first()).toBeVisible()
    await context.close()
  })

  test('FASE 1/27 — los tipos de la web: catálogo común, los que la agencia publica, en castellano', async ({ browser }) => {
    const facets = await (await anon.get('/api/public/properties', { params: { countOnly: '1', facets: 'types' } })).json()
    expect(facets.facets.types).toContain('Penthouse')
    expect(facets.facets.types.every((t: unknown) => typeof t === 'string' && t.length > 0)).toBe(true)

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await page.goto('/propiedades')
    await page.getByRole('button', { name: /Filtros/ }).first().click()
    await expect(page.getByTestId('public-filter-type-Penthouse')).toHaveText('Ático')
    // Nada de las claves internas en inglés.
    await expect(page.getByTestId('public-filter-type-Penthouse')).not.toHaveText('Penthouse')
    await context.close()
  })

  test('FASE 2 — código postal por prefijo y radio sobre lo publicado, en el API público', async () => {
    const ids = async (params: Record<string, string>) => ((await (await anon.get('/api/public/properties', { params: { perPage: '48', ...params } })).json()).rows as any[]).map((r) => r.id)
    expect(await ids({ postalCode: POSTAL.slice(0, 4) })).toContain(devId)
    expect(await ids({ postalCode: POSTAL })).toEqual([devId])
    expect(await ids({ postalCode: `${POSTAL}9` })).toEqual([])
    expect(await ids({ lat: String(SPOT.lat), lng: String(SPOT.lng), radiusKm: '1' })).toEqual([devId])
    expect(await ids({ lat: String(SPOT.lat + 1), lng: String(SPOT.lng), radiusKm: '5' })).not.toContain(devId)
    expect((await anon.get('/api/public/properties', { params: { lat: '10', lng: '-40', radiusKm: '0' } })).status()).toBe(422)
  })

  test('FASE 2 — el código postal en el modal de filtros cuenta en la insignia, y el radio también (uno)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await page.goto('/propiedades')
    await page.getByRole('button', { name: /Filtros/ }).first().click()
    await page.getByTestId('public-filter-postal-code').fill(POSTAL)
    await page.getByTestId('public-filters-apply').click()
    await expect(page).toHaveURL(new RegExp(`postalCode=${POSTAL}`))
    await expect(page.getByTestId('public-filters-badge')).toHaveText('1')
    await expect(page.getByText(devName).first()).toBeVisible()

    // Con radio: 2 filtros (CP + radio, que cuenta como uno). El modal lo enseña y lo quita.
    await page.goto(`/propiedades?postalCode=${POSTAL}&lat=${SPOT.lat}&lng=${SPOT.lng}&radiusKm=5`)
    await expect(page.getByTestId('public-filters-badge')).toHaveText('2')
    await page.getByRole('button', { name: /Filtros/ }).first().click()
    await expect(page.getByTestId('public-filter-nearby')).toBeVisible()
    await page.getByTestId('public-filter-nearby-remove').click()
    await page.getByTestId('public-filters-apply').click()
    await expect(page).not.toHaveURL(/radiusKm=/)
    await expect(page.getByTestId('public-filters-badge')).toHaveText('1')
    await context.close()
  })

  test('FASE 2 — «Buscar cerca de aquí» en el mapa: radio en la URL, insignia y búsqueda guardada', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await page.goto(`/mapa?lat=${SPOT.lat}&lng=${SPOT.lng}&radiusKm=2`)
    // Entrando directamente (hidratación), el mapa se crea: antes /mapa salía
    // vacío así y sólo funcionaba navegando desde otra página.
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expect(page.getByTestId('map-filters-badge')).toHaveText('1')
    await expect(page.getByTestId('map-clear-nearby')).toContainText('2 km')
    await expect(page.getByText(devName).first()).toBeVisible()

    // Desde el centro del mapa, con otro radio.
    await page.getByTestId('map-nearby-radius').selectOption('10')
    await page.getByTestId('map-search-nearby').click()
    await expect(page).toHaveURL(/radiusKm=10/)
    // El centro sale redondeado a 3 decimales (~110 m).
    expect(new URL(page.url()).searchParams.get('lat')).toMatch(/^-?\d+(\.\d{1,3})?$/)

    await page.getByTestId('map-save-search').click()
    await page.goto('/favoritos')
    await expect(page.getByText(/a menos de 10 km/).first()).toBeVisible()

    await page.goto(`/mapa?lat=${SPOT.lat}&lng=${SPOT.lng}&radiusKm=2`)
    await page.getByTestId('map-clear-nearby').click()
    await expect(page).not.toHaveURL(/radiusKm=/)
    await context.close()
  })

  test('FASE 2 — geolocalización sólo para el propio origen y sólo en la web pública', async () => {
    expect((await anon.get('/mapa')).headers()['permissions-policy']).toContain('geolocation=(self)')
    expect((await anon.get('/admin/login')).headers()['permissions-policy']).toContain('geolocation=()')
    expect((await anon.get('/embed')).headers()['permissions-policy']).toContain('geolocation=()')
  })

  test('FASE 28 — catálogo de 2ª mano por la API: sólo lo de la agencia (ajeno = 404) y PDF real', async () => {
    const templates = (await (await a.get('/api/admin/asset-export/templates')).json()) as any[]
    const template = templates.find((t) => String(t.formatKey || '').startsWith('pdf'))
    expect(template, 'no hay ninguna plantilla PDF sembrada por las migraciones').toBeTruthy()

    const mk = async (ctx: APIRequestContext, data: Record<string, unknown>) => {
      const res = await ctx.post('/api/admin/properties', { data: { status: 'available', transactionType: 'sale', ...data } })
      expect(res.ok(), await res.text()).toBeTruthy()
      const id = (await res.json()).id as number
      cleanup.push(() => ctx.delete(`/api/admin/properties/${id}?hard=1`))
      return id
    }
    const p1 = await mk(a, { slug: `d3b-1-${RUN}`, propertyType: 'Apartment', city: 'Madrid', community: `Chamberí D3b ${RUN}`, price: 350000, area: 90, bedrooms: 3, bathrooms: 2 })
    const p2 = await mk(a, { slug: `d3b-2-${RUN}`, propertyType: 'Penthouse', city: 'Madrid', community: `Retiro D3b ${RUN}`, price: 690000, area: 120 })
    const foreign = await mk(b, { slug: `d3b-ajena-${RUN}`, city: 'Sevilla', price: 100000 })

    const created = await a.post('/api/admin/asset-export/catalogs', { data: { templateId: template.id, assetIds: [p1, foreign, p2], propertyKind: 'agent', name: `Catálogo D3b ${RUN}` } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const catalog = await created.json()
    expect(catalog).toMatchObject({ totalCount: 2, propertyKind: 'agent' })
    expect(catalog.skipped).toEqual([foreign])

    expect((await a.post('/api/admin/asset-export/catalogs', { data: { templateId: template.id, assetIds: [foreign], propertyKind: 'agent' } })).status()).toBe(404)
    expect((await b.get(`/api/admin/asset-export/catalogs/${catalog.id}`)).status()).toBe(404)

    let result: any = null
    for (let i = 0; i < 6; i++) {
      result = await (await a.post(`/api/admin/asset-export/catalogs/${catalog.id}/process-next`)).json()
      if (result.done) break
    }
    expect(result.done).toBe(true)
    expect(result.catalog.status).toBe('completed')

    const detail = await (await a.get(`/api/admin/asset-export/catalogs/${catalog.id}`)).json()
    expect(detail.propertyKind).toBe('agent')
    expect(detail.items.map((i: any) => i.assetName)).toEqual([`Piso en Chamberí D3b ${RUN}`, `Ático en Retiro D3b ${RUN}`])

    const pdf = await a.get(`/api/admin/asset-export/catalogs/${catalog.id}/download`)
    expect(pdf.ok()).toBeTruthy()
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
  })

  test('FASE 28 — «Crear catálogo» desde el listado de 2ª mano, en el navegador', async ({ page }) => {
    const res = await a.post('/api/admin/properties', { data: { slug: `d3b-ui-${RUN}`, status: 'available', transactionType: 'sale', city: 'Madrid', community: `Salamanca D3b ${RUN}`, price: 420000 } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/properties/${id}?hard=1`))

    await page.goto('/admin/properties')
    await page.getByRole('button', { name: 'Lista' }).click()
    await page.getByPlaceholder(/Referencia, dirección, zona/).fill(`d3b-ui-${RUN}`)
    await page.getByPlaceholder(/Referencia, dirección, zona/).press('Enter')
    const row = page.locator('tbody tr', { hasText: `Ref. #${id}` })
    await expect(row).toBeVisible()
    await row.locator('input[type="checkbox"]').check()

    await page.locator('select').filter({ hasText: 'Elige una acción…' }).selectOption('create_catalog')
    await expect(page.getByTestId('bulk-catalog-agent-hint')).toBeVisible()
    const templateSelect = page.getByTestId('bulk-catalog-template')
    await expect(templateSelect.locator('option').nth(1)).toBeAttached()
    await templateSelect.selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Aplicar' }).click()

    await expect(page).toHaveURL(/\/admin\/asset-export\/catalogs\/\d+/)
    await expect(page.getByTestId('catalog-detail-kind')).toContainText('2ª mano')
    await expect(page.getByTestId(`catalog-item-${id}`)).toContainText(`en Salamanca D3b ${RUN}`)
  })
})
