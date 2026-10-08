import { test, expect, request as pwRequest } from '@playwright/test'
import { STATE_A } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * Capas base de los mapas (utils/maps/tiles.ts, docs/maps.md). Desde sep-2026
 * CARTO sin clave sirve una tesela «API KEY REQUIRED» en vez del mapa; sin
 * `CARTO_BASEMAPS_KEY` (como en este entorno) los mapas tienen que salir de
 * OpenStreetMap, con su atribución, y la CSP tiene que dejarlas cargar.
 *
 * Las teselas se interceptan y se sirve una imagen vacía: la prueba comprueba
 * qué se pide y que el mapa lo pinta, sin cargar los servidores de OSM.
 */

// PNG de 1×1 transparente.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

test.describe('Mapas — capas base sin clave de CARTO', () => {
  test('/mapa pinta teselas de OpenStreetMap con su atribución, nunca las de CARTO sin clave; el oscuro y el satélite también cargan', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    const requested: string[] = []
    const blockedByCsp: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) blockedByCsp.push(m.text())
    })
    await context.route(/^https:\/\/(tile\.openstreetmap\.org|([a-z]\.)?basemaps\.cartocdn\.com|server\.arcgisonline\.com)\//, (route) => {
      requested.push(route.request().url())
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    })

    const res = await page.goto('/mapa')
    const csp = res?.headers()['content-security-policy'] || ''
    expect(csp).toContain('https://tile.openstreetmap.org')
    expect(csp).toContain('https://basemaps.cartocdn.com')

    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expect(page.locator('.leaflet-tile-loaded').first()).toBeAttached()
    expect(requested.length).toBeGreaterThan(0)
    expect(requested.every((u) => u.startsWith('https://tile.openstreetmap.org/'))).toBe(true)
    expect(requested.some((u) => u.includes('cartocdn'))).toBe(false)
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap')
    await expect(page.locator('.leaflet-control-attribution')).not.toContainText('CARTO')

    // «Oscuro»: el mismo mapa de OSM, invertido por CSS.
    await page.getByRole('button', { name: 'Oscuro', exact: true }).click()
    await expect(page.locator('.leaflet-layer.pi-tiles-dark')).toHaveCount(1)
    expect(await page.locator('.leaflet-layer.pi-tiles-dark').evaluate((el) => getComputedStyle(el).filter)).toContain('invert(1)')

    // «Satélite»: Esri, como siempre.
    const before = requested.length
    await page.getByRole('button', { name: 'Satélite', exact: true }).click()
    await expect.poll(() => requested.slice(before).some((u) => u.startsWith('https://server.arcgisonline.com/'))).toBe(true)
    await expect(page.locator('.leaflet-layer.pi-tiles-dark')).toHaveCount(0)

    expect(requested.some((u) => u.includes('cartocdn'))).toBe(false)
    expect(blockedByCsp).toEqual([])
    await context.close()
  })
})

test.describe('Mapas — marcador de un punto', () => {
  test.use({ storageState: STATE_A })

  test('el editor de ubicación pinta el marcador propio (SVG), nunca la imagen rota «Marker» de Leaflet, y se puede colocar con un clic', async ({ page }) => {
    const a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const dev = await a.post('/api/admin/developers', { data: { name: `Marcador dev ${Date.now()}`, email: `marcador-${Date.now()}@mm.test`, status: 'active' } })
    expect(dev.ok()).toBeTruthy()
    const prop = await a.post('/api/admin/developer-properties', { data: { developerId: (await dev.json()).id, name: `Marcador ${Date.now()}`, status: 'new', price: 500000, lat: 36.5101, lng: -4.9605 } })
    expect(prop.ok(), await prop.text()).toBeTruthy()
    const { id } = await prop.json()
    await a.dispose()

    await page.context().route(/^https:\/\/(tile\.openstreetmap\.org|server\.arcgisonline\.com)\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
    await page.goto(`/admin/developer-properties/${id}`)
    await page.locator('aside').getByRole('button', { name: 'Ubicación' }).click()
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 })

    const pin = page.locator('.leaflet-marker-icon.pi-pin')
    await expect(pin).toHaveCount(1)
    await expect(pin.locator('svg')).toBeVisible()
    await expect(page.locator('img.leaflet-marker-icon')).toHaveCount(0)
    // Ocupa su sitio de verdad (30×42), no un hueco de imagen rota.
    const box = (await pin.boundingBox())!
    expect(Math.round(box.width)).toBe(30)
    expect(Math.round(box.height)).toBe(42)
    await expect(pin).toHaveClass(/leaflet-marker-draggable/)

    // Un clic en el mapa mueve el mismo marcador; no aparece otro.
    await page.locator('.leaflet-container').click({ position: { x: 40, y: 40 } })
    await expect(pin).toHaveCount(1)
  })
})
