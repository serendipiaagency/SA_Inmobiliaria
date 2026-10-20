import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { ANON_STATE, STATE_A } from './global-setup'
import { buildPng } from '../../test/unit/helpers/mediaFixtures'

/**
 * «Vender propiedad» (Cola 9): el formulario de valoración multipaso del
 * Constructor Web. Tipos y subtipos del catálogo de Property Core, ubicación
 * con el autocompletado geográfico de la plataforma, preguntas por tipo, fotos
 * opcionales y un lead real de captación en el CRM; sin cifras de valoración.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}`.slice(-8)
const ipHeader = (n: number) => ({ 'cf-connecting-ip': `198.51.${(Date.now() + n * 7) % 250}.${(n * 13) % 250 + 1}` })

async function openForm(browser: any, n: number, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ storageState: ANON_STATE, extraHTTPHeaders: ipHeader(n), viewport })
  const page: Page = await ctx.newPage()
  await page.goto('/vender')
  await expect(page.getByTestId('seller-valuation')).toBeVisible({ timeout: 20_000 })
  return { ctx, page }
}
const next = (page: Page) => page.getByTestId('seller-next').click()
const progress = (page: Page) => page.getByTestId('seller-progress')

// El simulador del proveedor (scripts/e2e-provider-mock.mjs) guarda cada POST /emails.
const MOCK_URL = process.env.E2E_PROVIDER_MOCK_URL || 'http://127.0.0.1:8799'
async function emailsTo(address: string) {
  const all = (await (await fetch(`${MOCK_URL}/__requests`)).json()) as any[]
  return all.filter((r) => r.method === 'POST' && r.path === '/emails' && String(r.body?.to).toLowerCase() === address.toLowerCase()).map((r) => r.body)
}

async function pickLocation(page: Page, text = 'Oviedo') {
  const box = page.getByTestId('location-autocomplete').locator('input')
  await box.fill(text)
  const opt = page.locator('[data-testid="location-suggestions"] [role="option"]').first()
  await expect(opt).toBeVisible({ timeout: 15_000 })
  await opt.click()
}

async function fillToContact(page: Page, opts: { type?: string; area?: string; extra?: (p: Page) => Promise<void> } = {}) {
  await page.locator(`button[data-type="${opts.type || 'Apartment'}"]`).click()
  await next(page)
  await pickLocation(page)
  await next(page)
  await page.locator(`[data-q="${opts.type === 'Land' ? 'plotArea' : 'area'}"]`).fill(opts.area || '95')
  await next(page)
  if (opts.type !== 'Land') await next(page) // características
  await opts.extra?.(page)
  await next(page) // información adicional
}

test.describe('Vender propiedad: el formulario de valoración', () => {
  test.describe.configure({ mode: 'serial' })
  let admin: APIRequestContext

  test.beforeAll(async () => {
    admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  })
  test.afterAll(async () => {
    await admin?.dispose()
  })

  test('la página conserva cabecera, pie y ruta, y arranca con el formulario nuevo en el paso 1 de 6', async ({ browser }) => {
    const { ctx, page } = await openForm(browser, 1)
    await expect(page.locator('header').first()).toBeVisible()
    await expect(page.locator('footer').first()).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/vender')
    await expect(progress(page)).toContainText('Paso 1 de 6')
    await expect(page.locator('form').filter({ hasText: 'Tu propiedad' })).toHaveCount(0)
    await ctx.close()
  })

  test('el paso 1 ofrece los tipos de Property Core, agrupados, y no deja continuar sin elegir', async ({ browser }) => {
    const { ctx, page } = await openForm(browser, 2)
    const types = await page.locator('button[data-type]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.type))
    expect(types.sort()).toEqual(['Apartment', 'Building', 'Development', 'Duplex', 'Finca', 'Garage', 'House', 'Land', 'Office', 'Penthouse', 'Retail', 'Studio', 'Townhouse', 'Villa', 'Warehouse'])
    await expect(page.locator('button[data-type="Apartment"]')).toHaveText('Piso')
    await expect(page.locator('button[data-type="Villa"]')).toHaveText('Chalet')
    await next(page)
    await expect(page.getByTestId('seller-error')).toContainText('tipo de propiedad')
    await expect(progress(page)).toContainText('Paso 1 de 6')
    await ctx.close()
  })

  test('al elegir un tipo salen sus subtipos reales', async ({ browser }) => {
    const { ctx, page } = await openForm(browser, 3)
    await expect(page.getByTestId('seller-subtype')).toHaveCount(0)
    await page.locator('button[data-type="Apartment"]').click()
    const options = await page.getByTestId('seller-subtype').locator('option').allTextContents()
    expect(options).toEqual(expect.arrayContaining(['Piso', 'Apartamento', 'Loft', 'Bajo con jardín']))
    await page.locator('button[data-type="Villa"]').click()
    expect(await page.getByTestId('seller-subtype').locator('option').allTextContents()).toEqual(expect.arrayContaining(['Chalet independiente']))
    expect(await page.getByTestId('seller-subtype').locator('option').allTextContents()).not.toContain('Loft')
    await ctx.close()
  })

  test('la ubicación usa el autocompletado de la plataforma y es obligatoria', async ({ browser }) => {
    const { ctx, page } = await openForm(browser, 4)
    await page.locator('button[data-type="Apartment"]').click()
    await next(page)
    await expect(progress(page)).toContainText('Paso 2 de 6')
    await next(page)
    await expect(page.getByTestId('seller-error')).toContainText('dónde')
    await pickLocation(page)
    await expect(page.getByTestId('location-autocomplete').locator('.loc-chip')).toHaveCount(1)
    await next(page)
    await expect(progress(page)).toContainText('Paso 3 de 6')
    await ctx.close()
  })

  test('la superficie es obligatoria y las preguntas son las del tipo', async ({ browser }) => {
    const { ctx, page } = await openForm(browser, 5)
    await page.locator('button[data-type="Apartment"]').click()
    await next(page)
    await pickLocation(page)
    await next(page)
    for (const q of ['area', 'usableArea', 'bedrooms', 'bathrooms']) await expect(page.locator(`[data-q="${q}"]`)).toBeVisible()
    await expect(page.locator('[data-q="plotArea"]')).toHaveCount(0)
    await next(page)
    await expect(page.getByTestId('seller-error')).toContainText('superficie')
    await page.locator('[data-q="area"]').fill('-4')
    await next(page)
    await expect(page.getByTestId('seller-error')).toContainText('Revisa')
    await ctx.close()
  })

  test('un chalet pregunta por la parcela; un terreno tiene un paso menos y no habitaciones', async ({ browser }) => {
    const villa = await openForm(browser, 6)
    await villa.page.locator('button[data-type="Villa"]').click()
    await next(villa.page)
    await pickLocation(villa.page)
    await next(villa.page)
    await expect(villa.page.locator('[data-q="plotArea"]')).toBeVisible()
    await villa.ctx.close()

    const land = await openForm(browser, 7)
    await land.page.locator('button[data-type="Land"]').click()
    await expect(progress(land.page)).toContainText('Paso 1 de 5')
    await next(land.page)
    await pickLocation(land.page)
    await next(land.page)
    await expect(land.page.locator('[data-q="bedrooms"]')).toHaveCount(0)
    await expect(land.page.locator('[data-q="plotArea"]')).toBeVisible()
    await land.page.locator('[data-q="plotArea"]').fill('12000')
    await next(land.page)
    await expect(progress(land.page)).toContainText('Información adicional')
    await land.ctx.close()
  })

  test('Volver conserva las respuestas, y cambiar de tipo quita las que ya no aplican', async ({ browser }) => {
    const { ctx, page } = await openForm(browser, 8)
    await page.locator('button[data-type="Apartment"]').click()
    await next(page)
    await pickLocation(page)
    await next(page)
    await page.locator('[data-q="area"]').fill('120')
    await page.locator('[data-q="bedrooms"]').fill('4')
    await page.getByTestId('seller-back').click()
    await expect(progress(page)).toContainText('Paso 2 de 6')
    await expect(page.getByTestId('location-autocomplete').locator('.loc-chip')).toHaveCount(1)
    await next(page)
    await expect(page.locator('[data-q="area"]')).toHaveValue('120')
    await expect(page.locator('[data-q="bedrooms"]')).toHaveValue('4')
    await page.getByTestId('seller-back').click()
    await page.getByTestId('seller-back').click()
    await page.locator('button[data-type="Villa"]').click()
    await next(page)
    await next(page)
    await expect(page.locator('[data-q="area"]')).toHaveValue('')
    await ctx.close()
  })

  test('accesibilidad: barra de progreso con valores, botones con rol y foco en el título del paso', async ({ browser }) => {
    const { ctx, page } = await openForm(browser, 9)
    const bar = page.getByRole('progressbar')
    await expect(bar).toHaveAttribute('aria-valuenow', '1')
    await expect(bar).toHaveAttribute('aria-valuemax', '6')
    await expect(page.getByRole('radiogroup').first()).toBeVisible()
    await page.locator('button[data-type="Apartment"]').click()
    await expect(page.locator('button[data-type="Apartment"]')).toHaveAttribute('aria-checked', 'true')
    await next(page)
    await expect(bar).toHaveAttribute('aria-valuenow', '2')
    await expect(page.locator('legend')).toBeFocused()
    await ctx.close()
  })

  test('los envíos exigen aceptar la política de privacidad', async ({ browser }) => {
    const { ctx, page } = await openForm(browser, 10)
    await fillToContact(page)
    await expect(progress(page)).toContainText('Paso 6 de 6')
    await page.locator('#seller-name').fill(`Sin consentimiento ${RUN}`)
    await page.locator('#seller-email').fill(`sin-${RUN}@example.com`)
    await page.getByRole('button', { name: 'Enviar mi propiedad' }).click()
    await expect(page.getByTestId('seller-error')).toContainText('política de privacidad')
    await expect(page.getByTestId('seller-valuation-done')).toHaveCount(0)
    const leads = ((await (await admin.get('/api/admin/leads', { params: { q: `sin-${RUN}@example.com` } })).json()).rows || []) as any[]
    expect(leads).toHaveLength(0)
    await ctx.close()
  })

  test('el envío crea un lead real de captación con lo contado, rol Vendedor, sin propiedad y sin cifras', async ({ browser }) => {
    const email = `vende-${RUN}@example.com`
    const propsBefore = (await (await admin.get('/api/admin/properties', { params: { q: `Oviedo` } })).json()).total
    const { ctx, page } = await openForm(browser, 11)
    await page.locator('button[data-type="Apartment"]').click()
    await page.getByTestId('seller-subtype').selectOption('loft')
    await next(page)
    await pickLocation(page)
    await page.locator('#seller-address').fill('Calle Uría 5')
    await next(page)
    await page.locator('[data-q="area"]').fill('95')
    await page.locator('[data-q="bedrooms"]').fill('3')
    await page.locator('[data-q="bathrooms"]').fill('2')
    await next(page)
    await page.locator('[data-q="condition"]').selectOption('good')
    await page.locator('[data-q="hasElevator"]').check()
    await next(page)
    await page.locator('[data-q="timeframe"]').selectOption('months_3')
    await page.getByTestId('seller-comments').fill('Tiene vistas al parque')
    await next(page)
    await page.locator('#seller-name').fill(`Propietaria ${RUN}`)
    await page.locator('#seller-email').fill(email)
    await page.locator('#seller-phone').fill('+34 633 444 555')
    await page.getByTestId('seller-privacy').check()
    await page.getByRole('button', { name: 'Enviar mi propiedad' }).click()

    const done = page.getByTestId('seller-valuation-done')
    await expect(done).toBeVisible({ timeout: 20_000 })
    await expect(done).toContainText('Hemos recibido los datos de tu propiedad')
    // Sin motor de valoración, ni una cifra: nada de euros ni de «valor estimado».
    expect(await done.innerText()).not.toMatch(/€|\d{3}\.\d{3}|estimad/i)
    await ctx.close()

    const leads = ((await (await admin.get('/api/admin/leads', { params: { q: email } })).json()).rows || []) as any[]
    expect(leads).toHaveLength(1)
    const lead = leads[0]
    expect(lead).toMatchObject({ sourceDetail: 'Vender propiedad', source: 'web' })
    for (const line of ['Quiere vender: Piso (Loft)', 'Calle Uría 5', 'Superficie construida: 95 m²', 'Habitaciones: 3', 'Estado de conservación: Buen estado', 'Ascensor: Sí', 'En los próximos 3 meses', 'Comentarios: Tiene vistas al parque']) {
      expect(lead.originalMessage, line).toContain(line)
    }
    const contact = await (await admin.get(`/api/admin/contacts/${lead.contactId}`)).json()
    expect(contact.row.roles).toContain('seller')
    const threads = await (await admin.get('/api/admin/comms/conversations', { params: { source: 'web_form', status: 'all', q: email } })).json()
    expect(JSON.stringify(threads.rows)).toContain('seller')
    // No se ha creado ninguna propiedad.
    const propsAfter = (await (await admin.get('/api/admin/properties', { params: { q: `Oviedo` } })).json()).total
    expect(propsAfter).toBe(propsBefore)
    // Cola 12: el vendedor recibe el acuse de recibo con el remitente de la agencia
    // (en su idioma: Playwright navega en inglés, así que sale en inglés).
    const isWelcome = (b: any) => /solicitud de venta|received your sale request/i.test(String(b.subject))
    await expect.poll(async () => (await emailsTo(email)).filter(isWelcome).length, { timeout: 15_000 }).toBeGreaterThan(0)
    const welcome = (await emailsTo(email)).find(isWelcome)
    expect(welcome, 'se envió el correo de bienvenida al vendedor').toBeTruthy()
    expect(String(welcome.html)).toMatch(/venta de tu propiedad|sell your property/)
  })

  test('las fotos son opcionales: se suben, se enlazan al lead y sólo las abre el equipo con sesión', async ({ browser }) => {
    const email = `fotos-${RUN}@example.com`
    const { ctx, page } = await openForm(browser, 12)
    await fillToContact(page, {
      extra: async () => {},
    })
    // Estamos en «Información adicional»? fillToContact ya avanzó: volvemos a ella para adjuntar.
    await page.getByTestId('seller-back').click()
    await expect(page.getByTestId('seller-photos')).toBeVisible()
    await page.locator('#seller-photo-input').setInputFiles({ name: 'salon.png', mimeType: 'image/png', buffer: Buffer.from(buildPng(60, 40)) })
    await expect(page.getByTestId('seller-photos').getByText('salon.png')).toBeVisible({ timeout: 15_000 })
    await next(page)
    await page.locator('#seller-name').fill(`Con fotos ${RUN}`)
    await page.locator('#seller-email').fill(email)
    await page.getByTestId('seller-privacy').check()
    await page.getByRole('button', { name: 'Enviar mi propiedad' }).click()
    await expect(page.getByTestId('seller-valuation-done')).toBeVisible({ timeout: 20_000 })
    await ctx.close()

    const lead = (((await (await admin.get('/api/admin/leads', { params: { q: email } })).json()).rows || []) as any[])[0]
    const key = /Foto 1: \/api\/media\/(\S+)/.exec(lead.originalMessage)?.[1]
    expect(key, 'la foto consta en el lead').toBeTruthy()
    expect((await admin.get(`/api/media/${key}`)).status(), 'el equipo la abre').toBe(200)
    const anon = await pwRequest.newContext({ baseURL: BASE_URL })
    expect((await anon.get(`/api/media/${key}`)).status(), 'un visitante no').toBeGreaterThanOrEqual(401)
    await anon.dispose()
  })

  test('una foto que no es imagen se rechaza en el servidor', async () => {
    const anon = await pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: ipHeader(13) })
    const bad = await anon.post('/api/public/contact?channel=seller-photo&submissionId=sv-e2e-bad-1', { headers: { 'content-type': 'image/png' }, data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') })
    expect(bad.status()).toBe(415)
    const ok = await anon.post('/api/public/contact?channel=seller-photo&submissionId=sv-e2e-ok-12', { headers: { 'content-type': 'image/png' }, data: Buffer.from(buildPng(20, 20)) })
    expect(ok.status()).toBe(201)
    await anon.dispose()
  })

  test('el servidor no se fía del navegador: un tipo inventado o sin consentimiento no crea nada', async () => {
    const anon = await pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: ipHeader(14) })
    const email = `hack-${RUN}@example.com`
    const base = { type: 'contact', form: 'seller', name: 'Hack', email, privacyAccepted: true, submissionId: `sv-hack-${RUN}` }
    const loc = { id: 'es:mun:33044', kind: 'municipality', label: 'Oviedo' }
    expect((await anon.post('/api/public/contact', { data: { ...base, valuation: { propertyType: 'Castillo', location: loc, answers: { area: 10 } } } })).status()).toBe(422)
    expect((await anon.post('/api/public/contact', { data: { ...base, privacyAccepted: false, valuation: { propertyType: 'Apartment', location: loc, answers: { area: 10 } } } })).status()).toBe(422)
    const leads = ((await (await admin.get('/api/admin/leads', { params: { q: email } })).json()).rows || []) as any[]
    expect(leads).toHaveLength(0)
    await anon.dispose()
  })

  test('el formulario antiguo (sin valoración) sigue creando su lead', async () => {
    const anon = await pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: ipHeader(15) })
    const email = `antiguo-${RUN}@example.com`
    const res = await anon.post('/api/public/contact', { data: { type: 'contact', form: 'seller', name: 'Antiguo', email, message: 'Piso de 3 habitaciones', submissionId: `sv-old-${RUN}` } })
    expect(res.ok()).toBeTruthy()
    const lead = (((await (await admin.get('/api/admin/leads', { params: { q: email } })).json()).rows || []) as any[])[0]
    expect(lead).toMatchObject({ sourceDetail: 'Vender propiedad', originalMessage: 'Piso de 3 habitaciones' })
    await anon.dispose()
  })

  for (const [name, width, height] of [['móvil', 375, 740], ['tableta', 820, 1100], ['escritorio', 1440, 900]] as const) {
    test(`${name}: el formulario cabe en pantalla sin desbordar`, async ({ browser }) => {
      const { ctx, page } = await openForm(browser, 20 + width % 7, { width, height })
      await page.locator('button[data-type="Apartment"]').click()
      for (const _ of [1, 2]) {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow).toBeLessThanOrEqual(0)
        await next(page)
        if (_ === 1) await pickLocation(page)
      }
      await ctx.close()
    })
  }
})

test.describe('Vender propiedad: el bloque en el Constructor Web', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: STATE_A })
  let admin: APIRequestContext
  let original: any

  test.beforeAll(async () => {
    admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    original = await (await admin.get('/api/admin/site-pages/vender')).json()
  })
  test.afterAll(async () => {
    // Deja la página como estaba: sin versión propia si no la tenía.
    await admin.delete('/api/admin/site-pages/vender').catch(() => null)
    await admin?.dispose()
  })

  test('la página parte con el bloque y sin el formulario antiguo, y se guarda con opciones validadas', async () => {
    const draft = original
    const types = (draft.blocks || []).map((b: any) => b.type)
    expect(types).toContain('seller-valuation')
    expect(types).not.toContain('lead-form')
    const block = draft.blocks.find((b: any) => b.type === 'seller-valuation')
    const put = await admin.put('/api/admin/site-pages/vender', {
      data: { blocks: draft.blocks.map((b: any) => (b.id === block.id ? { ...b, content: { ...b.content, title: `Vende con nosotros ${RUN}`, hiddenTypes: ['Garage', 'Castillo'], hiddenQuestions: ['terraceArea', 'area', 'nope'], questionLabels: { bedrooms: 'Dormitorios' } } } : b)), seo: draft.seo, styles: draft.styles },
    })
    expect(put.ok(), await put.text()).toBeTruthy()
    const saved = await (await admin.get('/api/admin/site-pages/vender')).json()
    const content = saved.blocks.find((b: any) => b.type === 'seller-valuation').content
    expect(content).toMatchObject({ title: `Vende con nosotros ${RUN}`, hiddenTypes: ['Garage'], hiddenQuestions: ['terraceArea'], questionLabels: { bedrooms: 'Dormitorios' } })
  })

  test('publicado, el formulario refleja los cambios: sin «Garaje», sin «Terraza», con el rótulo propio y la superficie siempre', async ({ browser }) => {
    expect((await admin.post('/api/admin/site-pages/vender/publish')).ok()).toBeTruthy()
    const ctx = await browser.newContext({ storageState: ANON_STATE, extraHTTPHeaders: ipHeader(30) })
    const page = await ctx.newPage()
    await page.goto('/vender')
    await expect(page.getByText(`Vende con nosotros ${RUN}`)).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('button[data-type="Garage"]')).toHaveCount(0)
    await expect(page.locator('button[data-type="Apartment"]')).toBeVisible()
    await page.locator('button[data-type="Apartment"]').click()
    await next(page)
    await pickLocation(page)
    await next(page)
    await expect(page.locator('[data-q="area"]')).toBeVisible()
    await expect(page.locator('[data-q="terraceArea"]')).toHaveCount(0)
    await expect(page.getByText('Dormitorios')).toBeVisible()
    await ctx.close()
  })

  test('el lienzo del Constructor enseña el formulario y no envía nada', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STATE_A, viewport: { width: 1600, height: 1000 } })
    const page = await ctx.newPage()
    await page.goto('/admin/site-builder?pagina=vender')
    const canvas = page.frameLocator('iframe[title="Vista previa del Constructor Web"]')
    await expect(canvas.getByTestId('seller-valuation')).toBeVisible({ timeout: 30_000 })
    await expect(canvas.getByTestId('seller-progress')).toContainText('Paso 1 de 6')
    // En el lienzo un clic selecciona, no actúa: ni avanza ni envía.
    await canvas.getByTestId('seller-next').click()
    await expect(canvas.getByTestId('seller-progress')).toContainText('Paso 1 de 6')
    await expect(canvas.getByText('Desactivado mientras editas')).toBeVisible()
    await expect(canvas.getByTestId('seller-valuation-done')).toHaveCount(0)
    await ctx.close()
  })

  test('el inspector ofrece Contenido, Diseño y Avanzado, y no permite quitar lo obligatorio', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STATE_A, viewport: { width: 1600, height: 1000 } })
    const page = await ctx.newPage()
    await page.goto('/admin/site-builder?pagina=vender')
    const canvas = page.frameLocator('iframe[title="Vista previa del Constructor Web"]')
    await canvas.getByTestId('seller-valuation').click({ position: { x: 5, y: 5 } })
    const insp = page.getByTestId('seller-valuation-inspector')
    await expect(insp).toBeVisible({ timeout: 20_000 })
    await expect(insp.getByText('Preguntas', { exact: true })).toBeVisible()
    await expect(insp.getByTestId('seller-type-Apartment')).toBeVisible()
    await expect(insp.getByTestId('seller-question-terraceArea')).toBeVisible()
    // La superficie, el nombre, el email y la privacidad no aparecen como opcionales.
    await expect(insp.getByTestId('seller-question-area')).toHaveCount(0)
    await expect(insp.getByText('no se pueden quitar')).toBeVisible()
    for (const tab of ['Contenido', 'Diseño', 'Avanzado']) await expect(page.getByRole('button', { name: tab, exact: true }).first()).toBeVisible()
    await ctx.close()
  })

  test('multiempresa: lo publicado por una agencia no sale en la web de otra', async () => {
    const b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: (await import('./global-setup')).STATE_B })
    const theirs = await (await b.get('/api/admin/site-pages/vender')).json()
    const draft = theirs
    const content = (draft.blocks || []).find((x: any) => x.type === 'seller-valuation')?.content || {}
    expect(JSON.stringify(content)).not.toContain(`Vende con nosotros ${RUN}`)
    await b.dispose()
  })
})
