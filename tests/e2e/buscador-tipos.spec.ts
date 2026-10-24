import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * «Tipo de inmueble» del buscador global. En el HERO de la portada el selector
 * se simplifica a SEIS categorías grandes (Cola 13): Viviendas, Locales,
 * Oficinas, Garaje, Terreno y Naves —sin tipos sueltos, familias ni subtipos—;
 * elegir una busca todos sus tipos reales a la vez. El PANEL de Propiedades
 * conserva el catálogo entero de Property Core (los 15 tipos y sus subtipos).
 * Lo mismo con Comprar y con Alquilar; una categoría sin inventario se puede
 * elegir y da cero resultados.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const HOME = '/?vista_previa=1'
const CITY = `Tiposville ${RUN}`
const N = (k: string) => `Tipos ${k} ${RUN}`
const ALL_TYPES = ['Apartment', 'House', 'Villa', 'Townhouse', 'Penthouse', 'Duplex', 'Studio', 'Finca', 'Land', 'Retail', 'Office', 'Warehouse', 'Garage', 'Building', 'Development']
const HERO_CATS = ['homes', 'retail', 'office', 'garage', 'land', 'warehouse']

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

test.describe('Buscador global · Tipo de inmueble', () => {
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const dev = await a.post('/api/admin/developers', { data: { name: `Tipos promotora ${RUN}`, email: `tipos-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
    const rows: [string, Record<string, unknown>][] = [
      ['piso', { propertyType: 'Apartment', price: 210000, area: 95, bedrooms: 3, bathrooms: 2 }],
      ['atico', { propertyType: 'Penthouse', price: 380000, area: 130, bedrooms: 3, bathrooms: 1 }],
      ['local', { propertyType: 'Retail', price: 150000, area: 80 }],
    ]
    for (const [k, extra] of rows) {
      const res = await a.post('/api/admin/developer-properties', { data: { developerId, name: N(k), status: 'ready', city: CITY, ...extra } })
      expect(res.ok(), await res.text()).toBeTruthy()
      const id = (await res.json()).id
      cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    }
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), anon?.dispose()])
  })

  const apiTotal = async (params: Record<string, string | string[]>) => {
    const qs = new URLSearchParams({ countOnly: '1' })
    for (const [k, v] of Object.entries(params)) for (const x of [v].flat()) qs.append(k, x)
    return ((await (await anon.get(`/api/public/properties?${qs}`)).json()) as { total: number }).total
  }

  test('Hero · se abre con las seis categorías grandes, desplegables a sus tipos/subtipos reales', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    await page.locator('section.hero').getByTestId('hero-cell-type').click()
    const pop = page.getByTestId('hero-pop-type')
    await expect(pop).toBeVisible()
    // Exactamente las seis categorías.
    await expect(pop.locator('.tp-hero-cat')).toHaveCount(6)
    for (const g of HERO_CATS) await expect(pop.getByTestId(`type-cat-${g}`)).toBeVisible()
    // Cada categoría tiene su flecha para desplegar; de partida, todo recogido (ningún tipo/subtipo a la vista).
    for (const g of HERO_CATS) await expect(pop.getByTestId(`type-cat-expand-${g}`)).toBeVisible()
    await expect(pop.locator('[data-testid^="type-leaf-"]')).toHaveCount(0)
    await expect(pop.locator('[data-testid^="subtype-leaf-"]')).toHaveCount(0)
    // Desplegar «Viviendas» muestra sus TIPOS reales (Piso, Casa, Chalet, Ático…).
    await pop.getByTestId('type-cat-expand-homes').click()
    for (const ty of ['Apartment', 'House', 'Villa', 'Penthouse', 'Duplex', 'Studio', 'Townhouse']) {
      await expect(pop.getByTestId(`type-leaf-${ty}`)).toBeVisible()
    }
    // Volver a pulsar la recoge.
    await pop.getByTestId('type-cat-expand-homes').click()
    await expect(pop.locator('[data-testid^="type-leaf-"]')).toHaveCount(0)
    // Una categoría de un solo tipo (Garaje) despliega los SUBTIPOS reales de ese tipo.
    await pop.getByTestId('type-cat-expand-garage').click()
    await expect(pop.getByTestId('subtype-leaf-car')).toBeVisible()
    await expect(pop.getByTestId('subtype-leaf-closed')).toBeVisible()
    // El número junto a una categoría es el inventario real de la agencia.
    const retail = await apiTotal({ type: 'Retail' })
    await expect(pop.locator('[data-category="retail"] > .tp-hero-row .tp-count')).toHaveText(String(retail))
    // Una categoría sin inventario (Naves) sigue ahí, seleccionable, y sin número.
    await expect(pop.locator('[data-category="warehouse"] > .tp-hero-row .tp-count')).toHaveCount(0)
    await expect(pop.getByTestId('type-cat-warehouse')).toBeEnabled()
  })

  test('Hero · jerárquico: elegir un tipo, un subtipo y combinar categorías; estado parcial de la categoría', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    const cell = page.locator('section.hero').getByTestId('hero-cell-type')
    await cell.click()
    const pop = page.getByTestId('hero-pop-type')
    // Un solo tipo de Viviendas: Piso (Apartment).
    await pop.getByTestId('type-cat-expand-homes').click()
    await pop.getByTestId('type-leaf-Apartment').check()
    await expect(cell).toContainText('Piso')
    // La categoría «Viviendas» queda en estado PARCIAL (indeterminado), no marcada del todo.
    expect(await pop.getByTestId('type-cat-homes').evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true)
    await expect(pop.getByTestId('type-cat-homes')).not.toBeChecked()
    // Añadir Ático (otro tipo de Viviendas) y un subtipo de otra categoría (Terreno · Suelo urbano).
    await pop.getByTestId('type-leaf-Penthouse').check()
    await pop.getByTestId('type-cat-expand-land').click()
    await pop.getByTestId('subtype-leaf-urban').check()
    await pop.getByTestId('hero-type-done').click()
    // Lo elegido llega a Propiedades: type=Apartment, type=Penthouse y subtype=urban.
    await page.locator('section.hero').getByTestId('hero-search').click()
    await expect(page).toHaveURL(/\/propiedades\?/)
    await expect(page).toHaveURL(/type=Apartment/)
    await expect(page).toHaveURL(/type=Penthouse/)
    await expect(page).toHaveURL(/subtype=urban/)
    // Los resultados son reales: coincide con la API (piso + ático existen; terreno urbano, cero).
    const aside = page.getByTestId('catalog-aside')
    const typeHead = aside.locator('[data-group="type"] > button')
    if ((await typeHead.getAttribute('aria-expanded')) !== 'true') await typeHead.click()
    for (const ty of ['Apartment', 'Penthouse']) await expect(aside.getByTestId(`public-filter-type-${ty}`), ty).toBeChecked()
  })

  test('Hero · selección simple, múltiple y de categoría entera; limpieza y resumen del campo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    const cell = page.locator('section.hero').getByTestId('hero-cell-type')
    await cell.click()
    const pop = page.getByTestId('hero-pop-type')
    await expect(cell).toContainText('Cualquiera')
    await pop.getByTestId('type-cat-retail').check()
    await expect(cell).toContainText('Locales')
    await pop.getByTestId('type-cat-office').check()
    await expect(cell).toContainText('Locales y oficinas')
    await pop.getByTestId('type-cat-warehouse').check()
    await expect(cell).toContainText('3 tipos seleccionados')
    // Quitar una no reinicia el resto.
    await pop.getByTestId('type-cat-warehouse').uncheck()
    await expect(cell).toContainText('Locales y oficinas')
    // Limpiar.
    await pop.getByTestId('hero-type-clear').click()
    await expect(cell).toContainText('Cualquiera')
    for (const g of HERO_CATS) await expect(pop.getByTestId(`type-cat-${g}`)).not.toBeChecked()

    // «Viviendas» entera: marca todos sus tipos (pisos, casas, chalets… y también edificios y promociones) y se nombra por la categoría.
    await pop.getByTestId('type-cat-homes').check()
    await expect(cell).toContainText('Viviendas')
    await pop.getByTestId('hero-type-done').click()
    await expect(pop).toHaveCount(0)

    // Lo elegido llega a Propiedades con varios type= (los de la categoría) y el panel los marca.
    await page.locator('section.hero').getByTestId('hero-search').click()
    await expect(page).toHaveURL(/\/propiedades\?/)
    await expect(page).toHaveURL(/type=Apartment/)
    await expect(page).toHaveURL(/type=Building/)
    const aside = page.getByTestId('catalog-aside')
    const typeHead = aside.locator('[data-group="type"] > button')
    if ((await typeHead.getAttribute('aria-expanded')) !== 'true') await typeHead.click()
    for (const ty of ['Apartment', 'House', 'Building', 'Development']) await expect(aside.getByTestId(`public-filter-type-${ty}`), ty).toBeChecked()
  })

  test('Hero · Comprar y Alquilar comparten catálogo y conservan lo elegido; Naves (sin inventario) da cero', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    const hero = page.locator('section.hero')
    await hero.getByTestId('hero-cell-type').click()
    await page.getByTestId('hero-pop-type').getByTestId('type-cat-warehouse').check()
    await page.getByTestId('hero-type-done').click()
    await expect(hero.getByTestId('hero-cell-type')).toContainText('Naves')
    // Cambiar a Alquilar no pierde la categoría (sólo el precio, que no comparte escala).
    await hero.getByTestId('hero-operation').locator('button[data-op="rent"]').click()
    await expect(hero.getByTestId('hero-cell-type')).toContainText('Naves')
    await hero.getByTestId('hero-cell-type').click()
    await expect(page.getByTestId('hero-pop-type').getByTestId('type-cat-warehouse')).toBeChecked()
    await page.getByTestId('hero-type-done').click()
    await hero.getByTestId('hero-search').click()
    await expect(page).toHaveURL(/operacion=alquiler/)
    await expect(page).toHaveURL(/type=Warehouse/)
    expect(await apiTotal({ type: 'Warehouse', operacion: 'alquiler' })).toBe(0)
    await expect(page.getByTestId('catalog-total')).toContainText('0')
    // En el panel sigue el catálogo ENTERO y la nave marcada.
    const aside = page.getByTestId('catalog-aside')
    const typeHead = aside.locator('[data-group="type"] > button')
    if ((await typeHead.getAttribute('aria-expanded')) !== 'true') await typeHead.click()
    await expect(aside.getByTestId('public-filter-type-Warehouse')).toBeChecked()
    for (const ty of ALL_TYPES) await expect(aside.getByTestId(`public-filter-type-${ty}`), ty).toBeVisible()
    await expect(aside.locator('.tt-exp')).toHaveCount(0)
  })

  test('Hero móvil: el selector se abre como hoja inferior con las seis categorías, sin desbordes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(HOME)
    // La entrada del buscador (animación «rise», 0,9 s) termina antes de medir: mientras dura,
    // su transform es el bloque contenedor de la hoja y ésta se recoloca al acabar.
    await page.evaluate(() => Promise.all([...document.querySelectorAll('.rise')].flatMap((el) => el.getAnimations().map((a) => a.finished.catch(() => null)))))
    await page.locator('section.hero').getByTestId('hero-cell-type').click()
    const pop = page.getByTestId('hero-pop-type')
    await expect(pop).toBeVisible()
    // Diagnóstico: qué ancestro convierte a la hoja fija en relativa a él (transform/filter/contain/will-change).
    const blockers = await pop.evaluate((el) => {
      const out: string[] = []
      for (let a = el.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a)
        const bad = ['transform', 'filter', 'backdropFilter', 'perspective', 'contain', 'willChange', 'translate', 'scale', 'rotate'].filter((k) => { const v = (cs as any)[k]; return v && v !== 'none' && v !== 'auto' && v !== 'normal' })
        if (bad.length) out.push(`${a.tagName.toLowerCase()}.${String(a.className).split(' ').slice(0, 3).join('.')} → ${bad.map((k) => `${k}=${(cs as any)[k]}`).join(' ')}`)
      }
      return out
    })
    // La hoja entra con una transición breve (escala 0,98): se mide cuando reposa.
    await expect(async () => {
      const b = (await pop.boundingBox())!
      expect(Math.abs(b.y + b.height - 844), `hoja en y=${b.y} h=${b.height}; ancestros: ${blockers.join(' | ') || 'ninguno'}`).toBeLessThanOrEqual(2)
      expect(b.width).toBeGreaterThanOrEqual(388)
    }).toPass({ timeout: 4000 })
    for (const g of HERO_CATS) await expect(pop.getByTestId(`type-cat-${g}`), g).toBeAttached()
    await pop.getByTestId('type-cat-land').check()
    await expect(page.locator('section.hero').getByTestId('hero-cell-type')).toContainText('Terreno')
    await noHorizontalScroll(page)
    await pop.getByTestId('hero-type-done').click()
    await expect(pop).toHaveCount(0)
  })
})
