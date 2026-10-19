import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { ANON_STATE, STATE_A } from './global-setup'
import { buildPng } from '../../test/unit/helpers/mediaFixtures'

/**
 * «Exposición solar» (Cola 10): la sección de la ficha bajo el mapa. La
 * exposición la da un proveedor con licencia (Shadowmap: acceso sólo para
 * socios, sin endpoints públicos), así que aquí se comprueba lo importante:
 * el Constructor la enseña con datos de DEMOSTRACIÓN rotulados, y la web
 * pública, sin proveedor, no enseña ni una cifra ni el rótulo de demostración.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const CANVAS = 'iframe[title="Vista previa del Constructor Web"]'
const RUN = `${Date.now()}`.slice(-7)

test.describe('Exposición solar en la ficha', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  let developerId = 0
  let prop = { id: 0, slug: '', name: '' }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora Sol ${RUN}`, email: `sol-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
    const up = await a.post('/api/admin/upload', { multipart: { file: { name: 'portada.png', mimeType: 'image/png', buffer: Buffer.from(buildPng(320, 200)) }, folder: 'properties' } })
    const cover = (await up.json()).key as string
    const name = `Casa soleada ${RUN}`
    const res = await a.post('/api/admin/developer-properties', {
      data: { developerId, name, coverImage: cover, price: 320000, bedrooms: 3, bathrooms: 2, area: 110, status: 'ready', transactionType: 'sale', lat: 43.5453, lng: -5.6619, orientation: 'S', description: 'Una casa con mucha luz.' },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    const { row } = await (await a.get(`/api/admin/developer-properties/${id}`)).json()
    prop = { id, slug: row.slug, name }
    expect((await a.delete('/api/admin/site-pages/ficha-propiedad')).ok()).toBeTruthy()
  })
  test.afterAll(async () => {
    await a.delete('/api/admin/site-pages/ficha-propiedad').catch(() => null)
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
  })

  test('el ejemplo del Constructor lleva datos de demostración marcados; sin sesión, no se sirve', async () => {
    const sample = await (await a.get(`/api/admin/site-pages/ficha-sample?propertyId=${prop.id}`)).json()
    expect(sample.property.solar).toMatchObject({ demo: true, provider: 'Datos de demostración', viewerUrl: null })
    expect(sample.property.availability.solar).toBe(true)
    const anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: ANON_STATE })
    expect((await anon.get(`/api/admin/site-pages/ficha-sample?propertyId=${prop.id}`)).status()).toBeGreaterThanOrEqual(401)
    await anon.dispose()
  })

  test('la web pública, sin proveedor con licencia, trae una estimación por orientación y latitud', async () => {
    const detail = await (await a.get(`/api/public/properties/${prop.slug}`)).json()
    // La propiedad tiene orientación Sur y coordenadas: estimación real (astronomía), no datos de un proveedor ni de demostración.
    expect(detail.solar).toMatchObject({ estimated: true, provider: 'Estimación por orientación', viewerUrl: null, confidence: 'low' })
    expect(detail.solar.score).toBeGreaterThan(0)
    expect(detail.solar.score).toBeLessThanOrEqual(100)
    expect(detail.solar.monthlyHours).toHaveLength(12)
    expect(detail.availability.solar).toBe(true)
    expect(JSON.stringify(detail)).not.toContain('Datos de demostración')
  })

  test('la ficha publicada enseña la estimación, rotulada como tal (sin «proveedor» ni «demostración»)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ANON_STATE })
    const page = await ctx.newPage()
    await page.goto(`/propiedades/${prop.slug}`)
    await expect(page.locator('h1')).toHaveText(prop.name, { timeout: 20_000 })
    const section = page.locator('#exposicion')
    await expect(section).toBeVisible()
    await expect(section.getByTestId('solar-exposure').first()).toBeVisible()
    await expect(section.getByTestId('solar-estimate-note').first()).toContainText('No tiene en cuenta las sombras')
    await expect(section.getByTestId('solar-attribution').first()).toHaveText('Estimación de INMO según orientación y latitud')
    const html = await page.content()
    expect(html).not.toContain('Datos de demostración')
    // La sección de orientación de siempre sigue ahí.
    await expect(page.locator('#orientacion')).toBeVisible()
    await ctx.close()
  })

  test('una propiedad sin orientación no trae estimación (la sección no sale)', async ({ browser }) => {
    const name = `Solar sin orientacion ${RUN}`
    const created = await a.post('/api/admin/developer-properties', {
      data: { developerId, name, price: 300000, bedrooms: 2, area: 90, status: 'ready', transactionType: 'sale', lat: 43.5453, lng: -5.6619, description: 'Sin orientación.' },
    })
    const id = (await created.json()).id
    const slug = (await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row.slug
    try {
      const detail = await (await a.get(`/api/public/properties/${slug}`)).json()
      expect(detail.solar).toBeNull()
      expect(detail.availability.solar).toBe(false)
      const ctx = await browser.newContext({ storageState: ANON_STATE })
      const page = await ctx.newPage()
      await page.goto(`/propiedades/${slug}`)
      await expect(page.locator('h1')).toHaveText(name, { timeout: 20_000 })
      await expect(page.locator('#exposicion')).toHaveCount(0)
      await ctx.close()
    } finally {
      await a.delete(`/api/admin/developer-properties/${id}?hard=1`)
    }
  })

  test('el lienzo la enseña bajo la ubicación, con el círculo dorado, el gráfico y la atribución, y el rótulo de demostración', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/site-builder?pagina=ficha-propiedad')
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.getByTestId('ficha-summary')).toBeVisible({ timeout: 20_000 })
    const section = canvas.locator('#exposicion')
    await expect(section).toBeVisible({ timeout: 20_000 })
    await expect(section.getByTestId('solar-demo-note')).toContainText('Datos de demostración')
    await expect(section.getByTestId('solar-score')).toBeVisible()
    await expect(section.getByTestId('solar-label')).toHaveText(/Exposición solar (excelente|alta|media|baja|muy baja)/)
    await expect(section.getByTestId('solar-chart')).toContainText('Junio')
    await expect(section.getByTestId('solar-chart')).toContainText('Diciembre')
    await expect(section.getByTestId('solar-attribution')).toHaveText('Proporcionado por Datos de demostración')
    await expect(section.getByText('Ver simulación solar 3D')).toBeVisible()
    // Sin enlace real mientras sean datos de demostración.
    await expect(section.getByTestId('solar-viewer-link')).toHaveCount(0)
    // Va debajo de la ubicación y antes de «Sol y orientación».
    const ys = await canvas.locator('#ubicacion, #exposicion, #orientacion').evaluateAll((els) => els.map((e) => ({ id: e.id, y: e.getBoundingClientRect().top })))
    const byId = Object.fromEntries(ys.map((e) => [e.id, e.y]))
    expect(byId.exposicion).toBeGreaterThan(byId.ubicacion!)
    expect(byId.orientacion).toBeGreaterThan(byId.exposicion!)
  })

  test('el inspector explica el estado del proveedor y no ofrece editar la puntuación', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto('/admin/site-builder?pagina=ficha-propiedad')
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.locator('#exposicion')).toBeVisible({ timeout: 20_000 })
    // Se elige en «Estructura» (el nodo de la sección), como en el resto de inspectores de la ficha.
    await page.locator('[data-ficha-node="s.exposicion"]').click()
    await expect(page.getByTestId('node-inspector')).toBeVisible()
    const status = page.getByTestId('page-core-solar-status')
    await expect(status).toBeVisible({ timeout: 15_000 })
    await expect(status).toContainText('Shadowmap')
    await expect(status).toContainText('Configuración pendiente')
    const panel = page.getByTestId('page-core-solar')
    await expect(panel.locator('input, textarea, select')).toHaveCount(0)
  })

  test('el título se reescribe y la sección se oculta desde la plantilla, y se guarda', async () => {
    const draft = await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
    const core = (draft.blocks as any[]).find((b) => b.type === 'page-core')
    const sections = (core.content.sections as any[] | undefined) ?? (await import('../../utils/siteBuilder/pages')).FICHA_SECTIONS.map((s) => ({ key: s.key, visible: true }))
    const put = await a.put('/api/admin/site-pages/ficha-propiedad', {
      data: { ...draft, blocks: draft.blocks.map((b: any) => (b.id === core.id ? { ...b, content: { ...b.content, 't.exposicion.title': 'Luz solar', sections: sections.map((s: any) => (s.key === 'exposicion' ? { ...s, visible: false } : s)) } } : b)) },
    })
    expect(put.ok(), await put.text()).toBeTruthy()
    const saved = (await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()).blocks.find((b: any) => b.type === 'page-core').content
    expect(saved['t.exposicion.title']).toBe('Luz solar')
    expect((saved.sections as any[]).find((s) => s.key === 'exposicion').visible).toBe(false)
  })

  test('oculta, la sección no sale en el lienzo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/site-builder?pagina=ficha-propiedad')
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.getByTestId('ficha-summary')).toBeVisible({ timeout: 20_000 })
    await expect(canvas.locator('#exposicion')).toHaveCount(0)
  })

  test('responsive: con el lienzo en Móvil la tarjeta cabe en la pantalla', async ({ page }) => {
    await a.delete('/api/admin/site-pages/ficha-propiedad')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/site-builder?pagina=ficha-propiedad')
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.locator('#exposicion')).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /^Móvil$/ }).click()
    const frame = page.locator(CANVAS)
    await expect.poll(async () => (await frame.boundingBox())?.width ?? 9999, { timeout: 10_000 }).toBeLessThan(500)
    const section = canvas.locator('#exposicion')
    await expect(section).toBeVisible()
    const frameWidth = (await frame.boundingBox())!.width
    const box = await section.boundingBox()
    expect(box!.width).toBeLessThanOrEqual(frameWidth)
    expect(await canvas.locator('body').evaluate((b) => b.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
})
