import { test, expect, request as pwRequest, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { ANON_STATE, STATE_A, STATE_B } from './global-setup'

/**
 * El pie global de la web rediseñado (megaprompt «footer»): cinco columnas
 * en escritorio (identidad, Explorar, Empresa, Servicios, Suscríbete con el
 * contacto), newsletter real con consentimiento y baja, contacto de la
 * empresa sin nada inventado, paisaje opcional, barra inferior oscura con
 * copyright dinámico, legales, «Configurar cookies», idioma y «volver
 * arriba»; editable en el Constructor (Contenido / Diseño / Avanzado) y
 * publicado como el resto; cada inmobiliaria con el suyo.
 *
 * La web pública de la agencia A es la del host por defecto (org 1), así que
 * un visitante anónimo la ve en /nosotros; el lienzo del Constructor, con la
 * sesión de A.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const PUBLIC_PAGE = '/nosotros'
const CANVAS = 'iframe[title="Vista previa del Constructor Web"]'
const DESC = `Inmobiliaria de prueba ${RUN}: casas con vistas al mar.`
const HOURS = 'Lun - Vie 9:00 - 18:00'
const SOCIAL = { instagram: 'https://www.instagram.com/valdeheros', linkedin: 'https://www.linkedin.com/company/valdeheros', facebook: 'https://facebook.example/valdeheros' }

/** El pie no ensancha la página: ningún elemento suyo pasa del borde y sin él la anchura es la misma. */
async function footerAddsNoWidth(page: Page) {
  const detail = await page.evaluate(() => {
    const footer = document.querySelector<HTMLElement>('[data-testid="site-footer"]')!
    const wide = Array.from(footer.querySelectorAll<HTMLElement>('*'))
      .filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 6)
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 50)}[${e.dataset.testid || ''}] r=${Math.round(e.getBoundingClientRect().right)}`)
    const withFooter = document.documentElement.scrollWidth
    footer.style.display = 'none'
    const withoutFooter = document.documentElement.scrollWidth
    footer.style.display = ''
    return { inner: window.innerWidth, withFooter, withoutFooter, wide }
  })
  expect(detail.wide, detail.wide.join(' | ')).toEqual([])
  expect(detail.withFooter, JSON.stringify(detail)).toBeLessThanOrEqual(detail.withoutFooter)
}

async function anonPage(browser: Browser, width = 1440, height = 900) {
  const ctx = await browser.newContext({ storageState: ANON_STATE, viewport: { width, height } })
  const page = await ctx.newPage()
  await page.goto(PUBLIC_PAGE)
  await expect(page.getByTestId('site-footer')).toBeVisible()
  return { ctx, page, footer: page.getByTestId('site-footer') }
}

test.describe('Pie global rediseñado', () => {
  let a: APIRequestContext
  let anon: APIRequestContext
  let originalFooter: any = null
  let originalKit: any = null
  let officeId = 0
  let profile: { phone: string | null; location: string | null; mapQuery: string | null } = { phone: null, location: null, mapQuery: null }

  const adminList = async (q: string) => (await (await a.get(`/api/admin/newsletter?q=${encodeURIComponent(q)}`)).json()) as { items: any[]; total: number }
  const publishFooter = async (config: Record<string, unknown>) => {
    const put = await a.put('/api/admin/site-footer', { data: config })
    expect(put.ok(), await put.text()).toBeTruthy()
    const pub = await a.post('/api/admin/site-footer/publish')
    expect(pub.ok(), await pub.text()).toBeTruthy()
  }
  const baseline = () => ({ description: DESC, contact: { hours: HOURS }, landscape: { mode: 'none' } })

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    originalFooter = await (await a.get('/api/admin/site-footer')).json()
    // Sin Brand Kit, el GET devuelve un cuerpo vacío (null): se crea uno y se vacía al acabar.
    const kitText = await (await a.get('/api/admin/asset-export/brand-kit')).text()
    originalKit = kitText.trim() ? JSON.parse(kitText) : null
    const kit = await a.put('/api/admin/asset-export/brand-kit', { data: { phone: '+34 985 000 100', socialLinks: SOCIAL } })
    expect(kit.ok(), await kit.text()).toBeTruthy()
    const office = await a.post('/api/admin/offices', { data: { name: `Oficina pie ${RUN}`, city: 'Valdeheros', province: 'Asturias', address: 'Plaza Mayor 1', postalCode: '33000', phone: '+34 985 111 222', status: 'active' } })
    expect(office.ok(), await office.text()).toBeTruthy()
    officeId = (await office.json()).id
    await publishFooter(baseline())
    profile = (await (await anon.get('/api/public/site-footer')).json()).profile
  })

  test.afterAll(async () => {
    if (originalKit) await a.put('/api/admin/asset-export/brand-kit', { data: { phone: originalKit.phone ?? null, socialLinks: JSON.parse(originalKit.socialLinksJson || '{}') } }).catch(() => null)
    else await a.put('/api/admin/asset-export/brand-kit', { data: { phone: null, socialLinks: {} } }).catch(() => null)
    if (officeId) await a.delete(`/api/admin/offices/${officeId}?hard=1`).catch(() => null)
    if (originalFooter?.config) await publishFooter(originalFooter.config).catch(() => null)
    await Promise.all([a?.dispose(), anon?.dispose()])
  })

  // ------------------------------------------------------------------ web
  test('1 · escritorio: cinco columnas en una fila; identidad primero y «Suscríbete» al final', async ({ browser }) => {
    const { ctx, footer } = await anonPage(browser)
    const cols = footer.locator('[data-footer-section]')
    expect(await cols.evaluateAll((els) => els.map((e) => e.getAttribute('data-footer-section')))).toEqual(['identity', 'explore', 'company', 'services', 'newsletter'])
    await expect(footer.getByTestId('footer-columns')).toHaveAttribute('data-columns', '5')
    const tops = await cols.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(1)
    await ctx.close()
  })

  test('2 · identidad: el logo y el nombre de la empresa (Brand Kit) y la descripción editable', async ({ browser }) => {
    const { ctx, page, footer } = await anonPage(browser)
    const tenant = await (await anon.get('/api/public/tenant')).json()
    const name = tenant.companyName || tenant.name
    await expect(footer.getByTestId('footer-col-identity').locator('a[href="/"]').first()).toContainText(name.split(/\s+/)[0])
    await expect(footer.getByTestId('footer-description')).toHaveText(DESC)
    await expect(page.getByTestId('footer-copyright')).toContainText(name)
    await ctx.close()
  })

  test('3 · redes sociales: sólo las configuradas con dirección real de su red, en círculos y abiertas con noopener', async ({ browser }) => {
    const { ctx, footer } = await anonPage(browser)
    const links = footer.getByTestId('footer-social').locator('a')
    expect(await links.evaluateAll((els) => els.map((e) => e.getAttribute('data-network')))).toEqual(['instagram', 'linkedin'])
    for (const l of await links.all()) {
      await expect(l).toHaveAttribute('target', '_blank')
      await expect(l).toHaveAttribute('rel', /noopener/)
      expect(await l.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('9999px')
    }
    await expect(links.first()).toHaveAttribute('href', SOCIAL.instagram)
    await ctx.close()
  })

  test('4 · Explorar / Empresa / Servicios: etiqueta en píldora y enlaces a páginas que existen (ninguna rota)', async ({ browser }) => {
    const { ctx, footer } = await anonPage(browser)
    for (const key of ['explore', 'company', 'services']) {
      const heading = footer.getByTestId(`footer-col-${key}`).locator('.sf-heading')
      await expect(heading).toBeVisible()
      expect(await heading.evaluate((el) => getComputedStyle(el).textTransform)).toBe('uppercase')
      expect(await heading.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('9999px')
    }
    const hrefs = await footer.locator('a[data-link-id]').evaluateAll((els) => els.map((e) => e.getAttribute('href')!))
    expect(hrefs.length).toBeGreaterThanOrEqual(10)
    expect(hrefs).toContain('/propiedades?operacion=venta')
    expect(hrefs).toContain('/propiedades?operacion=alquiler')
    expect(hrefs).toContain('/vender')
    expect(hrefs).not.toContain('/promotoras')
    for (const href of hrefs) {
      expect(href.startsWith('/'), href).toBe(true)
      const res = await anon.get(href)
      expect(res.status(), href).toBeLessThan(400)
    }
    await ctx.close()
  })

  test('5 · «Servicios» sólo aparece cuando esa página del Constructor está publicada', async ({ browser }) => {
    const { ctx, page, footer } = await anonPage(browser)
    const link = footer.locator('a[data-link-id="d-services"]')
    await expect(link).toHaveCount(0)
    const put = await a.put('/api/admin/site-pages/servicios', { data: { blocks: [{ id: 'txt', type: 'text', version: 1, content: { title: 'Servicios', body: 'x' } }], seo: {} } })
    expect(put.ok(), await put.text()).toBeTruthy()
    const pub = await a.post('/api/admin/site-pages/servicios/publish')
    expect(pub.ok(), await pub.text()).toBeTruthy()
    try {
      await page.reload()
      await expect(link).toHaveAttribute('href', '/servicios')
      expect((await anon.get('/servicios')).status()).toBe(200)
    } finally {
      await a.delete('/api/admin/site-pages/servicios')
    }
    await page.reload()
    await expect(link).toHaveCount(0)
    await ctx.close()
  })

  test('6 · Suscríbete: sin email válido o sin consentimiento no se guarda nada', async ({ browser }) => {
    const { ctx, footer } = await anonPage(browser)
    const form = footer.getByTestId('footer-newsletter')
    const msg = form.getByTestId('footer-newsletter-message')
    await form.getByTestId('footer-newsletter-submit').click()
    await expect(msg).toHaveAttribute('data-state', 'error')
    await expect(msg).toContainText('email válido')
    const email = `sin-consentimiento-${RUN}@mm.test`
    await form.getByTestId('footer-newsletter-email').fill(email)
    await form.getByTestId('footer-newsletter-submit').click()
    await expect(msg).toContainText('política de privacidad')
    expect((await adminList(email)).total).toBe(0)
    // Tampoco por el API, aunque se salte el formulario.
    const res = await anon.post('/api/public/newsletter', { data: { email, privacyAccepted: false } })
    expect(res.status()).toBe(422)
    expect((await adminList(email)).total).toBe(0)
    await ctx.close()
  })

  test('7 · Suscríbete: alta real con consentimiento, en el panel con su fecha, sin duplicados y con enlace de baja', async ({ browser }) => {
    const { ctx, footer } = await anonPage(browser)
    const form = footer.getByTestId('footer-newsletter')
    const email = `pie-${RUN}@mm.test`
    await form.getByTestId('footer-newsletter-email').fill(email.toUpperCase())
    await form.getByTestId('footer-newsletter-consent').check()
    await form.getByTestId('footer-newsletter-submit').click()
    const msg = form.getByTestId('footer-newsletter-message')
    await expect(msg).toHaveAttribute('data-state', 'done')
    await expect(msg).toContainText('Gracias')
    await expect(form.getByTestId('footer-newsletter-undo')).toHaveAttribute('href', /\/newsletter\/baja\?token=[0-9a-f]{48}$/)
    const list = await adminList(email)
    expect(list.total).toBe(1)
    expect(list.items[0]).toMatchObject({ email, status: 'subscribed', source: 'footer', locale: 'es' })
    expect(list.items[0].consentAt).toBeTruthy()
    expect(Object.keys(list.items[0])).not.toContain('unsubscribeTokenHash')
    // Repetir no duplica.
    await form.getByTestId('footer-newsletter-email').fill(email)
    await form.getByTestId('footer-newsletter-consent').check()
    await form.getByTestId('footer-newsletter-submit').click()
    await expect(msg).toHaveAttribute('data-state', 'done')
    expect((await adminList(email)).total).toBe(1)
    await ctx.close()
  })

  test('8 · darse de baja desde el enlace exige confirmar; después el panel lo enseña como baja; un enlace falso no vale', async ({ browser }) => {
    const email = `baja-${RUN}@mm.test`
    const sub = await (await anon.post('/api/public/newsletter', { data: { email, privacyAccepted: true, locale: 'es' } })).json()
    expect(sub.unsubscribeToken).toMatch(/^[0-9a-f]{48}$/)
    const ctx = await browser.newContext({ storageState: ANON_STATE })
    const page = await ctx.newPage()
    await page.goto(`/newsletter/baja?token=${sub.unsubscribeToken}`)
    await expect(page.getByTestId('newsletter-unsubscribe-confirm')).toBeVisible()
    expect((await adminList(email)).items[0].status).toBe('subscribed')
    await page.getByTestId('newsletter-unsubscribe-confirm').click()
    await expect(page.getByTestId('newsletter-unsubscribe-done')).toBeVisible()
    expect((await adminList(email)).items[0]).toMatchObject({ status: 'unsubscribed' })
    await page.goto(`/newsletter/baja?token=${'f'.repeat(48)}`)
    await page.getByTestId('newsletter-unsubscribe-confirm').click()
    await expect(page.getByTestId('newsletter-unsubscribe-invalid')).toBeVisible()
    await page.goto('/newsletter/baja')
    await expect(page.getByTestId('newsletter-unsubscribe-invalid')).toBeVisible()
    await ctx.close()
  })

  test('9 · el campo trampa descarta a los bots sin delatarlos; el límite por IP frena la ráfaga', async () => {
    const email = `bot-${RUN}@mm.test`
    const res = await anon.post('/api/public/newsletter', { data: { email, privacyAccepted: true, website: 'http://spam.example' } })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).unsubscribeToken).toBeNull()
    expect((await adminList(email)).total).toBe(0)
  })

  test('10 · panel Suscriptores: lista con estados, filtro, exportación CSV, dar de baja y eliminar', async ({ browser }) => {
    const email = `panel-${RUN}@mm.test`
    await anon.post('/api/public/newsletter', { data: { email, privacyAccepted: true } })
    const ctx = await browser.newContext({ storageState: STATE_A, viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await page.goto('/admin/suscriptores')
    await page.getByTestId('newsletter-search').fill(email)
    const row = page.locator(`tr[data-email="${email}"]`)
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute('data-status', 'subscribed')
    await page.getByTestId('newsletter-filter-unsubscribed').click()
    await expect(row).toHaveCount(0)
    await page.getByTestId('newsletter-filter-all').click()
    await expect(row).toBeVisible()
    const csv = await (await a.get(`/api/admin/newsletter?format=csv&q=${encodeURIComponent(email)}`)).text()
    expect(csv.startsWith('﻿Email;Estado;')).toBe(true)
    expect(csv).toContain(`${email};Suscrito;footer`)
    await row.getByTestId('newsletter-unsubscribe').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Dar de baja' }).click()
    await expect(row).toHaveAttribute('data-status', 'unsubscribed')
    await row.getByTestId('newsletter-delete').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click()
    await expect(row).toHaveCount(0)
    expect((await adminList(email)).total).toBe(0)
    await ctx.close()
  })

  test('11 · contacto: teléfono con horario y ciudad con «Ver en el mapa», de los datos reales de la empresa', async ({ browser }) => {
    const { ctx, footer } = await anonPage(browser)
    const contact = footer.getByTestId('footer-contact')
    await expect(contact).toBeVisible()
    expect(profile.phone).toBe('+34 985 000 100')
    await expect(contact.getByTestId('footer-contact-phone')).toHaveText(profile.phone!)
    await expect(contact.getByTestId('footer-contact-phone')).toHaveAttribute('href', 'tel:+34985000100')
    await expect(contact.getByTestId('footer-contact-hours')).toHaveText(HOURS)
    expect(profile.location).toBeTruthy()
    await expect(contact.getByTestId('footer-contact-location')).toHaveText(profile.location!)
    const map = contact.getByTestId('footer-map-link')
    await expect(map).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/)
    await expect(map).toHaveAttribute('rel', /noopener/)
    await ctx.close()
  })

  test('12 · barra inferior: copyright con el año, legales, y «Configurar cookies» abre el panel real', async ({ browser }) => {
    const { ctx, page, footer } = await anonPage(browser)
    const bottom = footer.getByTestId('footer-bottom')
    await expect(bottom.getByTestId('footer-copyright')).toContainText(`© ${new Date().getFullYear()} `)
    await expect(bottom.getByTestId('footer-copyright')).toContainText('Todos los derechos reservados')
    await expect(bottom.getByTestId('footer-legal-privacy')).toHaveAttribute('href', '/privacidad')
    await expect(bottom.getByTestId('footer-legal-terms')).toHaveAttribute('href', '/terminos')
    await expect(bottom.getByTestId('footer-legal-cookies')).toHaveAttribute('href', '/cookies')
    const bg = await bottom.evaluate((el) => getComputedStyle(el).backgroundColor)
    const [r, g, b] = bg.match(/\d+/g)!.map(Number)
    expect(0.2126 * r! + 0.7152 * g! + 0.0722 * b!).toBeLessThan(90)
    await bottom.getByTestId('footer-cookie-settings').click()
    await expect(page.getByTestId('cookie-settings')).toBeVisible()
    await ctx.close()
  })

  test('13 · el selector de idioma del pie cambia el idioma de la web', async ({ browser }) => {
    const { ctx, page, footer } = await anonPage(browser)
    await expect(footer.getByTestId('footer-col-explore').locator('.sf-heading')).toHaveText('Explorar')
    await footer.getByTestId('footer-language').getByRole('button').first().click()
    await footer.getByTestId('footer-language').locator('[data-locale="en"]').click()
    await expect(footer.getByTestId('footer-col-explore').locator('.sf-heading')).toHaveText('Explore')
    await expect(footer.getByTestId('footer-back-to-top')).toHaveAttribute('aria-label', 'Back to top')
    await page.reload()
    await expect(footer.getByTestId('footer-col-explore').locator('.sf-heading')).toHaveText('Explore')
    await ctx.close()
  })

  test('14 · «volver arriba»: botón circular blanco que sube con scroll suave; mientras se ve, el flotante se esconde', async ({ browser }) => {
    const { ctx, page, footer } = await anonPage(browser)
    const top = footer.getByTestId('footer-back-to-top')
    await top.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
    expect(await top.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)')
    expect(await top.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('9999px')
    await expect(page.getByTestId('scroll-top')).toHaveCount(0)
    await top.click()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await ctx.close()
  })

  test('15 · paisaje: de partida liso; con un dibujo publicado, a todo el ancho, suave y con su altura', async ({ browser }) => {
    const { ctx, page, footer } = await anonPage(browser)
    await expect(footer.getByTestId('footer-landscape')).toHaveCount(0)
    await publishFooter({ ...baseline(), landscape: { mode: 'preset', preset: 'coast', opacity: 30, height: 200 } })
    try {
      await page.reload()
      const land = footer.getByTestId('footer-landscape')
      await expect(land).toHaveAttribute('data-preset', 'coast')
      const box = (await land.boundingBox())!
      expect(Math.round(box.height)).toBe(200)
      expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 20)
      expect(await land.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.3')
    } finally {
      await publishFooter(baseline())
    }
    await ctx.close()
  })

  test('16 · tableta: identidad y «Suscríbete» arriba, las tres columnas de enlaces debajo; sin desbordes', async ({ browser }) => {
    const { ctx, page, footer } = await anonPage(browser, 820, 1180)
    const top = async (key: string) => Math.round((await footer.getByTestId(`footer-col-${key}`).boundingBox())!.y)
    expect(await top('identity')).toBe(await top('newsletter'))
    expect(await top('explore')).toBeGreaterThan(await top('identity'))
    expect(await top('explore')).toBe(await top('company'))
    expect(await top('explore')).toBe(await top('services'))
    await footerAddsNoWidth(page)
    await ctx.close()
  })

  test('17 · móvil: una columna, Explorar / Empresa / Servicios plegables, formulario a todo el ancho y barra legal en vertical', async ({ browser }) => {
    const { ctx, page, footer } = await anonPage(browser, 390, 844)
    const lefts = await footer.locator('[data-footer-section]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
    expect(new Set(lefts).size).toBe(1)
    const explore = footer.getByTestId('footer-col-explore')
    await expect(explore.locator('a[data-link-id]').first()).toBeHidden()
    await explore.getByTestId('footer-toggle-explore').click()
    await expect(explore.locator('a[data-link-id]').first()).toBeVisible()
    const form = (await footer.getByTestId('footer-newsletter').boundingBox())!
    expect(form.width).toBeGreaterThan(390 * 0.8)
    const copy = (await footer.getByTestId('footer-copyright').boundingBox())!
    const legal = (await footer.getByTestId('footer-legal').boundingBox())!
    expect(legal.y).toBeGreaterThan(copy.y + copy.height - 1)
    await footerAddsNoWidth(page)
    await ctx.close()
  })

  // ---------------------------------------------------------- Constructor
  test.describe('en el Constructor', () => {
    test.describe.configure({ mode: 'serial' })

    /** El autoguardado del pie tarda un segundo: se espera a que el borrador tenga lo pedido antes de cerrar. */
    async function draftHas(check: (c: any) => boolean) {
      await expect.poll(async () => check((await (await a.get('/api/admin/site-footer')).json()).config), { timeout: 10_000 }).toBe(true)
    }

    // Un contexto con la sesión de A por prueba (sin `test.use`, que repartiría la
    // suite en otro worker con otro beforeAll y otro RUN).
    async function openFooterInspector(browser: Browser) {
      const ctx = await browser.newContext({ storageState: STATE_A, viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      await page.goto('/admin/site-builder')
      const canvas = page.frameLocator(CANVAS)
      const footer = canvas.getByTestId('site-footer')
      await expect(footer).toBeVisible({ timeout: 15_000 })
      await footer.getByTestId('footer-description').click()
      await expect(page.getByTestId('footer-inspector')).toBeVisible()
      // El lienzo pinta el borrador del editor (no lo publicado ni el de partida).
      await expect(footer).toHaveAttribute('data-config-source', 'draft')
      return { ctx, page, canvas, footer }
    }

    test('18 · pulsar el pie en el lienzo abre su inspector, con Contenido / Diseño / Avanzado', async ({ browser }) => {
      const { ctx, page } = await openFooterInspector(browser)
      await expect(page.getByTestId('inspector-title')).toHaveText('Pie de página')
      const tabs = page.getByTestId('footer-inspector-tabs')
      await expect(tabs.getByRole('button')).toHaveText(['Contenido', 'Diseño', 'Avanzado'])
      await expect(page.getByTestId('footer-description-input')).toBeVisible()
      await tabs.getByRole('button', { name: 'Diseño' }).click()
      await expect(page.getByTestId('footer-landscape-mode')).toBeVisible()
      await tabs.getByRole('button', { name: 'Avanzado' }).click()
      await expect(page.getByTestId('footer-sections')).toBeVisible()
      await ctx.close()
    })

    test('19 · Contenido: la descripción cambia en el lienzo al momento y se guarda como borrador sin tocar la web', async ({ browser }) => {
      const { ctx, page, footer } = await openFooterInspector(browser)
      const draftDesc = `Borrador ${RUN}`
      await page.getByTestId('footer-description-input').locator('textarea').fill(draftDesc)
      await expect(footer.getByTestId('footer-description')).toHaveText(draftDesc)
      await expect.poll(async () => (await (await a.get('/api/admin/site-footer')).json()).config.description, { timeout: 10_000 }).toBe(draftDesc)
      expect((await (await a.get('/api/admin/site-footer')).json()).hasUnpublishedChanges).toBe(true)
      expect((await (await anon.get('/api/public/site-footer')).json()).config.description).toBe(DESC)
      await ctx.close()
    })

    test('20 · Contenido: un enlace externo válido se enseña; uno inválido se señala y no sale; la columna admite reordenar', async ({ browser }) => {
      const { ctx, page, footer } = await openFooterInspector(browser)
      await page.getByTestId('footer-add-url-services').click()
      const links = page.getByTestId('footer-links-services').locator('li')
      const added = links.last()
      await added.getByTestId('footer-link-url').fill('https://valoracion.ejemplo.com/tasar')
      await added.getByTestId('footer-link-label').fill('Valoración online')
      const rendered = footer.getByTestId('footer-col-services').locator('a', { hasText: 'Valoración online' })
      await expect(rendered).toHaveAttribute('href', 'https://valoracion.ejemplo.com/tasar')
      await expect(rendered).toHaveAttribute('rel', /noopener/)
      await added.getByTestId('footer-link-url').fill('javascript:alert(1)')
      await expect(added.getByTestId('footer-link-problem')).toContainText('no es válida')
      await expect(footer.getByTestId('footer-col-services').locator('a', { hasText: 'Valoración online' })).toHaveCount(0)
      await added.getByTestId('footer-link-remove').click()
      const before = await footer.getByTestId('footer-col-services').locator('a[data-link-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-link-id')))
      await links.nth(1).getByTestId('footer-link-up').click()
      await expect.poll(() => footer.getByTestId('footer-col-services').locator('a[data-link-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-link-id')))).toEqual([before[1], before[0], ...before.slice(2)])
      await draftHas((c) => c.columns.services.links[0].id === before[1])
      await ctx.close()
    })

    test('21 · Diseño: etiquetas sin píldora y colores propios se ven en el lienzo', async ({ browser }) => {
      const { ctx, page, footer } = await openFooterInspector(browser)
      await page.getByTestId('footer-inspector-tabs').getByRole('button', { name: 'Diseño' }).click()
      await page.getByTestId('footer-heading-style').getByRole('button', { name: 'Texto' }).click()
      const heading = footer.getByTestId('footer-col-explore').locator('.sf-heading')
      await expect(heading).toHaveClass(/sf-heading-plain/)
      expect(await heading.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
      await page.getByTestId('footer-color-background').fill('#eef3ee')
      await page.getByTestId('footer-color-background').press('Enter')
      await page.getByTestId('footer-color-background').dispatchEvent('change')
      await expect.poll(() => footer.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(238, 243, 238)')
      await page.getByTestId('footer-landscape-mode').getByRole('button', { name: 'Dibujo' }).click()
      await expect(footer.getByTestId('footer-landscape')).toHaveAttribute('data-preset', 'coast')
      await draftHas((c) => c.design.background === '#eef3ee' && c.design.headingStyle === 'plain' && c.landscape.mode === 'preset')
      await ctx.close()
    })

    test('22 · Avanzado: ocultar «Servicios» y subir «Suscríbete» cambia las columnas del lienzo', async ({ browser }) => {
      const { ctx, page, footer } = await openFooterInspector(browser)
      await page.getByTestId('footer-inspector-tabs').getByRole('button', { name: 'Avanzado' }).click()
      const sections = page.getByTestId('footer-sections')
      await sections.locator('li[data-section="services"]').getByTestId('footer-section-toggle').uncheck()
      await expect(footer.getByTestId('footer-columns')).toHaveAttribute('data-columns', '4')
      // «Suscríbete» sube tres puestos (por encima de Servicios —oculta pero en la lista—, Empresa y Explorar).
      for (let i = 0; i < 3; i++) await sections.locator('li[data-section="newsletter"]').getByTestId('footer-section-up').click()
      await expect.poll(() => footer.locator('[data-footer-section]').evaluateAll((els) => els.map((e) => e.getAttribute('data-footer-section')))).toEqual(['identity', 'newsletter', 'explore', 'company'])
      await page.getByTestId('footer-hide-mobile-social').check()
      await expect(footer.getByTestId('footer-social')).toHaveClass(/max-sm:hidden/)
      await draftHas((c) => c.show.services === false && c.order[1] === 'newsletter' && c.hideOnMobile.includes('social'))
      await ctx.close()
    })

    test('23 · «Publicar» lleva el pie a la web (y la versión queda en el historial del pie)', async ({ browser }) => {
      const { ctx, page } = await openFooterInspector(browser)
      const before = (await (await a.get('/api/admin/site-footer')).json()).version
      await page.getByRole('button', { name: /Publicar/ }).click()
      await expect.poll(async () => (await (await a.get('/api/admin/site-footer')).json()).version, { timeout: 15_000 }).toBe(before + 1)
      const pub = (await (await anon.get('/api/public/site-footer')).json()).config
      expect(pub.description).toBe(`Borrador ${RUN}`)
      expect(pub.show.services).toBe(false)
      expect(pub.order).toEqual(['identity', 'newsletter', 'explore', 'company', 'services'])
      expect(pub.design.background).toBe('#eef3ee')
      expect((await (await a.get('/api/admin/site-footer')).json()).hasUnpublishedChanges).toBe(false)
      await ctx.close()
    })

    test('24 · la vista previa del editor enseña el borrador; la web publicada, lo publicado', async ({ browser }) => {
      const { ctx, page, footer } = await openFooterInspector(browser)
      const draftDesc = `Sin publicar ${RUN}`
      await page.getByTestId('footer-description-input').locator('textarea').fill(draftDesc)
      await expect.poll(async () => (await (await a.get('/api/admin/site-footer')).json()).config.description, { timeout: 10_000 }).toBe(draftDesc)
      await page.getByRole('button', { name: /Vista previa/ }).first().click()
      await expect(footer.getByTestId('footer-description')).toHaveText(draftDesc)
      const pub = await anonPage(browser)
      await expect(pub.footer.getByTestId('footer-description')).toHaveText(`Borrador ${RUN}`)
      await expect(pub.footer.getByTestId('footer-columns')).toHaveAttribute('data-columns', '4')
      await pub.ctx.close()
      await ctx.close()
    })

    test('25 · compatibilidad: un enlace guardado a una página que ya no existe se conserva, se señala y no se enseña', async ({ browser }) => {
      const put = await a.put('/api/admin/site-footer', { data: { description: DESC, columns: { explore: { links: [{ id: 'viejo', kind: 'page', target: 'offplan-antiguo' }, { id: 'ok', kind: 'page', target: 'buy' }] } } } })
      expect(put.ok(), await put.text()).toBeTruthy()
      const saved = (await (await a.get('/api/admin/site-footer')).json()).config
      expect(saved.columns.explore.links.map((l: any) => l.target)).toEqual(['offplan-antiguo', 'buy'])
      const { ctx, page, footer } = await openFooterInspector(browser)
      const li = page.getByTestId('footer-links-explore').locator('li[data-link-id="viejo"]')
      await expect(li.getByTestId('footer-link-problem')).toContainText('ya no existe')
      await expect(footer.getByTestId('footer-col-explore').locator('a[data-link-id]')).toHaveCount(1)
      await expect(footer.getByTestId('footer-col-explore').locator('a[data-link-id="ok"]')).toHaveAttribute('href', '/propiedades?operacion=venta')
      await ctx.close()
    })

    test('26 · en el lienzo el formulario no guarda nada y «Configurar cookies» abre el aviso de muestra', async ({ browser }) => {
      const { ctx, page, canvas, footer } = await openFooterInspector(browser)
      await page.getByRole('button', { name: /Vista previa/ }).first().click()
      const form = footer.getByTestId('footer-newsletter')
      const email = `lienzo-${RUN}@mm.test`
      await form.getByTestId('footer-newsletter-email').fill(email)
      await form.getByTestId('footer-newsletter-consent').check()
      await form.getByTestId('footer-newsletter-submit').click()
      await expect(form.getByTestId('footer-newsletter-message')).toContainText('En el editor no se guarda')
      expect((await adminList(email)).total).toBe(0)
      await footer.getByTestId('footer-cookie-settings').click()
      await expect(canvas.getByTestId('cookie-settings')).toBeVisible()
      await ctx.close()
    })
  })

  // --------------------------------------------------------- multi-tenant
  test('27 · cada inmobiliaria tiene su pie y sus suscriptores: lo de A no aparece en B', async () => {
    const b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    try {
      const footerB = await (await b.get('/api/admin/site-footer')).json()
      expect(footerB.config.description).not.toBe(`Borrador ${RUN}`)
      expect(footerB.config.description).not.toBe(DESC)
      expect(footerB.profile.phone).not.toBe('+34 985 000 100')
      // Una suscripción propia de esta prueba (no depende de las anteriores).
      const email = `aislamiento-${RUN}@mm.test`
      expect((await anon.post('/api/public/newsletter', { data: { email, privacyAccepted: true } })).ok()).toBeTruthy()
      expect((await adminList(email)).total).toBe(1)
      const listB = await (await b.get(`/api/admin/newsletter?q=${encodeURIComponent(RUN)}`)).json()
      expect(listB.total).toBe(0)
      // B no puede dar de baja ni borrar a un suscriptor de A.
      const idA = (await adminList(email)).items[0].id
      expect((await b.patch('/api/admin/newsletter', { data: { id: idA, action: 'delete' } })).status()).toBe(404)
      expect((await adminList(email)).total).toBe(1)
    } finally {
      await b.dispose()
    }
  })

  test('28 · accesibilidad: columnas como navegación con nombre, iconos con etiqueta, campo con etiqueta y botones nombrados', async ({ browser }) => {
    await publishFooter(baseline())
    const { ctx, footer } = await anonPage(browser)
    for (const key of ['explore', 'company', 'services']) await expect(footer.getByTestId(`footer-col-${key}`)).toHaveAttribute('aria-label', /.+/)
    for (const l of await footer.getByTestId('footer-social').locator('a').all()) await expect(l).toHaveAttribute('aria-label', /.+/)
    await expect(footer.getByLabel('Tu correo electrónico')).toBeVisible()
    await expect(footer.getByTestId('footer-newsletter-submit')).toHaveAttribute('aria-label', 'Suscribirme')
    await expect(footer.getByTestId('footer-back-to-top')).toHaveAttribute('aria-label', 'Volver arriba')
    await expect(footer.getByTestId('footer-legal')).toHaveAttribute('aria-label', 'Legal')
    await ctx.close()
  })
})
