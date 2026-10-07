import { test, expect } from '@playwright/test'

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
