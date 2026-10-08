import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Cabecera de las webs (#108): el menú principal es «Comprar Propiedad»,
 * «Vender Propiedad», «Mapa», «Sobre nosotros» y «Blog» (utils/siteNav.ts),
 * igual en todas las páginas, en el móvil y en el lienzo del Constructor; y
 * cada enlace lleva a una página que funciona.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const NEW_MENU = ['Comprar Propiedad', 'Vender Propiedad', 'Mapa', 'Sobre nosotros', 'Blog']
const OLD_MENU = ['Off-Plan', 'Comunidades', 'Promotores', 'Equipo', 'Journal']
// En local la raíz del dominio de la plataforma es la landing del SaaS: la
// portada de la agencia se ve como vista previa, con sesión (site-builder.spec.ts).
const HOME = '/?vista_previa=1'
const ip = (n: number) => ({ 'cf-connecting-ip': `203.0.113.${((Date.now() + n * 11) % 230) + 10}` })

test.describe('Cabecera: el nuevo menú', () => {
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  let visitor: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    visitor = await pwRequest.newContext({ baseURL: BASE_URL })
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), visitor?.dispose()])
  })

  test('escritorio: los cinco nuevos en orden, ninguno de los antiguos, y lo mismo en todas las páginas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    for (const path of [HOME, '/propiedades', '/vender', '/mapa', '/nosotros', '/contacto', '/blog']) {
      await page.goto(path)
      const nav = page.getByTestId('site-nav')
      await expect(nav, path).toBeVisible()
      expect((await nav.locator('a').allTextContents()).map((s) => s.trim()), path).toEqual(NEW_MENU)
      const header = page.locator('header').first()
      for (const old of OLD_MENU) await expect(header.getByText(old, { exact: true }), `${path}: ${old}`).toHaveCount(0)
      // Contacto sigue siendo el botón de la derecha, no un enlace más del menú.
      await expect(header.locator('a[href="/contacto"]').first()).toBeVisible()
    }
    // El menú no se solapa con el logo ni con las acciones de la derecha.
    await page.goto(HOME)
    const boxes = await page.evaluate(() => {
      const navEl = document.querySelector('[data-testid="site-nav"]')!
      const nav = navEl.getBoundingClientRect()
      const header = navEl.parentElement!
      const logo = header.firstElementChild!.getBoundingClientRect()
      const actions = header.lastElementChild!.getBoundingClientRect()
      return { navL: nav.left, navR: nav.right, logoR: logo.right, actL: actions.left, scroll: document.documentElement.scrollWidth - window.innerWidth }
    })
    expect(boxes.navL).toBeGreaterThanOrEqual(boxes.logoR)
    expect(boxes.navR).toBeLessThanOrEqual(boxes.actL)
    expect(boxes.scroll).toBeLessThanOrEqual(0)
  })

  test('cada enlace lleva a su página', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const go = async (label: string) => {
      await page.goto(HOME)
      await page.getByTestId('site-nav').getByRole('link', { name: label, exact: true }).click()
    }
    await go('Comprar Propiedad')
    await expect(page).toHaveURL(/\/propiedades\?operacion=venta$/)
    await go('Vender Propiedad')
    await expect(page).toHaveURL(/\/vender$/)
    await expect(page.getByRole('heading', { name: 'Cuéntanos qué quieres vender' })).toBeVisible()
    await go('Mapa')
    await expect(page).toHaveURL(/\/mapa$/)
    await go('Sobre nosotros')
    await expect(page).toHaveURL(/\/nosotros$/)
    await go('Blog')
    await expect(page).toHaveURL(/\/blog$/)
    await page.goto(HOME)
    await page.locator('header a[href="/contacto"]').first().click()
    await expect(page).toHaveURL(/\/contacto$/)
  })

  test('móvil: el menú desplegable trae los cinco y Contacto', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(HOME)
    await expect(page.getByTestId('site-nav')).toBeHidden()
    await page.getByTestId('site-nav-toggle').click()
    const mobile = page.getByTestId('site-nav-mobile')
    await expect(mobile).toBeVisible()
    expect((await mobile.locator('a[data-nav]').allTextContents()).map((s) => s.trim())).toEqual(NEW_MENU)
    await expect(mobile.locator('a[href="/contacto"]')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await mobile.getByRole('link', { name: 'Vender Propiedad', exact: true }).click()
    await expect(page).toHaveURL(/\/vender$/)
  })

  test('«Comprar Propiedad» enseña lo que está en venta, no lo de alquiler', async () => {
    const dev = await a.post('/api/admin/developers', { data: { name: `Menú promotora ${RUN}`, email: `menu-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
    const ids: Record<string, number> = {}
    for (const [k, transactionType] of [['venta', 'sale'], ['alquiler', 'rent']] as const) {
      const res = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Menú ${k} ${RUN}`, status: 'new', price: 1000, transactionType } })
      expect(res.ok(), await res.text()).toBeTruthy()
      ids[k] = (await res.json()).id
      cleanup.push(() => a.delete(`/api/admin/developer-properties/${ids[k]}?hard=1`))
    }
    const rows = (await (await visitor.get('/api/public/properties', { params: { q: `Menú`, operacion: 'venta', perPage: '48' } })).json()).rows || []
    const found = (rows as any[]).map((r) => r.id)
    expect(found).toContain(ids.venta)
    expect(found).not.toContain(ids.alquiler)
  })

  test('«Vender Propiedad»: el formulario crea un lead de captación, aparte del de comprador, y el contacto queda como Vendedor', async ({ browser }) => {
    const email = `vender-${RUN}@example.com`
    // Primero escribe como comprador por el formulario de contacto…
    const asBuyer = await visitor.post('/api/public/contact', { headers: ip(1), data: { name: `Propietaria ${RUN}`, email, message: 'Busco ático', type: 'contact' } })
    expect(asBuyer.ok(), await asBuyer.text()).toBeTruthy()

    // …y luego quiere vender, desde la página del menú.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: ip(2) })
    const page = await ctx.newPage()
    await page.goto('/vender')
    const form = page.locator('form').filter({ hasText: 'Tu propiedad' })
    await form.locator('input').nth(0).fill(`Propietaria ${RUN}`)
    await form.locator('input[type="email"]').fill(email)
    await form.locator('input').nth(2).fill('+34 633 444 555')
    await form.locator('textarea').fill('Piso de 3 habitaciones en el centro, 95 m²')
    await form.getByRole('button', { name: 'Quiero vender' }).click()
    await expect(page.getByText('Te llamaremos lo antes posible')).toBeVisible({ timeout: 15_000 })
    await ctx.close()

    const leads = ((await (await a.get('/api/admin/leads', { params: { q: email } })).json()).rows || []) as any[]
    expect(leads, 'comprador y captación: dos leads').toHaveLength(2)
    const seller = leads.find((l) => l.sourceDetail === 'Vender propiedad')
    expect(seller, 'el lead de captación').toBeTruthy()
    expect(seller.originalMessage).toBe('Piso de 3 habitaciones en el centro, 95 m²')
    const contact = await (await a.get(`/api/admin/contacts/${seller.contactId}`)).json()
    expect(contact.row.roles).toContain('seller')
    expect(new Set(leads.map((l) => l.contactId)).size, 'la misma persona').toBe(1)

    const threads = await (await a.get('/api/admin/comms/conversations', { params: { source: 'web_form', status: 'all', q: email } })).json()
    expect(JSON.stringify(threads.rows)).toContain('seller')
  })

  test('el lienzo del Constructor enseña el mismo menú y un clic no navega', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STATE_A, viewport: { width: 1600, height: 1000 } })
    const page = await ctx.newPage()
    await page.goto('/admin/site-builder')
    const canvas = page.frameLocator('iframe').first()
    const nav = canvas.getByTestId('site-nav')
    await expect(nav).toBeVisible({ timeout: 20_000 })
    expect((await nav.locator('a').allTextContents()).map((s) => s.trim())).toEqual(NEW_MENU)
    await nav.getByRole('link', { name: 'Blog', exact: true }).click()
    await page.waitForTimeout(800)
    await expect(nav, 'sigue en el lienzo').toBeVisible()
    expect(page.url()).toContain('/admin/site-builder')
    await ctx.close()
  })
})
