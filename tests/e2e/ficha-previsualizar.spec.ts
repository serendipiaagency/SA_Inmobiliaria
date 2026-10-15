import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { ANON_STATE, STATE_A, STATE_B } from './global-setup'
import { buildPng } from '../../test/unit/helpers/mediaFixtures'

/**
 * Ficha de propiedad editable (paso 3): «Previsualizar con: [propiedad]» y la
 * visibilidad por tamaño de pantalla. Cambiar la propiedad de ejemplo cambia
 * los datos que se ven, nunca la plantilla; el selector sólo ofrece propiedades
 * de la inmobiliaria activa.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const CANVAS = 'iframe[title="Vista previa del Constructor Web"]'
const RUN = `${Date.now()}`.slice(-7)
const PAGE_URL = '/admin/site-builder?pagina=ficha-propiedad'

test.describe('Previsualizar la ficha con otra propiedad', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  let first = { id: 0, slug: '', name: '' }
  let second = { id: 0, slug: '', name: '' }
  let ofB = { id: 0, slug: '', name: '' }

  async function createProperty(ctx: APIRequestContext, name: string, price: number) {
    const dev = await ctx.post('/api/admin/developers', { data: { name: `Promotora ${name}`, email: `fp-${RUN}-${Math.floor(Math.random() * 1e6)}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => ctx.delete(`/api/admin/developers/${developerId}`))
    const up = await ctx.post('/api/admin/upload', { multipart: { file: { name: 'portada.png', mimeType: 'image/png', buffer: Buffer.from(buildPng(320, 200)) }, folder: 'properties' } })
    expect(up.ok(), await up.text()).toBeTruthy()
    const cover = (await up.json()).key as string
    const res = await ctx.post('/api/admin/developer-properties', {
      data: { developerId, name, coverImage: cover, price, bedrooms: 3, bathrooms: 2, area: 100, status: 'ready', transactionType: 'sale', lat: 43.5453, lng: -5.6619, description: `Descripción de ${name}.`, community: `Zona ${name.split(' ').pop()}` },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    cleanup.push(() => ctx.delete(`/api/admin/developer-properties/${id}?hard=1`))
    const { row } = await (await ctx.get(`/api/admin/developer-properties/${id}`)).json()
    return { id, slug: row.slug as string, name }
  }

  const draft = async () => await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
  const coreOf = (d: any) => (d.blocks as any[]).find((x) => x.type === 'page-core')

  async function open(page: Page, width = 1440) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(PAGE_URL)
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.getByTestId('ficha-summary')).toBeVisible({ timeout: 20_000 })
    return canvas
  }
  const choose = async (page: Page, id: number) => {
    await page.getByTestId('ficha-preview-button').click()
    await page.getByTestId(`ficha-preview-option-${id}`).click()
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    first = await createProperty(a, `Previa Uno ${RUN}`, 250000)
    second = await createProperty(a, `Previa Dos ${RUN}`, 480000)
    ofB = await createProperty(b, `Previa Ajena ${RUN}`, 199000)
    expect((await a.delete('/api/admin/site-pages/ficha-propiedad')).ok()).toBeTruthy()
  })

  test.afterAll(async () => {
    await a.delete('/api/admin/site-pages/ficha-propiedad').catch(() => null)
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose()])
  })

  test('1 · el selector sólo está en la ficha y arranca con la propiedad más reciente', async ({ page }) => {
    const canvas = await open(page)
    await expect(page.getByTestId('ficha-preview-picker')).toBeVisible()
    await expect(page.getByTestId('ficha-preview-current')).toHaveText('La más reciente')
    await expect(canvas.locator('h1')).toHaveText(second.name)
    // En otra página no hay selector.
    await page.goto('/admin/site-builder?pagina=home')
    await expect(page.getByTestId('site-page-info')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('ficha-preview-picker')).toHaveCount(0)
  })

  test('2 · sólo ofrece propiedades de la inmobiliaria activa', async ({ page }) => {
    await open(page)
    await page.getByTestId('ficha-preview-button').click()
    await expect(page.getByTestId(`ficha-preview-option-${first.id}`)).toBeVisible()
    await expect(page.getByTestId(`ficha-preview-option-${second.id}`)).toBeVisible()
    await expect(page.getByTestId(`ficha-preview-option-${ofB.id}`)).toHaveCount(0)
    // Y el servidor no sirve la ficha de una propiedad ajena (404, igual que si no existiera) ni un id inválido.
    expect((await a.get(`/api/admin/site-pages/ficha-sample?propertyId=${ofB.id}`)).status()).toBe(404)
    expect((await a.get('/api/admin/site-pages/ficha-sample?propertyId=999999999')).status()).toBe(404)
    expect((await a.get('/api/admin/site-pages/ficha-sample?propertyId=abc')).status()).toBe(400)
    expect((await a.get('/api/admin/site-pages/ficha-sample?propertyId=-3')).status()).toBe(400)
    const anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: ANON_STATE })
    expect((await anon.get(`/api/admin/site-pages/ficha-sample?propertyId=${first.id}`)).status()).toBeGreaterThanOrEqual(401)
    expect((await anon.get('/api/admin/site-pages/ficha-properties')).status()).toBeGreaterThanOrEqual(401)
    await anon.dispose()
    // Tampoco se reconoce por id una propiedad ajena en el listado.
    expect((await (await a.get(`/api/admin/site-pages/ficha-properties?id=${ofB.id}`)).json()).selected).toBeNull()
    expect((await (await a.get(`/api/admin/site-pages/ficha-properties?id=${first.id}`)).json()).selected?.name).toBe(first.name)
    // Al revés: B no ve las de A.
    const listB = await (await b.get('/api/admin/site-pages/ficha-properties')).json()
    expect((listB.properties as any[]).map((p) => p.id)).toContain(ofB.id)
    expect((listB.properties as any[]).map((p) => p.id)).not.toContain(first.id)
  })

  test('3 · elegir otra propiedad cambia los datos del lienzo y no crea cambios en la plantilla', async ({ page }) => {
    const canvas = await open(page)
    const before = JSON.stringify(await draft())
    await choose(page, first.id)
    await expect(page.getByTestId('ficha-preview-current')).toHaveText(first.name)
    await expect(canvas.locator('h1')).toHaveText(first.name)
    await expect(canvas.getByTestId('ficha-description-text')).toContainText(`Descripción de ${first.name}`)
    // Precio real de la elegida.
    await expect(canvas.getByTestId('ficha-aside').getByTestId('ficha-price-card')).toContainText(/250[.,]000/)
    // La plantilla es la misma: ni una sola escritura.
    expect(JSON.stringify(await draft())).toBe(before)
    // Volver a la más reciente.
    await choose(page, second.id)
    await expect(canvas.locator('h1')).toHaveText(second.name)
    await expect(canvas.getByTestId('ficha-aside').getByTestId('ficha-price-card')).toContainText(/480[.,]000/)
  })

  test('4 · el estilo de la plantilla se aplica a la propiedad elegida, sea cual sea', async ({ page }) => {
    const canvas = await open(page)
    await page.locator('[data-ficha-node="b.summary"]').click()
    await page.getByTestId('inspector-tabs').getByRole('button', { name: 'Diseño' }).click()
    await page.getByTestId('node-background').fill('#fdf1e7')
    await page.getByTestId('node-background').press('Enter')
    await expect.poll(async () => coreOf(await draft()).nodeStyles?.['b.summary']?.background, { timeout: 10_000 }).toBe('#fdf1e7')
    await choose(page, first.id)
    await expect(canvas.locator('h1')).toHaveText(first.name)
    await expect(canvas.getByTestId('ficha-summary')).toHaveCSS('background-color', 'rgb(253, 241, 231)')
    // La elegida no se guarda en la plantilla: ni su nombre ni su precio.
    const saved = JSON.stringify(coreOf(await draft()))
    expect(saved).not.toContain(first.name)
    expect(saved).not.toContain('250000')
  })

  test('5 · la elección se recuerda al recargar y la Vista previa enseña esa propiedad', async ({ page }) => {
    const canvas = await open(page)
    await choose(page, first.id)
    await expect(canvas.locator('h1')).toHaveText(first.name)
    await page.reload()
    await expect(page.frameLocator(CANVAS).getByTestId('ficha-summary')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('ficha-preview-current')).toHaveText(first.name)
    await expect(page.frameLocator(CANVAS).locator('h1')).toHaveText(first.name)
    // Vista previa: la misma propiedad, sin los contornos del editor.
    await page.locator('button[title="Vista previa"]').click()
    await expect(page.frameLocator(CANVAS).locator('h1')).toHaveText(first.name)
    await page.locator('button[title="Vista previa"]').click()
  })

  test('6 · el buscador del selector filtra por nombre', async ({ page }) => {
    await open(page)
    await page.getByTestId('ficha-preview-button').click()
    await page.getByTestId('ficha-preview-search').fill(`Dos ${RUN}`)
    await expect(page.getByTestId(`ficha-preview-option-${second.id}`)).toBeVisible()
    await expect(page.getByTestId(`ficha-preview-option-${first.id}`)).toHaveCount(0)
    await page.getByTestId('ficha-preview-search').fill('zzz-no-existe')
    await expect(page.getByTestId('ficha-preview-empty')).toBeVisible()
    // Un comodín de LIKE se busca como texto, no como patrón.
    await page.getByTestId('ficha-preview-search').fill('%')
    await expect(page.getByTestId('ficha-preview-empty')).toBeVisible()
  })

  test('7 · una sección se oculta por tamaño: sólo en Móvil, y vuelve al desmarcarla', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: /^Móvil$/ }).click()
    await page.locator('[data-ficha-node="s.hipoteca"]').click()
    await page.getByTestId('inspector-tabs').getByRole('button', { name: 'Avanzado' }).click()
    await expect(page.getByTestId('node-hide-device')).toContainText('Ocultar en Móvil')
    await page.getByTestId('node-hide-device').getByRole('switch').click()
    await expect
      .poll(async () => coreOf(await draft()).nodeStyles?.['s.hipoteca']?.responsive?.mobile?.display, { timeout: 10_000 })
      .toBe('none')
    // Escritorio no cambia: no hay `display` en el nivel base.
    expect(coreOf(await draft()).nodeStyles['s.hipoteca'].display).toBeUndefined()
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.locator('#hipoteca')).toBeHidden()
  })

  test('8 · publicada, la sección oculta en Móvil se ve en Escritorio y no en el móvil', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Publicar cambios' }).click()
    await expect(page.getByTestId('site-page-status-ficha-propiedad')).toHaveText('Publicada')
    const web = await page.context().newPage()
    await web.setViewportSize({ width: 1440, height: 900 })
    await web.goto(`/propiedades/${second.slug}`)
    await expect(web.locator('#hipoteca')).toBeVisible()
    await web.setViewportSize({ width: 390, height: 800 })
    await expect(web.locator('#hipoteca')).toBeHidden()
    // Tablet (768): la regla de móvil no llega.
    await web.setViewportSize({ width: 800, height: 900 })
    await expect(web.locator('#hipoteca')).toBeVisible()
    await web.close()
  })

  test('9 · lo que la ficha necesita no se oculta por tamaño ni se mueve', async ({ page }) => {
    await open(page)
    for (const field of ['b.price', 'b.contact', 'b.gallery', 'd.title']) {
      await page.locator(`[data-ficha-node="${field}"]`).click()
      await page.getByTestId('inspector-tabs').getByRole('button', { name: 'Avanzado' }).click()
      await expect(page.getByTestId('node-hide-blocked'), field).toBeVisible()
      await expect(page.getByTestId('node-hide-device'), field).toHaveCount(0)
    }
    // Aunque el JSON lo pidiera, el servidor no oculta nada a mano: `display` sólo vale para lo opcional en el editor,
    // pero los bloques obligatorios nunca ofrecen el control. El borrador guardado no los tiene ocultos.
    const styles = coreOf(await draft()).nodeStyles || {}
    for (const f of ['b.price', 'b.contact', 'b.gallery', 'd.title']) expect(styles[f]?.display).toBeUndefined()
  })

  test('10 · tablet: un estilo propio de Tablet se aplica entre 640 y 1023 px y no en escritorio', async ({ page }) => {
    await open(page)
    await page.locator('button[title="Tablet"]').click()
    await page.locator('[data-ficha-node="b.keyfacts"]').click()
    await page.getByTestId('inspector-tabs').getByRole('button', { name: 'Diseño' }).click()
    const padY = page.locator('label', { hasText: 'Relleno vertical' }).locator('input[type="number"]')
    await padY.fill('22')
    await padY.press('Enter')
    await expect
      .poll(async () => coreOf(await draft()).nodeStyles?.['b.keyfacts']?.responsive?.tablet?.paddingY, { timeout: 10_000 })
      .toBe(22)
    expect((await page.request.post('/api/admin/site-pages/ficha-propiedad/publish')).ok()).toBeTruthy()
    const web = await page.context().newPage()
    await web.setViewportSize({ width: 800, height: 900 })
    await web.goto(`/propiedades/${second.slug}`)
    const facts = web.getByTestId('ficha-key-facts')
    expect(await facts.evaluate((el) => getComputedStyle(el).paddingTop)).toBe('22px')
    await web.setViewportSize({ width: 1440, height: 900 })
    expect(await facts.evaluate((el) => getComputedStyle(el).paddingTop)).not.toBe('22px')
    await web.close()
  })

  test('11 · la ficha de otra inmobiliaria no se ve afectada por lo de A', async ({ browser }) => {
    const ctxB = await browser.newContext({ storageState: STATE_B, viewport: { width: 1440, height: 900 } })
    const orgB = (await (await b.get('/api/admin/active-org-info')).json()).id
    const pb = await ctxB.newPage()
    await pb.goto(`/propiedades/${ofB.slug}?vista_previa=${orgB}`)
    await expect(pb.getByTestId('ficha-summary')).toBeVisible()
    await expect(pb.getByTestId('ficha-summary')).not.toHaveCSS('background-color', 'rgb(253, 241, 231)')
    await expect(pb.locator('#hipoteca')).toBeVisible()
    await ctxB.close()
  })
})
