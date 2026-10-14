import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Herramientas del mapa del buscador global (Parte II): dibujar una zona a
 * mano alzada que se convierte en un filtro real (`poly` en la URL, chip
 * «Zona dibujada», total del servidor), seleccionar áreas con propiedades
 * pulsándolas sobre el mapa (mismo `loc=` que «Ubicación») y el acceso desde
 * el campo «Ubicación» del Hero («Dibujar» abre el mapa ya dibujando;
 * «Seleccionar» lo abre con lo elegido).
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const HOME = '/?vista_previa=1'
const N = (k: string) => `Mapa ${k} ${RUN}`

test.describe('Buscador global · Mapa', () => {
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const dev = await a.post('/api/admin/developers', { data: { name: `Mapa promotora ${RUN}`, email: `mapa-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
    const rows: [string, Record<string, unknown>][] = [
      ['gijon1', { city: 'Gijón', community: 'Somió', postalCode: '33203', lat: 43.5293, lng: -5.6773 }],
      ['gijon2', { city: 'Gijón', postalCode: '33201', lat: 43.5401, lng: -5.6642 }],
      ['oviedo', { city: 'Oviedo', postalCode: '33003', lat: 43.3614, lng: -5.8493 }],
    ]
    for (const [k, extra] of rows) {
      const res = await a.post('/api/admin/developer-properties', { data: { developerId, name: N(k), status: 'ready', propertyType: 'Apartment', price: 200000, area: 90, bedrooms: 2, locationPrivacy: 'exact', ...extra } })
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

  /** Un trazo a mano alzada sobre la capa de dibujo, por los puntos dados (fracciones del ancho y alto de la capa). */
  async function stroke(page: Page, points: [number, number][]) {
    const layer = page.getByTestId('map-draw-layer')
    await expect(layer).toBeVisible()
    const box = (await layer.boundingBox())!
    const at = ([fx, fy]: [number, number]) => [box.x + box.width * fx, box.y + box.height * fy] as [number, number]
    const [x0, y0] = at(points[0]!)
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    for (const p of points.slice(1)) {
      const [x, y] = at(p)
      await page.mouse.move(x, y, { steps: 6 })
    }
    await page.mouse.up()
  }

  test('49–50 · dibujar una zona: un trazo sin superficie avisa; una zona real filtra (URL, chip y total del servidor) y se quita', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/propiedades?vista=mapa')
    await expect(page.getByTestId('catalog-map').locator('.leaflet-container')).toBeVisible()
    await page.getByTestId('map-draw-start').click()
    await expect(page.getByTestId('map-draw-hint')).toBeVisible()
    // Un trazo diminuto: aviso y se sigue dibujando.
    await stroke(page, [
      [0.5, 0.5],
      [0.502, 0.502],
      [0.5, 0.504],
    ])
    await expect(page.getByTestId('map-draw-notice')).toContainText(/pequeña/)
    await expect(page.getByTestId('map-draw-hint')).toBeVisible()
    // Una zona de verdad, alrededor del centro del mapa.
    await stroke(page, [
      [0.3, 0.3],
      [0.7, 0.28],
      [0.72, 0.7],
      [0.32, 0.72],
      [0.3, 0.3],
    ])
    await expect(page).toHaveURL(/poly=/)
    const poly = decodeURIComponent(new URL(page.url()).searchParams.get('poly') || '')
    expect(poly.split(';').length).toBeGreaterThanOrEqual(3)
    await expect(page.locator('[data-chip="polygon"]')).toHaveText(/Zona dibujada/)
    await expect(page.getByTestId('catalog-total')).toContainText(String(await apiTotal({ poly, operacion: 'venta' })))
    await expect(page.getByTestId('map-draw-redo')).toBeVisible()
    // Quitar la zona dibujada.
    await page.getByTestId('map-draw-clear').click()
    await expect(page).not.toHaveURL(/poly=/)
    await expect(page.locator('[data-chip="polygon"]')).toHaveCount(0)
    await expect(page.getByTestId('map-draw-start')).toBeVisible()
    // Un `poly` mal formado en la URL no devuelve «todas»: el servidor lo rechaza.
    expect((await anon.get('/api/public/properties?countOnly=1&poly=43,-5;43,-4')).status()).toBe(422)
  })

  test('51–52 · seleccionar áreas: los municipios con propiedades se pintan con su número; pulsar uno lo elige en Ubicación y pulsarlo de nuevo lo quita', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/propiedades?vista=mapa')
    await expect(page.getByTestId('catalog-map').locator('.leaflet-container')).toBeVisible()
    const gijon = page.locator('.map-area[data-location-id="es:mun:33024"]')
    await expect(gijon).toHaveCount(1)
    await expect(gijon.locator('.map-area-n')).toHaveText(String(await apiTotal({ loc: 'es:mun:33024' })))
    await expect(page.locator('.map-area[data-location-id="es:mun:33044"]')).toHaveCount(1)
    // El marcador puede quedar fuera de la parte visible del mapa: el clic se envía al elemento.
    await gijon.dispatchEvent('click')
    await expect(page).toHaveURL(/loc=es(%3A|:)mun(%3A|:)33024/)
    await expect(page.locator('[data-chip="loc:es:mun:33024"]')).toHaveText(/Gijón/)
    await expect(page.locator('.map-area[data-location-id="es:mun:33024"]')).toHaveClass(/map-area-on/)
    await expect(page.getByTestId('catalog-total')).toContainText(String(await apiTotal({ loc: 'es:mun:33024', operacion: 'venta' })))
    await page.locator('.map-area[data-location-id="es:mun:33024"]').dispatchEvent('click')
    await expect(page).not.toHaveURL(/loc=/)
    await expect(page.locator('[data-chip="loc:es:mun:33024"]')).toHaveCount(0)
  })

  test('47–48 · «Dibujar una zona en el mapa» desde Ubicación abre el mapa ya dibujando; «Seleccionar en el mapa» lo abre con lo elegido', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(HOME)
    await page.locator('section.hero').getByTestId('hero-cell-location').click()
    const pop = page.getByTestId('hero-pop-location')
    await pop.getByTestId('location-input').focus()
    const sugg = pop.getByTestId('location-suggestions')
    await expect(sugg.getByTestId('location-map-draw')).toBeVisible()
    await sugg.getByTestId('location-map-draw').click()
    await expect(page).toHaveURL(/\/propiedades\?.*vista=mapa/)
    await expect(page.getByTestId('map-draw-hint')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('map-draw-cancel').click()
    await expect(page.getByTestId('map-draw-start')).toBeVisible()

    await page.goto(HOME)
    await page.locator('section.hero').getByTestId('hero-cell-location').click()
    const pop2 = page.getByTestId('hero-pop-location')
    await pop2.getByTestId('location-input').pressSequentially('gij', { delay: 15 })
    await pop2.getByTestId('location-suggestions').locator('[data-location-id="es:mun:33024"]').click()
    await pop2.getByTestId('location-input').click()
    await pop2.getByTestId('location-suggestions').getByTestId('location-map-select').click()
    await expect(page).toHaveURL(/vista=mapa/)
    await expect(page).toHaveURL(/loc=es(%3A|:)mun(%3A|:)33024/)
    await expect(page.locator('.map-area[data-location-id="es:mun:33024"]')).toHaveClass(/map-area-on/)
    await expect(page.getByTestId('map-draw-hint')).toHaveCount(0)
  })
})
