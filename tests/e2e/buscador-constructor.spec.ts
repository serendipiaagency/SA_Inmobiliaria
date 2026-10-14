import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Configuración del buscador global en el Constructor Web (Parte III): lo
 * que ajusta el inspector de «Tipo de inmueble» y «Ubicación» (texto vacío,
 * contadores, sugerencias, destacadas, herramientas del mapa) se guarda en
 * el bloque y se ve en la web; el Hero y el panel de Propiedades leen las
 * mismas claves. Sólo presentación: la búsqueda no cambia.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const CANVAS = 'iframe[title="Vista previa del Constructor Web"]'

test.describe('Buscador global · Constructor', () => {
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  let originalHome: Record<string, unknown> | null = null
  let originalCatalog: Record<string, unknown> | null = null
  let homePublished = false
  let catalogPublished = false

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const home = await (await a.get('/api/admin/site-pages/home')).json()
    originalHome = { blocks: home.blocks, seo: home.seo, ...(home.styles ? { styles: home.styles } : {}) }
    const cat = await (await a.get('/api/admin/site-pages/propiedades')).json()
    originalCatalog = { blocks: cat.blocks, seo: cat.seo, ...(cat.styles ? { styles: cat.styles } : {}) }
    const status = (key: string) => (cat.pages as any[] | undefined)?.find((p) => p.pageKey === key)
    homePublished = !!status('home')?.published
    catalogPublished = !!status('propiedades')?.published
  })

  // La web sirve la versión publicada, no el borrador: lo que estas pruebas
  // publican hay que volver a publicarlo tal como estaba (o despublicarlo),
  // o las pruebas siguientes del buscador verían textos, herramientas del
  // mapa y contadores de esta configuración.
  test.afterAll(async () => {
    if (originalHome) {
      await a.put('/api/admin/site-pages/home', { data: originalHome }).catch(() => null)
      if (homePublished) await a.post('/api/admin/site-pages/home/publish').catch(() => null)
    }
    if (originalCatalog) {
      if (!catalogPublished) await a.delete('/api/admin/site-pages/propiedades').catch(() => null)
      await a.put('/api/admin/site-pages/propiedades', { data: originalCatalog }).catch(() => null)
      if (catalogPublished) await a.post('/api/admin/site-pages/propiedades/publish').catch(() => null)
    }
    await a?.dispose()
  })

  test('59–61 · Hero: el inspector guarda lo de Tipo y Ubicación y la portada lo enseña (texto vacío, sin dibujar, destacada primero, sin contadores)', async ({ page }) => {
    const put = await a.put('/api/admin/site-pages/home', { data: { blocks: [{ id: 'hero-cfg', type: 'hero', version: 1, content: {} }], seo: {} } })
    expect(put.ok(), await put.text()).toBeTruthy()
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/site-builder')
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.locator('section.hero')).toBeVisible({ timeout: 15_000 })
    await page.locator('aside.border-r').getByText(/^01 · Hero$/).click()
    const insp = page.getByTestId('search-fields-inspector')
    await expect(insp).toBeVisible()
    await insp.getByTestId('search-type-placeholder').locator('input').fill('Qué buscas')
    await insp.getByTestId('search-location-placeholder').locator('input').fill('Dónde quieres vivir')
    await insp.getByTestId('search-location-suggestions').locator('select').selectOption('8')
    await insp.getByTestId('search-location-counts').getByRole('switch').click()
    await insp.getByTestId('search-location-map-draw').getByRole('switch').click()
    // Una destacada, elegida con el mismo autocompletado (sin recientes aquí).
    const featured = insp.getByTestId('search-location-featured')
    await featured.getByTestId('location-input').pressSequentially('madrid', { delay: 15 })
    await featured.getByTestId('location-suggestions').locator('[data-location-id="es:mun:28079"]').click()
    await expect(featured.locator('.loc-chip[data-location-id="es:mun:28079"]')).toHaveCount(1)
    await expect(featured.getByTestId('location-recent-municipality')).toHaveCount(0)

    // El lienzo lo enseña al momento.
    await expect(canvas.getByTestId('hero-cell-type')).toContainText('Qué buscas')
    await expect(canvas.getByTestId('hero-cell-location')).toContainText('Dónde quieres vivir')
    // …y el borrador lo guarda con las claves compartidas.
    await expect
      .poll(async () => {
        const draft = await (await a.get('/api/admin/site-pages/home')).json()
        const c = (draft.blocks as any[]).find((b) => b.type === 'hero')?.content || {}
        return [c.typePlaceholder, c.locationPlaceholder, c.locationSuggestions, c.locationShowCounts, c.locationMapDraw, (c.locationFeatured || []).map((f: any) => f.id).join(',')].join('|')
      }, { timeout: 10_000 })
      .toBe('Qué buscas|Dónde quieres vivir|8|false|false|es:mun:28079')

    // Publicada, la portada lo enseña: textos, sin «Dibujar», Madrid la primera sin escribir, sin contadores.
    const pub = await a.post('/api/admin/site-pages/home/publish')
    expect(pub.ok(), await pub.text()).toBeTruthy()
    await page.goto('/?vista_previa=1')
    const hero = page.locator('section.hero')
    await expect(hero.getByTestId('hero-cell-location')).toContainText('Dónde quieres vivir')
    await expect(hero.getByTestId('hero-cell-type')).toContainText('Qué buscas')
    await hero.getByTestId('hero-cell-location').click()
    const pop = page.getByTestId('hero-pop-location')
    await expect(pop.getByTestId('location-input')).toHaveAttribute('placeholder', 'Dónde quieres vivir')
    await pop.getByTestId('location-input').focus()
    const sugg = pop.getByTestId('location-suggestions')
    await expect(sugg.locator('[role="option"]').first()).toHaveAttribute('data-location-id', 'es:mun:28079')
    await expect(sugg.getByTestId('location-map-select')).toBeVisible()
    await expect(sugg.getByTestId('location-map-draw')).toHaveCount(0)
    await expect(sugg.getByTestId('location-map-nearby')).toBeVisible()
    await expect(sugg.locator('.loc-opt-count')).toHaveCount(0)
    // Lo destacado no limita: cualquier otro sitio sigue encontrándose.
    await pop.getByTestId('location-input').pressSequentially('gij', { delay: 15 })
    await expect(sugg.locator('[data-location-id="es:mun:33024"]')).toBeVisible()
  })

  test('62 · Propiedades: el panel lee las mismas claves de su propio bloque (sin Seleccionar ni Buscar alrededor; sólo Dibujar)', async ({ page }) => {
    const cat = await (await a.get('/api/admin/site-pages/propiedades')).json()
    const blocks = (cat.blocks as any[]).map((b) => (b.type === 'page-core' ? { ...b, content: { ...(b.content || {}), locationPlaceholder: 'Zona del panel', locationMapSelect: false, locationMapNearby: false, typeShowCounts: false } } : b))
    expect(blocks.some((b) => b.type === 'page-core')).toBe(true)
    const put = await a.put('/api/admin/site-pages/propiedades', { data: { blocks, seo: cat.seo || {} } })
    expect(put.ok(), await put.text()).toBeTruthy()
    const pub = await a.post('/api/admin/site-pages/propiedades/publish')
    expect(pub.ok(), await pub.text()).toBeTruthy()

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/propiedades?vista_previa=1')
    const aside = page.getByTestId('catalog-aside')
    const head = aside.locator('[data-group="location"] > button')
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
    const input = aside.getByTestId('location-input')
    await expect(input).toHaveAttribute('placeholder', 'Zona del panel')
    await input.focus()
    const sugg = aside.getByTestId('location-suggestions')
    await expect(sugg.getByTestId('location-map-draw')).toBeVisible()
    await expect(sugg.getByTestId('location-map-select')).toHaveCount(0)
    await expect(sugg.getByTestId('location-map-nearby')).toHaveCount(0)
    // Tipo sin contadores en el panel.
    await aside.locator('[data-group="type"] > button').click()
    await expect(aside.locator('[data-group="type"] .tp-count')).toHaveCount(0)
  })
})
