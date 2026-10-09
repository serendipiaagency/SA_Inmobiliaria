import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Hero de la portada rediseñado (megaprompt «Hero»): Comprar | Alquilar en un
 * control segmentado con el color de la marca; una barra con Tipo de inmueble,
 * Ubicación, Precio y Habitaciones y el botón «Buscar» grande; y, fuera de la
 * barra, «Más filtros (n)» con baños, superficie, estado, características y
 * el resto. La búsqueda es la de Property Search: lo que se elige llega a
 * Propiedades y su total se compara con /api/public/properties.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const HOME = '/?vista_previa=1'
const CANVAS = 'iframe[title="Vista previa del Constructor Web"]'
const CITY = `Valdeheros ${RUN}`
const N = (k: string) => `Hero ${k} ${RUN}`

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

test.describe('Hero rediseñado', () => {
  // La vista previa de la portada de la agencia (en local, «/» es la landing de la plataforma).
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  let originalHome: Record<string, unknown> | null = null

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const dev = await a.post('/api/admin/developers', { data: { name: `Hero promotora ${RUN}`, email: `hero-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
    const rows: [string, Record<string, unknown>][] = [
      ['piso', { propertyType: 'Apartment', price: 210000, area: 95, bedrooms: 3, bathrooms: 2, hasTerrace: 1 }],
      ['atico', { propertyType: 'Penthouse', price: 380000, area: 130, bedrooms: 3, bathrooms: 1 }],
      ['local', { propertyType: 'Retail', price: 150000, area: 80 }],
    ]
    for (const [k, extra] of rows) {
      const res = await a.post('/api/admin/developer-properties', { data: { developerId, name: N(k), status: 'ready', city: CITY, ...extra } })
      expect(res.ok(), await res.text()).toBeTruthy()
      const id = (await res.json()).id
      cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    }
    const draft = await (await a.get('/api/admin/site-pages/home')).json()
    originalHome = { blocks: draft.blocks, seo: draft.seo, ...(draft.styles ? { styles: draft.styles } : {}) }
  })

  test.afterAll(async () => {
    if (originalHome) await a.put('/api/admin/site-pages/home', { data: originalHome }).catch(() => null)
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), anon?.dispose()])
  })

  const apiTotal = async (params: Record<string, string | string[]>) => {
    const qs = new URLSearchParams({ countOnly: '1' })
    for (const [k, v] of Object.entries(params)) for (const x of [v].flat()) qs.append(k, x)
    return ((await (await anon.get(`/api/public/properties?${qs}`)).json()) as { total: number }).total
  }

  test('1–15 · diseño: segmentado con iconos, cuatro campos en orden, «Buscar» grande y «Más filtros» fuera de la barra', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    const hero = page.locator('section.hero')
    await expect(hero.locator('h1')).toBeVisible()
    await expect(hero.locator('[data-sb-node$=":eyebrow"], p.eyebrow').first()).toBeVisible()

    // Comprar | Alquilar, con icono, Comprar activo de partida.
    const seg = hero.getByTestId('hero-operation')
    await expect(seg.locator('button')).toHaveText(['Comprar', 'Alquilar'])
    await expect(seg.locator('button svg')).toHaveCount(2)
    await expect(seg.locator('button').first()).toHaveAttribute('aria-pressed', 'true')

    // La barra: Tipo de inmueble, Ubicación, Precio, Habitaciones; ni baños ni superficie.
    const bar = hero.getByTestId('hero-bar')
    expect(await bar.locator('[data-field]').evaluateAll((els) => els.map((e) => e.getAttribute('data-field')))).toEqual(['type', 'location', 'price', 'beds'])
    await expect(bar.getByText('Baños')).toHaveCount(0)
    await expect(bar.getByText('Superficie')).toHaveCount(0)
    await expect(bar.getByTestId('hero-cell-type')).toContainText('Tipo de inmueble')
    await expect(bar.getByTestId('hero-cell-type')).toContainText('Cualquiera')
    await expect(bar.getByTestId('hero-cell-location')).toContainText('Ciudad, zona o barrio')
    await expect(bar.getByTestId('hero-cell-price')).toContainText('Cualquier precio')
    // En escritorio, una sola fila.
    const ys = await bar.locator('[data-field]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
    expect(new Set(ys).size).toBe(1)

    // «Buscar»: rectangular, grande, con su texto; el mismo color que el selector activo.
    const search = hero.getByTestId('hero-search')
    await expect(search).toContainText('Buscar')
    const sb = (await search.boundingBox())!
    expect(sb.width).toBeGreaterThan(sb.height * 3)
    const bg = await search.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(await seg.locator('button').first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(bg)

    // «Más filtros»: fuera del contenedor blanco, debajo, y abre y cierra su panel.
    expect(await bar.getByTestId('hero-more').count()).toBe(0)
    const more = hero.getByTestId('hero-more')
    await expect(more).toHaveText(/Más filtros/)
    const barBox = (await bar.boundingBox())!
    expect((await more.boundingBox())!.y).toBeGreaterThan(barBox.y + barBox.height - 1)
    await more.click()
    const panel = page.getByTestId('hero-more-panel')
    await expect(panel).toBeVisible()
    for (const id of ['hero-baths-2', 'hero-area-min', 'hero-area-max', 'hero-estado-obra_nueva', 'hero-estado-segunda_mano', 'hero-feature-terrace', 'hero-feature-garden', 'hero-orientation', 'hero-energy', 'hero-min-yield', 'hero-sort']) await expect(panel.getByTestId(id), id).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
  })

  test('16–21 · búsqueda completa: tipo, ubicación, habitaciones y «Más filtros (3)» llegan a Propiedades con sus resultados reales', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    const hero = page.locator('section.hero')

    // Tipo de inmueble: Viviendas (el árbol real de tipos y subtipos).
    await hero.getByTestId('hero-cell-type').click()
    const typePop = page.getByTestId('hero-pop-type')
    await typePop.getByTestId('type-cat-homes').check()
    await expect(hero.getByTestId('hero-cell-type')).toContainText('Viviendas')
    await typePop.getByTestId('hero-type-done').click()
    await expect(typePop).toHaveCount(0)

    // Ubicación con sugerencias reales.
    await hero.getByTestId('hero-cell-location').click()
    const locPop = page.getByTestId('hero-pop-location')
    await locPop.getByTestId('location-input').pressSequentially('Valdeheros', { delay: 30 })
    const opt = locPop.locator(`[data-testid="location-option-municipality"][data-value="${CITY}"]`)
    await expect(opt).toBeVisible()
    await opt.click()
    await expect(hero.getByTestId('hero-cell-location')).toContainText(CITY)

    // 3+ habitaciones.
    await hero.getByTestId('hero-cell-beds').click()
    await page.getByTestId('hero-beds-3').click()
    await expect(hero.getByTestId('hero-cell-beds')).toContainText('3+')

    // «Más filtros»: 2+ baños, desde 80 m² y terraza → (3). «Aplicar» lo guarda y cierra.
    await hero.getByTestId('hero-more').click()
    const panel = page.getByTestId('hero-more-panel')
    await panel.getByTestId('hero-baths-2').click()
    await panel.getByTestId('hero-area-min').fill('80')
    await panel.getByTestId('hero-feature-terrace').click()
    await expect(hero.getByTestId('hero-more-count')).toHaveText(/\(3\)/)
    await panel.getByTestId('hero-more-apply').click()
    await expect(panel).toHaveCount(0)
    await expect(hero.getByTestId('hero-more')).toHaveText(/Más filtros \(3\)/)

    // Buscar: Propiedades con todo en la URL y en el panel; total = el del servidor.
    await hero.getByTestId('hero-search').click()
    await expect(page).toHaveURL(/\/propiedades\?/)
    const url = new URL(page.url())
    expect(url.searchParams.get('operacion')).toBe('venta')
    expect(url.searchParams.getAll('type')).toEqual(expect.arrayContaining(['Apartment', 'Penthouse']))
    expect(url.searchParams.getAll('municipality')).toEqual([CITY])
    expect(url.searchParams.get('bedrooms')).toBe('3')
    expect(url.searchParams.get('bathrooms')).toBe('2')
    expect(url.searchParams.get('minArea')).toBe('80')
    expect(url.searchParams.get('terrace')).toBe('1')
    const params: Record<string, string | string[]> = {}
    for (const k of new Set(url.searchParams.keys())) params[k] = url.searchParams.getAll(k)
    const total = await apiTotal(params)
    expect(total).toBe(1)
    await expect(page.getByTestId('catalog-total')).toContainText('1')
    await expect(page.getByText(N('piso'))).toBeVisible()
    for (const k of ['atico', 'local']) await expect(page.getByText(N(k))).toHaveCount(0)
    for (const chip of ['bedrooms', 'bathrooms', 'terrace']) await expect(page.locator(`[data-chip="${chip}"]`), chip).toBeVisible()
    await expect(page.locator(`[data-chip="municipality:${CITY}"]`)).toBeVisible()
  })

  test('habitaciones no aplican a locales; Alquilar cambia la inversión por la modalidad y no la cuenta', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    const hero = page.locator('section.hero')
    await hero.getByTestId('hero-cell-type').click()
    await page.getByTestId('hero-pop-type').getByTestId('public-filter-type-Retail').check()
    await page.getByTestId('hero-type-done').click()
    const beds = hero.getByTestId('hero-cell-beds')
    await expect(beds).toContainText('No aplica')
    await expect(beds).toHaveAttribute('aria-disabled', 'true')
    // Pulsarlo (aunque Playwright lo vea deshabilitado) no abre nada.
    await beds.click({ force: true })
    await expect(page.getByTestId('hero-pop-beds')).toHaveCount(0)

    await hero.getByTestId('hero-more').click()
    const panel = page.getByTestId('hero-more-panel')
    await expect(panel.getByTestId('hero-baths-2')).toHaveCount(0)
    await panel.getByTestId('hero-min-yield').selectOption('5')
    await expect(hero.getByTestId('hero-more-count')).toHaveText(/\(1\)/)
    await hero.getByTestId('hero-operation').getByRole('button', { name: 'Alquilar' }).click()
    await expect(panel.getByTestId('hero-min-yield')).toHaveCount(0)
    await expect(panel.getByTestId('hero-rental-seasonal')).toBeVisible()
    await expect(hero.getByTestId('hero-more-count')).toHaveCount(0)
  })

  test('25–27 · responsive: tableta en dos columnas y móvil apilado, sin desbordes, con «Buscar» a todo el ancho', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 })
    await page.goto(HOME)
    const bar = page.getByTestId('hero-bar')
    await expect(bar).toBeVisible()
    const tops = await bar.locator('[data-field]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
    expect(tops[0]).toBe(tops[1])
    expect(tops[2]).toBeGreaterThan(tops[0]!)
    await noHorizontalScroll(page)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(HOME)
    await expect(bar).toBeVisible()
    const lefts = await bar.locator('[data-field]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
    expect(new Set(lefts).size).toBe(1)
    const barBox = (await bar.boundingBox())!
    const btn = (await page.getByTestId('hero-search').boundingBox())!
    expect(btn.width).toBeGreaterThan(barBox.width * 0.85)
    await noHorizontalScroll(page)
    await page.getByTestId('hero-more').click()
    const panel = page.getByTestId('hero-more-panel')
    await expect(panel).toBeVisible()
    const pb = (await panel.boundingBox())!
    expect(pb.x).toBeGreaterThanOrEqual(0)
    expect(pb.x + pb.width).toBeLessThanOrEqual(391)
    await noHorizontalScroll(page)
  })

  test('22–23 · Constructor: campos, orden, texto del botón, «Más filtros» y operación de partida se ven en el lienzo y se guardan', async ({ page }) => {
    // Una portada conocida, con su Hero (se restaura al acabar).
    const put = await a.put('/api/admin/site-pages/home', { data: { blocks: [{ id: 'hero-rd', type: 'hero', version: 1, content: {} }], seo: {} } })
    expect(put.ok(), await put.text()).toBeTruthy()
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/site-builder')
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.locator('section.hero')).toBeVisible({ timeout: 15_000 })
    await page.locator('aside.border-r').getByText(/^01 · Hero$/).click()
    const fields = page.getByTestId('hero-fields')
    await expect(fields).toBeVisible()

    await fields.locator('li[data-field="price"]').getByTestId('hero-field-toggle').uncheck()
    // Habitaciones sube dos puestos (por encima de Precio, ya oculto, y de Ubicación).
    await fields.locator('li[data-field="beds"]').getByTestId('hero-field-up').click()
    await fields.locator('li[data-field="beds"]').getByTestId('hero-field-up').click()
    await page.getByTestId('hero-button-label').locator('input').fill('Encontrar')
    await page.getByTestId('hero-show-more').getByRole('switch').click()
    await page.getByTestId('hero-default-operation').getByRole('button', { name: 'Alquilar' }).click()

    const bar = canvas.getByTestId('hero-bar')
    await expect.poll(async () => bar.locator('[data-field]').evaluateAll((els) => els.map((e) => e.getAttribute('data-field')))).toEqual(['type', 'beds', 'location'])
    await expect(canvas.getByTestId('hero-search')).toContainText('Encontrar')
    await expect(canvas.getByTestId('hero-more')).toHaveCount(0)
    await expect(canvas.getByTestId('hero-operation').getByRole('button', { name: 'Alquilar' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => {
      const draft = await (await a.get('/api/admin/site-pages/home')).json()
      const c = (draft.blocks as any[]).find((b) => b.type === 'hero')?.content || {}
      return [c.searchButtonLabel, c.showMoreFilters, c.defaultOperation, (c.searchFields || []).filter((f: any) => f.visible).map((f: any) => f.key).join(',')].join('|')
    }, { timeout: 10_000 }).toBe('Encontrar|false|alquiler|type,beds,location')

    // Diseño: barra en píldora.
    await page.locator('aside.border-l').getByRole('button', { name: 'Diseño', exact: true }).click()
    await page.getByTestId('hero-search-radius').getByRole('button', { name: 'Píldora' }).click()
    await expect.poll(async () => bar.evaluate((el) => getComputedStyle(el).getPropertyValue('--hs-radius').trim())).toBe('999px')
  })
})
