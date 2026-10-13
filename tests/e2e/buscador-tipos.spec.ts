import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * «Tipo de inmueble» del buscador global (megaprompt «Evolución global del
 * buscador», Parte I): el catálogo entero de Property Core a la vista nada más
 * abrir el desplegable —sin paso intermedio—, agrupado, con selección
 * individual, múltiple, por grupo (con estado parcial), limpieza y resumen en
 * el campo; lo mismo con Comprar y con Alquilar; un tipo sin inventario se
 * puede elegir. El mismo selector en el panel de Propiedades.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const HOME = '/?vista_previa=1'
const CITY = `Tiposville ${RUN}`
const N = (k: string) => `Tipos ${k} ${RUN}`
const ALL_TYPES = ['Apartment', 'House', 'Villa', 'Townhouse', 'Penthouse', 'Duplex', 'Studio', 'Finca', 'Land', 'Retail', 'Office', 'Warehouse', 'Garage', 'Building', 'Development']

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}
const indeterminate = (page: Page, testId: string) => page.getByTestId(testId).evaluate((el) => (el as HTMLInputElement).indeterminate)

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

  test('1–4 · se abre directamente con el catálogo completo: grupos, los 15 tipos y sus subtipos a la vista, sin desplegables', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    await page.locator('section.hero').getByTestId('hero-cell-type').click()
    const pop = page.getByTestId('hero-pop-type')
    await expect(pop).toBeVisible()
    // Sin paso intermedio: ningún botón de desplegar; los cuatro grupos y todos los tipos.
    await expect(pop.locator('.tt-exp, [aria-expanded]')).toHaveCount(0)
    for (const g of ['homes', 'commercial', 'land', 'other']) await expect(pop.getByTestId(`type-cat-${g}`)).toBeVisible()
    for (const ty of ALL_TYPES) await expect(pop.getByTestId(`public-filter-type-${ty}`), ty).toBeVisible()
    // Familias de Viviendas y subtipos visibles sin pulsar nada.
    await expect(pop.getByTestId('type-family-flats')).toBeVisible()
    await expect(pop.getByTestId('type-family-houses')).toBeVisible()
    await expect(pop.getByTestId('public-filter-subtype-penthouse')).toBeVisible()
    await expect(pop.getByTestId('public-filter-subtype-detached_villa')).toBeVisible()
    await expect(pop.getByTestId('public-filter-subtype-urban')).toBeVisible()
    // El número junto a un tipo es el inventario real de la agencia (y un tipo a cero sigue ahí).
    const apartments = await apiTotal({ type: 'Apartment' })
    await expect(pop.locator('[data-type="Apartment"] .tp-count')).toHaveText(String(apartments))
    await expect(pop.locator('[data-type="Warehouse"] .tp-count')).toHaveCount(0)
    await expect(pop.getByTestId('public-filter-type-Warehouse')).toBeEnabled()
  })

  test('5–10 · selección individual, múltiple, de grupo (con estado parcial) y de subtipo; limpieza y resumen del campo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    const cell = page.locator('section.hero').getByTestId('hero-cell-type')
    await cell.click()
    const pop = page.getByTestId('hero-pop-type')
    await expect(cell).toContainText('Cualquiera')
    await pop.getByTestId('public-filter-type-Apartment').check()
    await expect(cell).toContainText('Piso')
    await pop.getByTestId('public-filter-type-Penthouse').check()
    await expect(cell).toContainText('Piso y ático')
    await pop.getByTestId('public-filter-type-Retail').check()
    await expect(cell).toContainText('3 tipos seleccionados')
    // Quitar una selección no reinicia el resto.
    await pop.getByTestId('public-filter-type-Retail').uncheck()
    await expect(cell).toContainText('Piso y ático')
    // Limpiar.
    await pop.getByTestId('hero-type-clear').click()
    await expect(cell).toContainText('Cualquiera')
    for (const ty of ALL_TYPES) await expect(pop.getByTestId(`public-filter-type-${ty}`)).not.toBeChecked()

    // Un grupo entero: sus cuatro tipos y el nombre del grupo en el campo.
    await pop.getByTestId('type-cat-commercial').check()
    for (const ty of ['Retail', 'Office', 'Warehouse', 'Building']) await expect(pop.getByTestId(`public-filter-type-${ty}`)).toBeChecked()
    await expect(cell).toContainText('Inmuebles comerciales')
    // Quitar uno: el grupo queda parcial, el resto sigue.
    await pop.getByTestId('public-filter-type-Office').uncheck()
    expect(await indeterminate(page, 'type-cat-commercial')).toBe(true)
    await expect(pop.getByTestId('type-cat-commercial')).not.toBeChecked()
    await expect(cell).toContainText('3 tipos seleccionados')
    // Pulsar el grupo parcial lo completa (como una casilla de tres estados); otra vez, lo vacía entero.
    await pop.getByTestId('type-cat-commercial').click()
    await expect(pop.getByTestId('type-cat-commercial')).toBeChecked()
    await expect(cell).toContainText('Inmuebles comerciales')
    await pop.getByTestId('type-cat-commercial').click()
    await expect(cell).toContainText('Cualquiera')

    // Una familia entera («Pisos») y un subtipo suelto: el tipo queda parcial.
    await pop.getByTestId('type-family-flats').check()
    await expect(cell).toContainText('Pisos')
    expect(await indeterminate(page, 'type-cat-homes')).toBe(true)
    await pop.getByTestId('type-family-flats').uncheck()
    await pop.getByTestId('public-filter-subtype-penthouse').check()
    expect(await indeterminate(page, 'public-filter-type-Penthouse')).toBe(true)
    await expect(cell).toContainText('Ático')
    await pop.getByTestId('hero-type-done').click()
    await expect(pop).toHaveCount(0)

    // Lo elegido llega a Propiedades con sus resultados reales.
    await page.locator('section.hero').getByTestId('hero-search').click()
    await expect(page).toHaveURL(/\/propiedades\?.*subtype=penthouse/)
    await expect(page.getByTestId('catalog-total')).toContainText(String(await apiTotal({ subtype: 'penthouse', operacion: 'venta' })))
    await expect(page.getByTestId('catalog-aside').getByTestId('public-filter-subtype-penthouse')).toBeChecked()
  })

  test('11–13 · Comprar y Alquilar comparten catálogo y conservan lo elegido; un tipo sin inventario se elige y da cero resultados', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    const hero = page.locator('section.hero')
    await hero.getByTestId('hero-cell-type').click()
    await page.getByTestId('hero-pop-type').getByTestId('public-filter-type-Warehouse').check()
    await page.getByTestId('hero-type-done').click()
    await expect(hero.getByTestId('hero-cell-type')).toContainText('Nave')
    // Cambiar a Alquilar no pierde el tipo (sólo el precio, que no comparte escala).
    await hero.getByTestId('hero-operation').locator('button[data-op="rent"]').click()
    await expect(hero.getByTestId('hero-cell-type')).toContainText('Nave')
    await hero.getByTestId('hero-cell-type').click()
    await expect(page.getByTestId('hero-pop-type').getByTestId('public-filter-type-Warehouse')).toBeChecked()
    await expect(page.getByTestId('hero-pop-type').getByTestId('public-filter-type-Apartment')).toBeVisible()
    await page.getByTestId('hero-type-done').click()
    await hero.getByTestId('hero-search').click()
    await expect(page).toHaveURL(/operacion=alquiler/)
    await expect(page).toHaveURL(/type=Warehouse/)
    expect(await apiTotal({ type: 'Warehouse', operacion: 'alquiler' })).toBe(0)
    await expect(page.getByTestId('catalog-total')).toContainText('0')
    // En el panel sigue el catálogo entero y la nave marcada.
    const aside = page.getByTestId('catalog-aside')
    const typeHead = aside.locator('[data-group="type"] > button')
    if ((await typeHead.getAttribute('aria-expanded')) !== 'true') await typeHead.click()
    await expect(aside.getByTestId('public-filter-type-Warehouse')).toBeChecked()
    for (const ty of ALL_TYPES) await expect(aside.getByTestId(`public-filter-type-${ty}`), ty).toBeVisible()
    await expect(aside.locator('.tt-exp')).toHaveCount(0)
  })

  test('móvil: el selector se abre como hoja inferior con todo el catálogo, sin desbordes', async ({ page }) => {
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
    for (const ty of ALL_TYPES) await expect(pop.getByTestId(`public-filter-type-${ty}`), ty).toBeAttached()
    await pop.getByTestId('public-filter-type-Studio').check()
    await expect(page.locator('section.hero').getByTestId('hero-cell-type')).toContainText('Estudio')
    await noHorizontalScroll(page)
    await pop.getByTestId('hero-type-done').click()
    await expect(pop).toHaveCount(0)
  })
})
