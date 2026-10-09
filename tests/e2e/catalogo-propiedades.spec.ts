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

  test.describe('desde el Constructor', () => {
    test.use({ storageState: STATE_A })

    test('ordenar y ocultar grupos de filtros se ve en el lienzo y, al publicar, en la web y en el móvil', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      const groupsOf = (root: ReturnType<typeof page.getByTestId>) => root.locator('section[data-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')))
      try {
        await page.goto('/admin/site-builder?pagina=propiedades')
        const canvas = page.frameLocator('iframe[title="Vista previa del Constructor Web"]')
        const preview = canvas.getByTestId('page-core-preview')
        await expect(preview).toBeVisible({ timeout: 15_000 })
        await preview.click()
        const inspector = page.getByTestId('page-core-inspector')
        const list = inspector.getByTestId('page-core-filters')
        await expect(list.locator('li')).toHaveCount(8)

        // «Características» arriba del todo y «Superficie» y «Estado» fuera.
        for (let i = 0; i < 10; i++) {
          const up = list.locator('li[data-section="features"]').getByTestId('page-core-section-up')
          if (await up.isDisabled()) break
          await up.click()
        }
        await list.locator('li[data-section="area"]').getByTestId('page-core-section-toggle').uncheck()
        await list.locator('li[data-section="status"]').getByTestId('page-core-section-toggle').uncheck()
        const expected = ['features', 'location', 'price', 'bedrooms', 'bathrooms', 'type']

        // El lienzo lo enseña igual, antes de publicar.
        const panel = canvas.getByTestId('page-core-catalog').getByTestId('catalog-filters')
        await expect.poll(() => groupsOf(panel)).toEqual(expected)
        await expect(canvas.getByTestId('page-core-filters-hidden')).toHaveText('2 filtros ocultos en esta web.')
        await expect
          .poll(
            async () => {
              const draft = await (await a.get('/api/admin/site-pages/propiedades')).json()
              const core = (draft.blocks as any[]).find((blk) => blk.type === 'page-core')
              return (core?.content?.filters || []).filter((x: any) => x.visible).map((x: any) => x.key).join()
            },
            { timeout: 10_000 },
          )
          .toBe(expected.join())

        // Sin publicar, la web sigue con los 8 grupos de partida.
        const web = await page.context().newPage()
        await web.setViewportSize({ width: 1440, height: 900 })
        await web.goto('/propiedades')
        await expect(web.getByTestId('catalog-aside').locator('section[data-group]')).toHaveCount(8)

        await page.getByRole('button', { name: 'Publicar cambios' }).click()
        await expect(page.getByTestId('site-page-status-propiedades')).toHaveText('Publicada')

        await web.goto('/propiedades')
        const aside = web.getByTestId('catalog-aside')
        await expect.poll(() => groupsOf(aside.getByTestId('catalog-filters'))).toEqual(expected)
        // Ubicación ya no es el primero, pero sigue abriéndose de partida; los demás, cerrados.
        expect(await aside.locator('section[data-group] > button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-expanded')))).toEqual(['false', 'true', 'false', 'false', 'false', 'false'])

        // Un filtro de un grupo oculto que ya venga en la dirección se sigue aplicando y se quita con su chip.
        await web.goto('/propiedades?minArea=100')
        await expect(web.getByTestId('catalog-total')).toContainText((await apiTotal({ minArea: '100' })).toLocaleString('es-ES'))
        const chip = web.locator('[data-chip="area"]')
        await expect(chip).toContainText('m²')
        await chip.click()
        await expect(web).not.toHaveURL(/minArea/)

        // En el móvil, el cajón de filtros enseña los mismos grupos en el mismo orden.
        await web.setViewportSize({ width: 390, height: 844 })
        await web.goto('/propiedades')
        await web.getByTestId('catalog-open-drawer').click()
        await expect.poll(() => groupsOf(web.getByTestId('catalog-drawer').getByTestId('catalog-filters'))).toEqual(expected)
        await web.close()
      } finally {
        // Volver a la original, pase lo que pase: las demás pruebas cuentan con los 8 grupos.
        expect((await a.delete('/api/admin/site-pages/propiedades')).ok()).toBeTruthy()
      }
    })
  })
})
