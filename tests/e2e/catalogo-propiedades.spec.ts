import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Catálogo público de Propiedades (#109): barra con orden y Galería / Mapa,
 * panel de filtros a la izquierda (Ubicación abierto, el resto cerrado), total
 * real con chips, tres columnas en escritorio, panel contraíble y cajón en el
 * móvil. Todo filtra el catálogo real de la agencia.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const CITY = `Catalogo ${RUN}`
const GROUPS = ['Ubicación', 'Precio', 'Superficie', 'Habitaciones', 'Baños', 'Tipo de propiedad', 'Estado', 'Características']

test.describe('Catálogo de propiedades', () => {
  let a: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  const ids: Record<string, number> = {}

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const dev = await a.post('/api/admin/developers', { data: { name: `Catálogo promotora ${RUN}`, email: `cat-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
    const rows: [string, Record<string, any>][] = [
      ['grande', { price: 450000, area: 140, bedrooms: 4, bathrooms: 2, hasTerrace: 1, isExclusive: 1 }],
      ['media', { price: 320000, area: 105, bedrooms: 3, bathrooms: 2, hasTerrace: 1 }],
      ['pequena', { price: 180000, area: 60, bedrooms: 1, bathrooms: 1 }],
      ['cara', { price: 900000, area: 210, bedrooms: 5, bathrooms: 3, hasTerrace: 1 }],
    ]
    for (const [k, extra] of rows) {
      const res = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Cat ${k} ${RUN}`, status: 'new', city: CITY, ...extra } })
      expect(res.ok(), await res.text()).toBeTruthy()
      ids[k] = (await res.json()).id
      cleanup.push(() => a.delete(`/api/admin/developer-properties/${ids[k]}?hard=1`))
    }
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), anon?.dispose()])
  })

  const apiTotal = async (params: Record<string, string>) => (await (await anon.get('/api/public/properties', { params: { countOnly: '1', ...params } })).json()).total as number

  test('escritorio: barra, panel con sus 8 grupos (Ubicación abierto) y tres columnas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/propiedades')
    const bar = page.getByTestId('catalog-bar')
    await expect(bar.getByPlaceholder('Ciudad, barrio, calle o referencia…')).toBeVisible()
    await expect(bar.getByTestId('catalog-sort')).toHaveValue('')
    await expect(bar.getByTestId('catalog-view-gallery')).toHaveAttribute('aria-pressed', 'true')
    await expect(bar.getByTestId('catalog-view-map')).toHaveAttribute('aria-pressed', 'false')

    const aside = page.getByTestId('catalog-aside')
    await expect(aside.getByRole('heading', { name: 'Filtros' })).toBeVisible()
    const heads = aside.locator('section[data-group] > button')
    // El nombre del grupo, sin el icono (el de Superficie lleva «m²» dentro).
    expect((await aside.locator('section[data-group] > button .cf-group-name').allTextContents()).map((s) => s.trim())).toEqual(GROUPS)
    const expanded = await heads.evaluateAll((els) => els.map((e) => e.getAttribute('aria-expanded')))
    expect(expanded).toEqual(['true', 'false', 'false', 'false', 'false', 'false', 'false', 'false'])
    await expect(aside.locator('.leaflet-container')).toBeVisible()

    const cols = await page.getByTestId('catalog-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    expect(cols).toBe(3)
    const total = await apiTotal({})
    await expect(page.getByTestId('catalog-total')).toContainText(total.toLocaleString('es-ES'))
    await expect(aside.getByTestId('catalog-show-results')).toContainText(`Ver ${total.toLocaleString('es-ES')} resultados`)
  })

  test('los filtros del panel van a la URL, el total es el real y cada chip se quita', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/propiedades')
    const aside = page.getByTestId('catalog-aside')
    await aside.getByTestId('catalog-location').selectOption(CITY)
    await expect(page).toHaveURL(new RegExp(`municipality=${encodeURIComponent(CITY).replace(/%20/g, '(\\+|%20)')}`))
    await expect(page.locator('[data-chip="municipality"]')).toHaveText(CITY)
    await expect(page.getByTestId('catalog-total')).toContainText('4')

    await aside.locator('[data-group="price"] > button').click()
    await aside.getByTestId('catalog-price-min').fill('300000')
    await aside.getByTestId('catalog-price-min').press('Tab')
    await aside.getByTestId('catalog-price-max').fill('600000')
    await aside.getByTestId('catalog-price-max').press('Tab')
    // En la moneda de la agencia (la base de pruebas arranca en AED: «300,000»).
    await expect(page.locator('[data-chip="price"]')).toContainText(/300[.,]000/)
    await aside.locator('[data-group="bedrooms"] > button').click()
    await aside.getByTestId('catalog-bedrooms-3').click()
    await aside.locator('[data-group="features"] > button').click()
    await aside.getByTestId('catalog-feature-terrace').check()
    await expect(page.locator('[data-chip="terrace"]')).toHaveText('Terraza')
    await expect(page.locator('[data-chip="bedrooms"]')).toHaveText('3+ habitaciones')

    const expected = await apiTotal({ municipality: CITY, minPrice: '300000', maxPrice: '600000', bedrooms: '3', terrace: '1' })
    expect(expected).toBe(2)
    await expect(page.getByTestId('catalog-total')).toContainText('2')
    await expect(aside.getByTestId('catalog-show-results')).toContainText('Ver 2 resultados')
    await expect(page.getByText(`Cat grande ${RUN}`)).toBeVisible()
    await expect(page.getByText(`Cat pequena ${RUN}`)).toHaveCount(0)

    await page.locator('[data-chip="price"]').click()
    await expect(page).not.toHaveURL(/minPrice=/)
    await page.getByTestId('catalog-clear').click()
    await expect(page.locator('[data-chip]')).toHaveCount(0)
  })

  test('tarjeta del catálogo: una etiqueta, tres acciones y «Ver propiedad»', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`/propiedades?municipality=${encodeURIComponent(CITY)}`)
    const card = page.locator('[data-card-variant="catalog"]').filter({ hasText: `Cat grande ${RUN}` })
    await expect(card.locator('.badge')).toHaveCount(1)
    await expect(card.locator('.badge')).toHaveText(/exclusiva/i)
    await expect(card.locator('.act')).toHaveCount(3)
    await expect(card).toContainText('/ m²')
    await card.getByRole('link', { name: /ver propiedad/i }).click()
    await expect(page).toHaveURL(/\/propiedades\/[^?]+$/)
  })

  test('lo que se está escribiendo en un mínimo o máximo no se borra cuando cambia otro filtro', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`/propiedades?municipality=${encodeURIComponent(CITY)}`)
    const aside = page.getByTestId('catalog-aside')
    await expect(page.getByTestId('catalog-total')).toContainText('4')
    await aside.locator('[data-group="features"] > button').click()
    await aside.locator('[data-group="price"] > button').click()
    // El máximo a medio escribir (con el foco en el campo) y, mientras, llega otro filtro que repinta
    // el panel: un clic por programa marca Terraza sin quitarle el foco al máximo.
    const max = aside.getByTestId('catalog-price-max')
    await max.fill('600000')
    await aside.getByTestId('catalog-feature-terrace').evaluate((el) => (el as HTMLInputElement).click())
    await expect(page).toHaveURL(/terrace=1/)
    await expect(page.getByTestId('catalog-total')).toContainText('3')
    await expect(max).toBeFocused()
    await expect(max, 'el máximo tecleado sigue ahí').toHaveValue('600000')
    await max.press('Tab')
    await expect(page).toHaveURL(/maxPrice=600000/)
    await expect(page.getByTestId('catalog-total')).toContainText('2')
    // Quitar el chip del precio vacía el campo.
    await page.locator('[data-chip="price"] button, [data-chip="price"]').first().click()
    await expect(aside.getByTestId('catalog-price-max')).toHaveValue('')
  })

  test('panel contraíble (sigue en tres columnas) y vista Mapa con los mismos filtros', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`/propiedades?municipality=${encodeURIComponent(CITY)}`)
    await page.getByTestId('catalog-collapse').click()
    await expect(page.getByTestId('catalog-aside')).toHaveCount(0)
    await expect(page.locator('[data-chip="municipality"]')).toBeVisible()
    const cols = await page.getByTestId('catalog-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    expect(cols).toBe(3)
    await page.getByTestId('catalog-expand').click()
    await expect(page.getByTestId('catalog-aside')).toBeVisible()

    await page.getByTestId('catalog-view-map').click()
    await expect(page).toHaveURL(/vista=mapa/)
    await expect(page).toHaveURL(/municipality=/)
    await expect(page.getByTestId('catalog-map').locator('.leaflet-container')).toBeVisible()
    await page.getByTestId('catalog-view-gallery').click()
    await expect(page).not.toHaveURL(/vista=mapa/)
  })

  test('móvil: botón Filtros, cajón y «Ver resultados» lo cierra', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/propiedades')
    await expect(page.getByTestId('catalog-aside')).toBeHidden()
    await page.getByTestId('catalog-open-drawer').click()
    const drawer = page.getByTestId('catalog-drawer')
    await expect(drawer).toBeVisible()
    await drawer.locator('[data-group="features"] > button').click()
    await drawer.getByTestId('catalog-feature-terrace').check()
    await expect(page).toHaveURL(/terrace=1/)
    await drawer.getByTestId('catalog-show-results').click()
    await expect(drawer).toHaveCount(0)
    const cols = await page.getByTestId('catalog-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    expect(cols).toBe(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })

  test('las opciones del panel son de esta agencia (facetas reales)', async () => {
    const res = await (await anon.get('/api/public/properties', { params: { countOnly: '1', facets: 'filters' } })).json()
    expect(res.facets.municipalities).toContain(CITY)
    expect(Array.isArray(res.facets.types)).toBe(true)
    expect(Array.isArray(res.facets.postalCodes)).toBe(true)
  })

  test('un municipio y un barrio puestos sólo en la ficha ampliada también salen como opción y filtran', async () => {
    const town = `Concejo ${RUN}`
    const zone = `Barrio ${RUN}`
    const put = await a.put(`/api/admin/developer-properties/${ids.media}`, { data: { municipality: town, neighborhood: zone } })
    expect(put.ok(), await put.text()).toBeTruthy()
    const res = await (await anon.get('/api/public/properties', { params: { countOnly: '1', facets: 'filters' } })).json()
    expect(res.facets.municipalities).toContain(town)
    expect(res.facets.neighborhoods).toContain(zone)
    expect(await apiTotal({ municipality: town })).toBe(1)
    expect(await apiTotal({ neighborhood: zone })).toBe(1)
  })
})
