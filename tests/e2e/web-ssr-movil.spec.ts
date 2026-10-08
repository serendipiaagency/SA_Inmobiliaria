import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Web pública: las páginas del Constructor llegan pintadas desde el servidor
 * (antes, con el renderizador asíncrono, el HTML iba vacío y el navegador las
 * rellenaba al hidratar) y las rejillas de tarjetas no desbordan en el móvil
 * aunque un título largo se trunque.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}${Math.floor(Math.random() * 1000)}`
// En local la raíz es la landing del SaaS: la portada de la agencia se ve como vista previa, con sesión.
const HOME = '/?vista_previa=1'

test.describe('Web pública: SSR de las páginas del Constructor y móvil sin desbordes', () => {
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
  })

  test('«Vender Propiedad» llega con su contenido en el HTML del servidor, sin desajuste al hidratar', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (m) => { if (/hydration/i.test(m.text())) warnings.push(m.text()) })
    await page.goto(HOME)
    const html = await (await page.request.get('/vender')).text()
    const main = html.match(/<main[\s\S]*?<\/main>/)?.[0] || ''
    expect(main, 'el SSR pinta las secciones').toContain('Cuéntanos qué quieres vender')
    await page.goto('/vender')
    await expect(page.getByRole('heading', { name: 'Cuéntanos qué quieres vender' })).toBeVisible()
    expect(warnings, 'sin avisos de hidratación').toEqual([])
  })

  test('móvil: un título larguísimo no ensancha la portada ni favoritos', async ({ page }) => {
    const dev = await a.post('/api/admin/developers', { data: { name: `Larga ${RUN}`, email: `larga-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
    const name = `Ático-dúplex-con-terraza-panorámica-y-piscina-privada-${RUN}`
    const created = await a.post('/api/admin/developer-properties', { data: { developerId, name, status: 'ready', price: 520000, bedrooms: 3, area: 120, community: `Larga ${RUN}`, publishedAt: '2026-10-01 10:00:00' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const id = (await created.json()).id
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(HOME)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'portada sin scroll horizontal').toBeLessThanOrEqual(0)

    await page.goto('/favoritos')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'favoritos').toBeLessThanOrEqual(0)
  })
})
