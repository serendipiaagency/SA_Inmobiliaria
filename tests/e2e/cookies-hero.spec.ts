import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Megaprompt «buscador, cookies y vista previa» (bloques A–D):
 *  - el aviso de cookies es real: nada opcional antes de decidir, Rechazar /
 *    Configurar / Aceptar y continuar, «Configurar cookies» en el pie, y
 *    Google Analytics sólo se carga a quien lo acepta (y se va al retirarlo);
 *  - la vista previa no lleva franja;
 *  - el Hero no tiene «Ver propiedades» / «Hablar con un asesor» y sólo
 *    ofrece Comprar y Alquilar; lo demás está en «Más filtros».
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const EMPTY = { cookies: [], origins: [] }
const HOME = '/?vista_previa=1'

async function storedConsent(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('inmo_cookie_consent') || 'null'))
}
async function cookieNames(page: Page) {
  return (await page.context().cookies()).map((c) => c.name)
}

test.describe('Aviso de cookies', () => {
  test('sin decidir no se guarda nada opcional; Rechazar, reabrir desde el pie y conceder sólo Analíticas', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: EMPTY })
    const page = await ctx.newPage()
    await page.goto('/propiedades?utm_source=e2e-cookies')

    const notice = page.getByTestId('cookie-consent')
    await expect(notice).toBeVisible()
    await expect(notice.getByRole('heading', { name: 'Tu privacidad es importante' })).toBeVisible()
    // Las tres acciones, en este orden, y Rechazar tan a mano como Aceptar.
    await expect(notice.locator('[data-testid="cookie-configure"], [data-testid="cookie-reject"], [data-testid="cookie-accept"]')).toHaveText(['Configurar', 'Rechazar', 'Aceptar y continuar'])
    const reject = await notice.getByTestId('cookie-reject').boundingBox()
    const accept = await notice.getByTestId('cookie-accept').boundingBox()
    expect(Math.abs((reject?.height ?? 0) - (accept?.height ?? 0))).toBeLessThan(2)
    // Mientras tanto: ni la cookie de origen de campaña ni la de visitante.
    expect(await cookieNames(page)).not.toContain('sa_ft')
    expect(await cookieNames(page)).not.toContain('sa_visitor')

    await notice.getByTestId('cookie-reject').click()
    await expect(notice).toBeHidden()
    expect((await storedConsent(page)).c).toEqual({ analytics: false, thirdParty: false, marketing: false })
    expect(await cookieNames(page)).not.toContain('sa_ft')

    // Quien ya decidió no vuelve a ver el aviso.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Tu privacidad es importante' })).toHaveCount(0)

    // «Configurar cookies» del pie: categorías reales, sin Publicidad (no hay píxel).
    await page.getByTestId('footer-cookie-settings').click()
    const settings = page.getByTestId('cookie-settings')
    await expect(settings).toBeVisible()
    await expect(settings.getByText('Necesarias', { exact: true })).toBeVisible()
    await expect(page.getByTestId('cookie-toggle-analytics')).not.toBeChecked()
    await expect(page.getByTestId('cookie-toggle-thirdParty')).not.toBeChecked()
    await expect(page.getByTestId('cookie-toggle-marketing')).toHaveCount(0)
    await page.getByTestId('cookie-toggle-analytics').check({ force: true })
    await page.getByTestId('cookie-save').click()
    await expect(settings).toBeHidden()
    expect((await storedConsent(page)).c).toEqual({ analytics: true, thirdParty: false, marketing: false })
    // Con permiso, el origen de la visita de esta página ya se guarda.
    await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'sa_ft')?.value || '').toContain('e2e-cookies')

    // Retirarlo lo borra.
    await page.getByTestId('footer-cookie-settings').click()
    await page.getByTestId('cookie-toggle-analytics').uncheck({ force: true })
    await page.getByTestId('cookie-save').click()
    await expect.poll(async () => cookieNames(page)).not.toContain('sa_ft')
    await ctx.close()
  })

  test('la política de cookies es la de esta agencia y se puede leer sin decidir', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: EMPTY })
    const page = await ctx.newPage()
    await page.goto('/propiedades')
    await page.getByTestId('cookie-consent').getByTestId('cookie-policy-link').click()
    await expect(page).toHaveURL(/\/cookies$/)
    await expect(page.getByTestId('cookie-policy')).toContainText('sa_visitor')
    await expect(page.getByTestId('cookie-policy')).toContainText('inmo_cookie_consent')
    await expect(page.getByTestId('cookie-policy')).not.toContainText('Google Analytics 4')
    await ctx.close()
  })

  test.describe('con Google Analytics configurado', () => {
    let admin: APIRequestContext
    let before: { ga4: string | null; metaPixel: string | null }
    test.beforeAll(async () => {
      admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
      before = (await (await admin.get('/api/admin/site-settings')).json()).cookies
    })
    test.afterAll(async () => {
      await admin.put('/api/admin/site-settings', { data: { ga4: before.ga4 || '', metaPixel: before.metaPixel || '' } })
      await admin.dispose()
    })

    test('un ID mal formado se rechaza; con uno válido, Google sólo se carga al aceptar y se va al retirarlo', async ({ browser }) => {
      const bad = await admin.put('/api/admin/site-settings', { data: { ga4: 'UA-1234-1', metaPixel: '' } })
      expect(bad.status()).toBe(422)
      const ok = await admin.put('/api/admin/site-settings', { data: { ga4: 'g-e2etest01', metaPixel: '' } })
      expect(ok.ok(), await ok.text()).toBeTruthy()
      expect((await ok.json()).cookies.ga4).toBe('G-E2ETEST01')

      const ctx = await browser.newContext({ storageState: EMPTY })
      const hits: string[] = []
      // Nunca se llega a Google de verdad: la petición se cuenta y se contesta vacía.
      await ctx.route('https://www.googletagmanager.com/**', (r) => {
        hits.push(r.request().url())
        return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
      })
      const page = await ctx.newPage()
      const res = await page.goto('/propiedades')
      expect(res?.headers()['content-security-policy']).toContain('https://www.googletagmanager.com')
      const notice = page.getByTestId('cookie-consent')
      await expect(notice).toBeVisible()
      await expect(notice).toContainText('Google Analytics')
      await page.waitForTimeout(800)
      expect(hits).toEqual([])
      expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(0)

      await notice.getByTestId('cookie-accept').click()
      await expect.poll(() => hits.length).toBeGreaterThan(0)
      expect(hits[0]).toContain('id=G-E2ETEST01')

      // Retirar Analíticas: la página se recarga sin el script.
      await page.getByTestId('footer-cookie-settings').click()
      await page.getByTestId('cookie-toggle-analytics').uncheck({ force: true })
      await Promise.all([page.waitForEvent('load'), page.getByTestId('cookie-save').click()])
      await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0)
      expect((await storedConsent(page)).c.analytics).toBe(false)
      await ctx.close()
    })
  })

  test('un vídeo de YouTube de la ficha espera al consentimiento («Permitir y ver»)', async ({ browser }) => {
    const RUN = `${Date.now()}${Math.floor(Math.random() * 1000)}`
    const a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora cookies ${RUN}`, email: `cookies-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    const created = await a.post('/api/admin/developer-properties', {
      data: { developerId, name: `Vídeo cookies ${RUN}`, price: 210000, bedrooms: 2, bathrooms: 1, area: 70, status: 'new', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    const id = (await created.json()).id as number
    try {
      const { row } = await (await a.get(`/api/admin/developer-properties/${id}`)).json()
      const ctx = await browser.newContext({ storageState: EMPTY })
      // Nunca se llega a YouTube de verdad.
      await ctx.route(/youtube(-nocookie)?\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }))
      const page = await ctx.newPage()
      await page.goto(`/propiedades/${row.slug}`)
      await page.getByTestId('cookie-reject').click()
      await page.getByTestId('gallery-tabs').getByRole('button', { name: /Vídeo/ }).click()
      const gate = page.getByTestId('gallery-videos').getByTestId('consent-gate')
      await expect(gate).toContainText('YouTube')
      await expect(page.locator('iframe[src*="youtube"]')).toHaveCount(0)
      await gate.getByTestId('consent-gate-allow').click()
      await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toHaveCount(1)
      expect((await storedConsent(page)).c.thirdParty).toBe(true)
      await ctx.close()
    } finally {
      await a.delete(`/api/admin/developer-properties/${id}?hard=1`)
      await a.delete(`/api/admin/developers/${developerId}`)
      await a.dispose()
    }
  })
})

test.describe('Vista previa y Hero', () => {
  test.use({ storageState: STATE_A })

  test('la vista previa abre la web tal cual: la cabecera real arriba, sin franja ni texto de vista previa', async ({ page }) => {
    await page.goto(HOME)
    await expect(page.locator('section.hero')).toBeVisible()
    await expect(page.getByTestId('site-preview-bar')).toHaveCount(0)
    await expect(page.getByText(/Vista previa de la web de|Salir de la vista previa/)).toHaveCount(0)
    expect((await page.locator('header').first().boundingBox())?.y).toBe(0)
  })

  test('el Hero sin sus dos botones y sólo Comprar | Alquilar, con la búsqueda real', async ({ page }) => {
    await page.goto(HOME)
    const hero = page.locator('section.hero')
    await expect(hero).toBeVisible()
    for (const name of ['Ver propiedades', 'Explorar catálogo', 'Hablar con un asesor']) await expect(hero.getByRole('link', { name })).toHaveCount(0)

    const tabs = hero.locator('button.tab')
    await expect(tabs).toHaveText(['Comprar', 'Alquilar'])
    await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'true')
    for (const gone of ['Obra nueva', 'Inversión', 'Locales', 'Garajes', 'Solares', 'Terrenos', 'Naves']) await expect(tabs.filter({ hasText: gone })).toHaveCount(0)

    // Con Comprar, la inversión está en «Más filtros»; con Alquilar no aplica.
    await page.getByTestId('hero-more').click()
    await expect(page.getByTestId('hero-min-yield')).toBeVisible()
    await page.getByTestId('hero-more').click()

    // Alquilar cambia la escala del precio a rentas mensuales.
    await tabs.nth(1).click()
    await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('hero-cell-price').click()
    const pop = page.getByTestId('hero-pop-price')
    await expect(pop.getByText('Renta mensual')).toBeVisible()
    // El primer escalón del mínimo es una renta, no un precio de venta.
    await pop.getByTestId('price-min-handle').evaluate((el) => {
      const input = el as HTMLInputElement
      input.value = '100'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // Obra nueva sigue existiendo, en «Más filtros»; la rentabilidad, no (es de compra).
    await page.getByTestId('hero-more').click()
    await expect(page.getByTestId('hero-estado-obra_nueva')).toBeVisible()
    await expect(page.getByTestId('hero-min-yield')).toHaveCount(0)
    await page.getByTestId('hero-estado-obra_nueva').click()

    await page.getByTestId('hero-search').click()
    await expect(page).toHaveURL(/\/propiedades\?/)
    const url = new URL(page.url())
    expect(url.searchParams.get('operacion')).toBe('alquiler')
    expect(url.searchParams.getAll('estado')).toEqual(['obra_nueva'])
    expect(Number(url.searchParams.get('minPrice'))).toBeGreaterThan(0)
    expect(Number(url.searchParams.get('minPrice'))).toBeLessThan(10000)
    expect(url.searchParams.get('mode')).toBeNull()
    await expect(page.locator('[data-chip="estado:obra_nueva"]')).toHaveText('Obra nueva')
  })
})
