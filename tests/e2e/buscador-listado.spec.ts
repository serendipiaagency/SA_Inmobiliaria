import { test, expect, request as pwRequest, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { ANON_STATE, STATE_A, STATE_B } from './global-setup'

/**
 * Buscador del Hero y listado de Propiedades (megaprompts «buscador» y
 * «listado»): el recorrido completo de 30 pasos — Constructor, vista previa,
 * cookies, Comprar, ubicación con sugerencias reales, rango de precio con
 * slider y campos, habitaciones, Buscar, filtros activos, resultados reales,
 * panel lateral, Alquilar, móvil, web publicada y aislamiento entre agencias —
 * y lo propio del listado: «Ordenar por» con sus ocho ordenaciones del
 * servidor, tipos con subtipos, «Situación de la vivienda», alquiler,
 * «Nueva búsqueda» y las opciones del Constructor.
 *
 * Todo contra el catálogo real de la agencia 1 (la que sirve localhost); los
 * totales se comparan siempre con lo que devuelve /api/public/properties con
 * los mismos criterios, nunca con números escritos a mano.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const HOME = '/?vista_previa=1'
const CANVAS = 'iframe[title="Vista previa del Constructor Web"]'
const N = (k: string) => `Buscador ${k} ${RUN}`
const ISOLATED = `Aislada ${RUN}`

/** Un extremo del slider de precio a una posición de su escala (100 por escalón). */
async function slide(handle: Locator, pos: number) {
  await handle.evaluate((el, p) => {
    const input = el as HTMLInputElement
    input.value = String(p)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, pos)
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

test.describe('Buscador y listado de propiedades', () => {
  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  const ids: Record<string, number> = {}

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const dev = await a.post('/api/admin/developers', { data: { name: `Buscador promotora ${RUN}`, email: `busc-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
    const rows: [string, Record<string, unknown>][] = [
      ['piso', { propertyType: 'Apartment', price: 200000, area: 90, bedrooms: 3, bathrooms: 2, hasTerrace: 1 }],
      ['atico', { propertyType: 'Penthouse', price: 400000, area: 140, bedrooms: 4, bathrooms: 2 }],
      ['estudio', { propertyType: 'Apartment', price: 120000, area: 40, bedrooms: 1, bathrooms: 1 }],
      ['local', { propertyType: 'Retail', price: 150000, area: 80 }],
      ['alquiler', { propertyType: 'Apartment', transactionType: 'rent', price: 900, area: 70, bedrooms: 3, bathrooms: 1 }],
    ]
    for (const [k, extra] of rows) {
      const res = await a.post('/api/admin/developer-properties', { data: { developerId, name: N(k), status: 'ready', city: 'Oviedo', ...extra } })
      expect(res.ok(), await res.text()).toBeTruthy()
      ids[k] = (await res.json()).id
      cleanup.push(() => a.delete(`/api/admin/developer-properties/${ids[k]}?hard=1`))
    }
    // Subtipo del ático, situación anunciada del local y modalidad del alquiler (ficha ampliada).
    for (const [k, data] of [['atico', { subtype: 'penthouse' }], ['local', { listingSituation: 'rented' }], ['alquiler', { rentalTerm: 'seasonal' }]] as const) {
      const put = await a.put(`/api/admin/developer-properties/${ids[k]}`, { data })
      expect(put.ok(), await put.text()).toBeTruthy()
    }

    // Otra agencia, con su propio municipio: nunca debe verse desde la web de la agencia 1.
    const devB = await b.post('/api/admin/developers', { data: { name: `Buscador ajena ${RUN}`, email: `busc-b-${RUN}@mm.test`, status: 'active' } })
    expect(devB.ok(), await devB.text()).toBeTruthy()
    const developerB = (await devB.json()).id
    cleanup.push(() => b.delete(`/api/admin/developers/${developerB}`))
    const other = await b.post('/api/admin/developer-properties', { data: { developerId: developerB, name: `Ajena ${RUN}`, status: 'ready', city: ISOLATED, price: 250000, bedrooms: 3 } })
    expect(other.ok(), await other.text()).toBeTruthy()
    const otherId = (await other.json()).id
    cleanup.push(() => b.delete(`/api/admin/developer-properties/${otherId}?hard=1`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose(), anon?.dispose()])
  })

  const api = async (params: Record<string, string | string[]>) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) for (const x of [v].flat()) qs.append(k, x)
    return (await (await anon.get(`/api/public/properties?${qs}`)).json()) as { total: number; rows: { id: number; name: string }[] }
  }
  const apiTotal = async (params: Record<string, string | string[]>) => (await api({ countOnly: '1', ...params })).total

  test.describe('recorrido de 30 pasos', () => {
    test.use({ storageState: STATE_A })

    test('1–5 · Constructor › Inicio: el Hero conserva su diseño, sin sus dos botones y sólo Comprar | Alquilar', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/admin/site-builder')
      const hero = page.frameLocator(CANVAS).locator('section.hero')
      await expect(hero).toBeVisible({ timeout: 15_000 })
      await expect(hero.locator('h1')).toBeVisible()
      await expect(hero.getByTestId('hero-search')).toBeVisible()
      for (const name of [/ver propiedades/i, /explorar catálogo/i, /hablar con un asesor/i]) await expect(hero.getByRole('link', { name })).toHaveCount(0)
      await expect(hero.locator('button.tab')).toHaveText(['Comprar', 'Alquilar'])
    })

    test('6–10 · vista previa sin franja, aviso de cookies, Rechazar y reabrir las preferencias', async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: STATE_A })
      const page = await ctx.newPage()
      // La decisión de la vista previa, borrada sólo al entrar: así sale el aviso.
      await page.addInitScript(() => {
        if (!sessionStorage.getItem('e2e-consent-cleared')) {
          localStorage.removeItem('inmo_cookie_consent:preview')
          sessionStorage.setItem('e2e-consent-cleared', '1')
        }
      })
      await page.goto(HOME)
      await expect(page.locator('section.hero')).toBeVisible()
      await expect(page.getByTestId('site-preview-bar')).toHaveCount(0)
      expect((await page.locator('header').first().boundingBox())?.y).toBe(0)

      const notice = page.getByTestId('cookie-consent')
      await expect(notice).toBeVisible()
      await notice.getByTestId('cookie-reject').click()
      await expect(notice).toHaveCount(0)
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('inmo_cookie_consent:preview') || 'null'))
      expect(stored?.c?.analytics).toBe(false)
      expect(stored?.c?.thirdParty).toBe(false)

      await page.getByTestId('footer-cookie-settings').click()
      await expect(page.getByTestId('cookie-consent')).toBeVisible()
      await expect(page.getByTestId('cookie-toggle-analytics')).toBeVisible()
      await ctx.close()
    })

    test('11–27 · Hero: Comprar, «Ovie» → Oviedo, precio con slider y a mano, 3+ habitaciones, Buscar; el listado lo aplica y sigue filtrando; Alquilar', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(HOME)
      const hero = page.locator('section.hero')
      // 11. Comprar.
      const buy = hero.locator('button.tab', { hasText: 'Comprar' })
      await buy.click()
      await expect(buy).toHaveAttribute('aria-pressed', 'true')

      // 12–13. Ubicación con sugerencias reales.
      await page.getByTestId('hero-cell-location').click()
      const locPop = page.getByTestId('hero-pop-location')
      await locPop.getByTestId('location-input').pressSequentially('Ovie', { delay: 40 })
      const oviedo = locPop.locator('[data-testid="location-option-municipality"][data-value="Oviedo"]')
      await expect(oviedo).toBeVisible()
      await oviedo.click()
      await expect(page.getByTestId('hero-cell-location')).toContainText('Oviedo')

      // 14–18. Precio: los dos extremos, después un importe a mano; el slider lo sigue.
      await page.getByTestId('hero-cell-price').click()
      const pricePop = page.getByTestId('hero-pop-price')
      await slide(pricePop.getByTestId('price-min-handle'), 500) // 150.000
      await slide(pricePop.getByTestId('price-max-handle'), 1300) // 450.000
      await expect(pricePop.getByTestId('price-min-input')).toHaveValue('150.000')
      await expect(pricePop.getByTestId('price-max-input')).toHaveValue('450.000')
      await pricePop.getByTestId('price-max-input').fill('420000')
      await pricePop.getByTestId('price-max-input').press('Enter')
      await expect(pricePop.getByTestId('price-max-handle')).toHaveValue('1240') // entre 400.000 (1200) y 450.000 (1300)
      await expect(pricePop.getByTestId('price-summary')).toContainText('420')
      // Un mínimo por encima del máximo no se acepta: se avisa y no cambia nada.
      await pricePop.getByTestId('price-min-input').fill('500000')
      await pricePop.getByTestId('price-min-input').press('Enter')
      await expect(pricePop.getByTestId('price-error')).toBeVisible()
      await pricePop.getByTestId('price-min-input').fill('150000')
      await pricePop.getByTestId('price-min-input').press('Enter')
      await expect(pricePop.getByTestId('price-error')).toHaveCount(0)

      // 19. 3+ habitaciones.
      await page.getByTestId('hero-cell-beds').click()
      await page.getByTestId('hero-beds-3').click()
      await expect(page.getByTestId('hero-cell-beds')).toContainText('3+')

      // 20–21. Buscar abre Propiedades con la búsqueda en la URL.
      await page.getByTestId('hero-search').click()
      await expect(page).toHaveURL(/\/propiedades\?/)
      const url = new URL(page.url())
      expect(url.searchParams.get('operacion')).toBe('venta')
      expect(url.searchParams.getAll('municipality')).toEqual(['Oviedo'])
      expect(url.searchParams.get('minPrice')).toBe('150000')
      expect(url.searchParams.get('maxPrice')).toBe('420000')
      expect(url.searchParams.get('bedrooms')).toBe('3')

      // 22. Filtros activos.
      await expect(page.locator('[data-chip="operacion"]')).toHaveText('En venta')
      await expect(page.locator('[data-chip="municipality:Oviedo"]')).toHaveText('Oviedo')
      await expect(page.locator('[data-chip="price"]')).toContainText('420')
      await expect(page.locator('[data-chip="bedrooms"]')).toHaveText('3+ habitaciones')
      // El panel lateral enseña lo mismo.
      const aside = page.getByTestId('catalog-aside')
      await expect(aside.getByTestId('catalog-operation-venta')).toHaveAttribute('aria-checked', 'true')
      await expect(aside.locator('[data-location="Oviedo"]')).toBeVisible()

      // 23. Resultados reales.
      const base = { operacion: 'venta', municipality: 'Oviedo', minPrice: '150000', maxPrice: '420000', bedrooms: '3' }
      await expect(page.getByTestId('catalog-total')).toContainText(String(await apiTotal(base)))
      await expect(page.getByText(N('piso'))).toBeVisible()
      await expect(page.getByText(N('atico'))).toBeVisible()
      for (const k of ['estudio', 'local', 'alquiler']) await expect(page.getByText(N(k))).toHaveCount(0)

      // 24–25. Un filtro del panel: Terraza.
      await aside.locator('[data-group="features"] > button').click()
      await aside.getByTestId('catalog-feature-terrace').check()
      await expect(page).toHaveURL(/terrace=1/)
      await expect(page.getByTestId('catalog-total')).toContainText(String(await apiTotal({ ...base, terrace: '1' })))
      await expect(page.getByText(N('atico'))).toHaveCount(0)
      await expect(page.getByText(N('piso'))).toBeVisible()

      // 26–27. Alquilar: fuera el precio de venta, la escala pasa a rentas y sale «Tipo de alquiler».
      await aside.getByTestId('catalog-operation-alquiler').click()
      await expect(page).toHaveURL(/operacion=alquiler/)
      await expect(page).not.toHaveURL(/minPrice=|maxPrice=/)
      await expect(page.locator('[data-chip="price"]')).toHaveCount(0)
      // El grupo Precio sigue abierto (llegó con precio): ahora con la escala de rentas.
      await expect(aside.getByTestId('price-range')).toContainText('Renta mensual')
      await expect(aside.locator('[data-group="rental"]')).toBeVisible()
      await page.locator('[data-chip="terrace"]').click()
      await expect(page.getByText(N('alquiler'))).toBeVisible()
      await expect(page.getByTestId('catalog-total')).toContainText(String(await apiTotal({ operacion: 'alquiler', municipality: 'Oviedo', bedrooms: '3' })))
      // Una renta, no un precio de venta: el máximo de la escala es de alquiler.
      await slide(aside.getByTestId('price-max-handle'), 100)
      await expect(page).toHaveURL(/maxPrice=300(&|$)/)
    })

    test('28 · móvil: Hero y listado sin desbordes, el panel en su cajón', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(HOME)
      await expect(page.getByTestId('hero-search')).toBeVisible()
      await noHorizontalScroll(page)
      await page.getByTestId('hero-cell-price').click()
      const pop = page.getByTestId('hero-pop-price')
      await expect(pop).toBeVisible()
      const box = await pop.boundingBox()
      expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 390).toBe(true)

      await page.goto('/propiedades?operacion=alquiler&municipality=Oviedo')
      await expect(page.getByTestId('catalog-aside')).toBeHidden()
      await page.getByTestId('catalog-open-drawer').click()
      const drawer = page.getByTestId('catalog-drawer')
      await expect(drawer.getByTestId('catalog-operation-alquiler')).toHaveAttribute('aria-checked', 'true')
      await drawer.getByTestId('catalog-show-results').click()
      await expect(drawer).toHaveCount(0)
      await noHorizontalScroll(page)
    })
  })

  test('29 · la web publicada, sin sesión, da lo mismo que el API', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ANON_STATE })
    const page = await ctx.newPage()
    await page.goto('/propiedades?operacion=venta&municipality=Oviedo&bedrooms=3')
    await expect(page.getByTestId('catalog-total')).toContainText(String(await apiTotal({ operacion: 'venta', municipality: 'Oviedo', bedrooms: '3' })))
    await expect(page.getByText(N('atico'))).toBeVisible()
    await ctx.close()
  })

  test('30 · aislamiento: el municipio de otra agencia ni se sugiere ni se encuentra', async ({ page }) => {
    const suggest = await (await anon.get('/api/public/location-suggest', { params: { q: ISOLATED } })).json()
    expect(suggest.items).toEqual([])
    expect(await apiTotal({ municipality: ISOLATED })).toBe(0)
    await page.goto('/propiedades')
    const aside = page.getByTestId('catalog-aside')
    await aside.getByTestId('location-input').fill(ISOLATED)
    await expect(aside.getByTestId('location-empty')).toBeVisible()
    // Y una búsqueda escrita a mano en la URL tampoco la trae.
    await page.goto(`/propiedades?municipality=${encodeURIComponent(ISOLATED)}`)
    await expect(page.getByTestId('catalog-total')).toContainText('0')
    await expect(page.getByText(`Ajena ${RUN}`)).toHaveCount(0)
  })

  test.describe('listado', () => {
    test('«Ordenar por»: Relevancia | Baratos | Recientes | Más, ocho ordenaciones del servidor, sin «Recomendado»', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.goto('/propiedades?municipality=Oviedo')
      const bar = page.getByTestId('sort-bar')
      await expect(bar.locator('button.sb-btn')).toHaveText(['Relevancia', 'Baratos', 'Recientes', /Más/])
      await expect(page.getByText('Recomendado', { exact: true })).toHaveCount(0)
      await bar.getByTestId('sort-more').click()
      await expect(page.getByTestId('sort-menu').getByRole('menuitemradio')).toHaveText(['Precio más alto', 'Antiguos', 'Han bajado más', 'Baratos €/m²', 'Caros €/m²'])
      await page.getByTestId('sort-price_desc').click()
      await expect(page).toHaveURL(/sort=price_desc/)
      await expect(bar.getByTestId('sort-more')).toContainText('Precio más alto')
      // El orden de las tarjetas es el del servidor.
      const expected = (await api({ operacion: 'venta', municipality: 'Oviedo', sort: 'price_desc', perPage: '6' })).rows.map((r) => r.name)
      await expect.poll(async () => (await page.locator('[data-card-variant="catalog"] h3').allTextContents()).slice(0, expected.length).map((s) => s.trim())).toEqual(expected)
      await bar.getByTestId('sort-price_asc').click()
      await expect(page).toHaveURL(/sort=price_asc/)
      await bar.getByTestId('sort-relevance').click()
      await expect(page).not.toHaveURL(/sort=/)
    })

    test('tipo con subtipos, «Situación de la vivienda» y chips por valor; «Nueva búsqueda» lo reinicia todo', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.goto('/propiedades?municipality=Oviedo&sort=newest&q=Buscador')
      const aside = page.getByTestId('catalog-aside')

      // Viviendas › Ático › sólo su subtipo «Ático»: entra el ático, no el piso; «Sobreático», ninguno.
      await aside.locator('[data-group="type"] > button').click()
      await aside.locator('[data-category="homes"] > .tt-row .tt-exp').click()
      await aside.locator('[data-type="Penthouse"] .tt-exp').click()
      await aside.getByTestId('public-filter-subtype-penthouse').check()
      await expect(page).toHaveURL(/subtype=penthouse/)
      await expect(page.getByText(N('atico'))).toBeVisible()
      await expect(page.getByText(N('piso'))).toHaveCount(0)
      await expect(page.locator('[data-chip="subtype:penthouse"]')).toHaveText('Ático')
      await aside.getByTestId('public-filter-subtype-penthouse').uncheck()
      await aside.getByTestId('public-filter-subtype-sub_penthouse').check()
      await expect(page.getByTestId('catalog-total')).toContainText(String(await apiTotal({ operacion: 'venta', municipality: 'Oviedo', q: 'Buscador', subtype: 'sub_penthouse' })))
      await expect(page.getByText(N('atico'))).toHaveCount(0)
      await page.locator('[data-chip="subtype:sub_penthouse"]').click()
      // El tipo entero.
      await aside.getByTestId('public-filter-type-Penthouse').check()
      await expect(page).toHaveURL(/type=Penthouse/)
      await expect(page.getByText(N('atico'))).toBeVisible()
      await expect(page.getByText(N('piso'))).toHaveCount(0)
      // Sólo locales: habitaciones y baños dejan de tener sentido y se van.
      await page.locator('[data-chip="type:Penthouse"]').click()
      await aside.getByTestId('public-filter-type-Retail').check()
      await expect(aside.locator('[data-group="bedrooms"]')).toHaveCount(0)
      await expect(aside.locator('[data-group="bathrooms"]')).toHaveCount(0)

      // Situación anunciada por la agencia (el local, «alquilada con inquilinos»).
      await aside.locator('[data-group="situation"] > button').click()
      await aside.getByTestId('catalog-situation-rented').check()
      await expect(page).toHaveURL(/situacion=rented/)
      await expect(page.getByText(N('local'))).toBeVisible()
      await expect(page.locator('[data-chip="situacion:rented"]')).toHaveText('Alquilada, con inquilinos')

      // Nueva búsqueda: fuera filtros, texto y orden; vuelve a la operación de partida.
      await aside.getByTestId('catalog-new-search').click()
      await expect(page).toHaveURL(/\/propiedades$/)
      await expect(page.locator('[data-chip]')).toHaveCount(0)
      await expect(page.getByTestId('sort-relevance')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('[data-testid="catalog-search"] input')).toBeFocused()
    })

    test('Alquilar: «Tipo de alquiler» con temporada y larga estancia (sin indicar = larga)', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.goto('/propiedades?operacion=alquiler&municipality=Oviedo&q=Buscador')
      const aside = page.getByTestId('catalog-aside')
      await aside.locator('[data-group="rental"] > button').click()
      await aside.getByTestId('catalog-rental-long_term').check()
      await expect(page).toHaveURL(/rentalTerm=long_term/)
      await expect(page.getByText(N('alquiler'))).toHaveCount(0)
      await aside.getByTestId('catalog-rental-long_term').uncheck()
      await aside.getByTestId('catalog-rental-seasonal').check()
      await expect(page.getByText(N('alquiler'))).toBeVisible()
      // Volver a Comprar quita lo que sólo vale para alquilar.
      await aside.getByTestId('catalog-operation-venta').click()
      await expect(page).not.toHaveURL(/rentalTerm=/)
      await expect(aside.locator('[data-group="rental"]')).toHaveCount(0)
    })

    test.describe('desde el Constructor', () => {
      test.use({ storageState: STATE_A })

      test('sin «Ordenar por», arrancando en Alquilar y con Situación abierta: en el lienzo y, al publicar, en la web', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        try {
          await page.goto('/admin/site-builder?pagina=propiedades')
          const canvas = page.frameLocator(CANVAS)
          const preview = canvas.getByTestId('page-core-preview')
          await expect(preview).toBeVisible({ timeout: 15_000 })
          await preview.click()
          const inspector = page.getByTestId('page-core-inspector')
          await expect(canvas.getByTestId('page-core-sort-preview')).toBeVisible()
          await inspector.getByTestId('page-core-show-sort').getByRole('switch').click()
          await expect(canvas.getByTestId('page-core-sort-preview')).toHaveCount(0)
          await inspector.getByTestId('page-core-default-operation').getByRole('button', { name: 'Alquilar' }).click()
          await inspector.getByTestId('page-core-filters').locator('li[data-section="situation"]').getByTestId('page-core-filter-open').click()
          await expect
            .poll(async () => {
              const draft = await (await a.get('/api/admin/site-pages/propiedades')).json()
              const core = (draft.blocks as any[]).find((blk) => blk.type === 'page-core')
              return [core?.content?.showSort, core?.content?.defaultOperation, (core?.content?.filters || []).find((x: any) => x.key === 'situation')?.open].join()
            }, { timeout: 10_000 })
            .toBe('false,alquiler,true')
          await page.getByRole('button', { name: 'Publicar cambios' }).click()
          await expect(page.getByTestId('site-page-status-propiedades')).toHaveText('Publicada')

          const web = await page.context().newPage()
          await web.setViewportSize({ width: 1440, height: 900 })
          await web.goto('/propiedades')
          await expect(web.getByTestId('catalog-aside').getByTestId('catalog-operation-alquiler')).toHaveAttribute('aria-checked', 'true')
          await expect(web.getByTestId('sort-bar')).toHaveCount(0)
          await expect(web.getByTestId('catalog-total')).toContainText((await apiTotal({ operacion: 'alquiler' })).toLocaleString('es-ES'))
          await web.close()
        } finally {
          expect((await a.delete('/api/admin/site-pages/propiedades')).ok()).toBeTruthy()
        }
      })
    })
  })
})
