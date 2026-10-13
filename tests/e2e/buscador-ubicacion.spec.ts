import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * «Ubicación» del buscador global (megaprompt «Evolución global del buscador»,
 * Parte II): autocompletado sobre entidades geográficas reales (catálogo de
 * España + inventario y zonas de la agencia), con prefijos, texto parcial,
 * tildes, errores razonables, varios niveles, selección múltiple con chips,
 * redundancias, recientes, acceso al mapa, teclado, estados vacío y de error,
 * y la URL con ids canónicos que llega al catálogo con sus resultados reales.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const HOME = '/?vista_previa=1'
const N = (k: string) => `Ubic ${k} ${RUN}`

test.describe('Buscador global · Ubicación', () => {
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const dev = await a.post('/api/admin/developers', { data: { name: `Ubic promotora ${RUN}`, email: `ubic-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
    const rows: [string, Record<string, unknown>][] = [
      ['somio', { propertyType: 'Apartment', price: 210000, area: 95, bedrooms: 3, city: 'Gijón', community: 'Somió', postalCode: '33203' }],
      ['centro', { propertyType: 'Penthouse', price: 380000, area: 130, bedrooms: 3, city: 'GIJÓN', postalCode: '33201' }],
      ['oviedo', { propertyType: 'Apartment', price: 150000, area: 80, bedrooms: 2, city: 'Oviedo', postalCode: '33003' }],
    ]
    for (const [k, extra] of rows) {
      const res = await a.post('/api/admin/developer-properties', { data: { developerId, name: N(k), status: 'ready', ...extra } })
      expect(res.ok(), await res.text()).toBeTruthy()
      const id = (await res.json()).id
      cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    }
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), anon?.dispose()])
  })

  const apiTotal = async (params: Record<string, string>) => {
    const qs = new URLSearchParams({ countOnly: '1', ...params })
    return ((await (await anon.get(`/api/public/properties?${qs}`)).json()) as { total: number }).total
  }

  test('14–16 · sin escribir: sugerencias con inventario real y acceso al mapa; por prefijo, la entidad con su contador', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    await page.locator('section.hero').getByTestId('hero-cell-location').click()
    const pop = page.getByTestId('hero-pop-location')
    const input = pop.getByTestId('location-input')
    await input.focus()
    const sugg = pop.getByTestId('location-suggestions')
    await expect(sugg).toBeVisible()
    // Lo que más inventario tiene (Gijón, Oviedo…), con su entidad real y su contador; y las herramientas del mapa que existen.
    const gijon = sugg.locator('[data-location-id="es:mun:33024"]')
    await expect(gijon).toBeVisible()
    await expect(gijon.locator('.loc-opt-count')).toHaveText(String(await apiTotal({ loc: 'es:mun:33024' })))
    await expect(sugg.getByTestId('location-map-select')).toBeVisible()
    await expect(sugg.getByTestId('location-map-nearby')).toBeVisible()
    // Por prefijo.
    await input.pressSequentially('gij', { delay: 20 })
    const first = sugg.locator('[role="option"]').first()
    await expect(first).toHaveAttribute('data-location-id', 'es:mun:33024')
    await expect(first).toContainText('Gijón/Xixón')
    await expect(first).toContainText('Asturias')
  })

  test('17–26 · texto parcial, tildes, variante cooficial, errores razonables, comunidad, provincia, municipio, barrio y código postal; sitios sin inventario también', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    await page.locator('section.hero').getByTestId('hero-cell-location').click()
    const pop = page.getByTestId('hero-pop-location')
    const input = pop.getByTestId('location-input')
    const sugg = pop.getByTestId('location-suggestions')
    const firstId = async (q: string) => {
      await input.fill('')
      await input.pressSequentially(q, { delay: 15 })
      const first = sugg.locator('[role="option"]').first()
      await expect(first).toBeVisible()
      return (await first.getAttribute('data-location-id')) || ''
    }
    expect(await firstId('malaga')).toBe('es:mun:29067') // sin tilde y sin inventario
    expect(await firstId('ovied')).toBe('es:mun:33044')
    expect(await firstId('oviedp')).toBe('es:mun:33044') // una letra mal
    expect(await firstId('xixon')).toBe('es:mun:33024') // cooficial
    expect(await firstId('somio')).toBe('es:loc:3108732') // barrio, dentro de Gijón
    await expect(sugg.locator('[data-location-id="es:loc:3108732"]')).toContainText('Gijón/Xixón')
    expect(await firstId('33203')).toBe('es:cp:33203')
    await input.fill('')
    await input.pressSequentially('asturias', { delay: 15 })
    await expect(sugg.locator('[data-location-id="es:prov:33"]')).toBeVisible()
    await expect(sugg.locator('[data-location-id="es:ccaa:34"]')).toBeVisible()
    await expect(sugg.locator('[data-location-id="es:prov:33"]').locator('.loc-opt-count')).toHaveText(String(await apiTotal({ loc: 'es:prov:33' })))
    // Un sitio sin propiedades se puede elegir igual (sin contador).
    await input.fill('')
    await input.pressSequentially('barcelona', { delay: 15 })
    const bcn = sugg.locator('[data-location-id="es:mun:08019"]')
    await expect(bcn).toBeVisible()
    await expect(bcn.locator('.loc-opt-count')).toHaveCount(0)
  })

  test('27–29, 31, 45–46, 51 · selección múltiple con chips, redundancia señalada, eliminación; la URL con ids llega al catálogo con el total real', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    const hero = page.locator('section.hero')
    await hero.getByTestId('hero-cell-location').click()
    const pop = page.getByTestId('hero-pop-location')
    const input = pop.getByTestId('location-input')
    const sugg = pop.getByTestId('location-suggestions')
    await input.pressSequentially('gij', { delay: 15 })
    await sugg.locator('[data-location-id="es:mun:33024"]').click()
    await expect(pop.locator('[data-location-id="es:mun:33024"].loc-chip, .loc-chip[data-location-id="es:mun:33024"]')).toHaveCount(1)
    await expect(hero.getByTestId('hero-cell-location')).toContainText('Gijón/Xixón')
    await input.pressSequentially('somio', { delay: 15 })
    await sugg.locator('[data-location-id="es:loc:3108732"]').click()
    await expect(hero.getByTestId('hero-cell-location')).toContainText('+1')
    // Somió está dentro de Gijón: el chip lo dice y no estorba (unión).
    const somioChip = pop.locator('.loc-chip[data-location-id="es:loc:3108732"]')
    await expect(somioChip).toHaveClass(/loc-chip-covered/)
    await expect(somioChip).toContainText('dentro de')
    // Quitar Gijón: Somió deja de estar cubierta.
    await pop.locator('.loc-chip[data-location-id="es:mun:33024"] .loc-chip-x').click()
    await expect(somioChip).not.toHaveClass(/loc-chip-covered/)
    // Otra más (sin inventario) y a buscar.
    await input.pressSequentially('madrid', { delay: 15 })
    await sugg.locator('[data-location-id="es:mun:28079"]').click()
    await hero.getByTestId('hero-search').click()
    await expect(page).toHaveURL(/loc=es%3Aloc%3A3108732(%2C|,)es%3Amun%3A28079|loc=es:loc:3108732,es:mun:28079/)
    const total = await apiTotal({ loc: 'es:loc:3108732,es:mun:28079', operacion: 'venta' })
    expect(total).toBeGreaterThan(0)
    await expect(page.getByTestId('catalog-total')).toContainText(String(total))
    await expect(page.getByText(N('somio')).first()).toBeVisible()
    // Chips con nombre (resuelto por id) y quitar uno.
    await expect(page.locator('[data-chip="loc:es:loc:3108732"]')).toHaveText('Somió')
    await expect(page.locator('[data-chip="loc:es:mun:28079"]')).toHaveText('Madrid')
    await page.locator('[data-chip="loc:es:mun:28079"]').click()
    await expect(page).toHaveURL(/loc=es(%3A|:)loc(%3A|:)3108732$|loc=es(%3A|:)loc(%3A|:)3108732&/)
    await expect(page.locator('[data-chip="loc:es:mun:28079"]')).toHaveCount(0)
    // El panel enseña la misma selección, con su contexto.
    const aside = page.getByTestId('catalog-aside')
    await expect(aside.locator('.loc-chip[data-location-id="es:loc:3108732"]')).toContainText('Somió')
    // Recarga y atrás/adelante conservan la búsqueda.
    await page.reload()
    await expect(page.locator('[data-chip="loc:es:loc:3108732"]')).toHaveText('Somió')
    await page.goBack()
    await expect(page.locator('[data-chip="loc:es:mun:28079"]')).toHaveText('Madrid')
    await page.goForward()
    await expect(page.locator('[data-chip="loc:es:mun:28079"]')).toHaveCount(0)
  })

  test('30, 32–36 · sitio sin propiedades da cero; teclado; debounce y cancelación; estado vacío y error de servicio con mensajes útiles', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/propiedades?vista_previa=1')
    const aside = page.getByTestId('catalog-aside')
    const head = aside.locator('[data-group="location"] > button')
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
    const input = aside.getByTestId('location-input')
    const sugg = aside.getByTestId('location-suggestions')
    // Teclado: ↓ y Enter eligen la primera; escribir rápido no deja respuestas viejas.
    await input.focus()
    await input.pressSequentially('ov', { delay: 5 })
    await input.pressSequentially('ied', { delay: 5 })
    await expect(sugg.locator('[role="option"]').first()).toHaveAttribute('data-location-id', 'es:mun:33044')
    // La primera ya viene resaltada; ↓ y ↑ recorren la lista y Enter elige la resaltada.
    await input.press('ArrowDown')
    await expect(sugg.locator('.loc-opt-active')).not.toHaveAttribute('data-location-id', 'es:mun:33044')
    await input.press('ArrowUp')
    await expect(sugg.locator('.loc-opt-active')).toHaveAttribute('data-location-id', 'es:mun:33044')
    await input.press('Enter')
    await expect(page).toHaveURL(/loc=es(%3A|:)mun(%3A|:)33044/)
    await expect(page.getByTestId('catalog-total')).toContainText(String(await apiTotal({ loc: 'es:mun:33044', operacion: 'venta' })))
    // Un sitio sin propiedades: se elige y da cero (no desaparece).
    await input.fill('')
    await input.pressSequentially('barcelona', { delay: 10 })
    await sugg.locator('[data-location-id="es:mun:08019"]').click()
    await page.locator('[data-chip="loc:es:mun:33044"]').click()
    await expect(page.getByTestId('catalog-total')).toContainText('0')
    // Estado vacío con mensaje útil.
    await input.fill('')
    await input.pressSequentially('zzzzqqqxx', { delay: 10 })
    await expect(aside.getByTestId('location-empty')).toContainText('No encontramos esa ubicación')
    // Escape cierra; error de servicio: mensaje, no un fallo técnico.
    await input.press('Escape')
    await expect(sugg).toHaveCount(0)
    await page.route('**/api/public/location-suggest**', (route) => route.abort())
    await input.fill('')
    await input.pressSequentially('ovi', { delay: 10 })
    await expect(aside.getByTestId('location-error')).toBeVisible()
    await page.unroute('**/api/public/location-suggest**')
  })

  test('recientes del visitante (sólo su navegador) y acceso al mapa desde el panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    await page.locator('section.hero').getByTestId('hero-cell-location').click()
    const pop = page.getByTestId('hero-pop-location')
    await pop.getByTestId('location-input').pressSequentially('ovied', { delay: 15 })
    await pop.getByTestId('location-suggestions').locator('[data-location-id="es:mun:33044"]').click()
    await pop.locator('.loc-chip[data-location-id="es:mun:33044"] .loc-chip-x').click()
    await pop.getByTestId('location-input').focus()
    await expect(pop.getByTestId('location-suggestions').getByTestId('location-recent-municipality').first()).toContainText('Oviedo')
    // «Seleccionar en el mapa» lleva a Propiedades en vista Mapa, con lo elegido.
    await pop.getByTestId('location-suggestions').getByTestId('location-map-select').click()
    await expect(page).toHaveURL(/\/propiedades\?.*vista=mapa/)
    const aside = page.getByTestId('catalog-aside')
    const head = aside.locator('[data-group="location"] > button')
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
    await aside.getByTestId('location-input').focus()
    await expect(aside.getByTestId('location-suggestions').getByTestId('location-map-nearby')).toBeVisible()
  })
})
