import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'
import { buildPng } from '../../test/unit/helpers/mediaFixtures'

/**
 * Ficha de propiedad editable desde el Constructor Web (paso 1): el lienzo
 * enseña la ficha real —no una maqueta—, sus partes son nodos que se
 * seleccionan en el lienzo y en «Estructura», se estilizan por escritorio,
 * tableta y móvil, y lo que se guarda llega a la web publicada sin tocar los
 * datos de la propiedad. Con dos inmobiliarias, para comprobar el aislamiento.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const CANVAS = 'iframe[title="Vista previa del Constructor Web"]'
const RUN = `${Date.now()}`.slice(-7)
const PAGE_URL = '/admin/site-builder?pagina=ficha-propiedad'

test.describe('Ficha editable en el Constructor', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let orgA = 0
  let orgB = 0
  const cleanup: Array<() => Promise<unknown>> = []
  let prop = { id: 0, slug: '', name: '' }

  async function createProperty(ctx: APIRequestContext, name: string) {
    const dev = await ctx.post('/api/admin/developers', { data: { name: `Promotora ${name}`, email: `fe-${RUN}-${Math.floor(Math.random() * 1e6)}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => ctx.delete(`/api/admin/developers/${developerId}`))
    const up = await ctx.post('/api/admin/upload', { multipart: { file: { name: 'portada.png', mimeType: 'image/png', buffer: Buffer.from(buildPng(320, 200)) }, folder: 'properties' } })
    expect(up.ok(), await up.text()).toBeTruthy()
    const cover = (await up.json()).key as string
    const res = await ctx.post('/api/admin/developer-properties', { data: { developerId, name, coverImage: cover, price: 415000, bedrooms: 3, bathrooms: 2, area: 118, status: 'ready', transactionType: 'sale', lat: 43.5453, lng: -5.6619, orientation: 'S', description: 'Vivienda luminosa con terraza orientada al sur.', community: 'Barrio editable' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    cleanup.push(() => ctx.delete(`/api/admin/developer-properties/${id}?hard=1`))
    const { row } = await (await ctx.get(`/api/admin/developer-properties/${id}`)).json()
    return { id, slug: row.slug as string, name }
  }

  const draft = async (ctx = a) => await (await ctx.get('/api/admin/site-pages/ficha-propiedad')).json()
  const coreOf = (d: any) => (d.blocks as any[]).find((x) => x.type === 'page-core')

  async function open(page: Page, width = 1440) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(PAGE_URL)
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.getByTestId('ficha-summary')).toBeVisible({ timeout: 20_000 })
    return canvas
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    orgA = (await (await a.get('/api/admin/active-org-info')).json()).id
    orgB = (await (await b.get('/api/admin/active-org-info')).json()).id
    // La más reciente de la empresa es la que enseña el lienzo.
    prop = await createProperty(a, `Ficha editable ${RUN}`)
    // Punto de partida conocido.
    expect((await a.delete('/api/admin/site-pages/ficha-propiedad')).ok()).toBeTruthy()
  })

  test.afterAll(async () => {
    await a.delete('/api/admin/site-pages/ficha-propiedad').catch(() => null)
    await b.delete('/api/admin/site-pages/ficha-propiedad').catch(() => null)
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose()])
  })

  test('1 · el lienzo enseña la ficha real de la propiedad de ejemplo, sin candado ni maqueta', async ({ page }) => {
    const canvas = await open(page)
    await expect(canvas.getByTestId('page-core-ficha')).toBeVisible()
    await expect(canvas.locator('h1')).toContainText(prop.name)
    // La misma composición que la web: galería, tarjeta principal, dos columnas y precio.
    await expect(canvas.getByTestId('ficha-gallery-wrap')).toBeVisible()
    await expect(canvas.getByTestId('ficha-aside')).toBeVisible()
    await expect(canvas.getByTestId('ficha-aside').getByTestId('ficha-price-card')).toBeVisible()
    await expect(canvas.getByTestId('ficha-description-text')).toContainText('terraza orientada al sur')
    // Ya no es «Zona dinámica» con candado.
    await expect(canvas.getByText(/Zona dinámica/)).toHaveCount(0)
    await expect(canvas.getByTestId('page-core-sections-preview')).toHaveCount(0)
  })

  test('2 · «Estructura» enseña el árbol de bloques de la ficha, con sus hijos', async ({ page }) => {
    await open(page)
    const tree = page.getByTestId('ficha-tree')
    await expect(tree).toBeVisible()
    for (const label of ['Galería', 'Tarjeta principal', 'Precio y próxima visita', 'Atendido por', 'Eficiencia energética', 'Ubicación']) {
      await expect(tree.getByRole('treeitem', { name: new RegExp(label) }).first()).toBeVisible()
    }
    // Los hijos de la tarjeta principal: el título y la ubicación son datos; la descripción, un bloque.
    await expect(tree.locator('[data-ficha-node="d.title"]')).toBeVisible()
    await expect(tree.locator('[data-ficha-node="b.description"]')).toBeVisible()
  })

  test('3 · pulsar un bloque en el lienzo lo selecciona: inspector, miga y contorno', async ({ page }) => {
    const canvas = await open(page)
    await canvas.getByTestId('ficha-aside').getByTestId('ficha-price-card').first().click({ position: { x: 8, y: 8 } })
    await expect(page.getByTestId('breadcrumb-node')).toHaveText('Precio y próxima visita')
    await expect(page.getByTestId('node-inspector')).toBeVisible()
    await expect(canvas.getByTestId('ficha-aside').locator('[data-sb-node$=":b.price"][data-sb-selected]')).toBeVisible()
    // El árbol marca el mismo nodo.
    await expect(page.locator('[data-ficha-node="b.price"]')).toHaveAttribute('aria-selected', 'true')
    // Con tres pestañas.
    await expect(page.getByTestId('inspector-tabs').getByRole('button')).toHaveText(['Contenido', 'Diseño', 'Avanzado'])
  })

  test('4 · un dato de Propiedades se puede estilizar, nunca escribir encima', async ({ page }) => {
    const canvas = await open(page)
    const title = canvas.locator('h1')
    await title.click()
    await expect(page.getByTestId('breadcrumb-node')).toHaveText('Título de la propiedad')
    await expect(page.getByTestId('node-dynamic-notice')).toContainText('Propiedades')
    await title.dblclick()
    await expect(title).not.toHaveAttribute('contenteditable', /.+/)
    await expect(page.getByTestId('node-text')).toHaveCount(0)
  })

  test('5 · pulsar un bloque en «Estructura» lo selecciona en el lienzo y lleva la vista hasta él', async ({ page }) => {
    const canvas = await open(page)
    await page.locator('[data-ficha-node="s.ubicacion"]').click()
    await expect(page.getByTestId('breadcrumb-node')).toHaveText('Ubicación')
    await expect(canvas.locator('[data-sb-node$=":s.ubicacion"][data-sb-selected]')).toHaveCount(1)
  })

  test('6 · estilo del bloque: el fondo y las esquinas se ven al momento y se guardan en el borrador', async ({ page }) => {
    const canvas = await open(page)
    await page.locator('[data-ficha-node="b.summary"]').click()
    await page.getByTestId('inspector-tabs').getByRole('button', { name: 'Diseño' }).click()
    await page.getByTestId('node-background').fill('#fdf1e7')
    await page.getByTestId('node-background').press('Enter')
    await expect.poll(() => canvas.getByTestId('ficha-summary').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(253, 241, 231)')
    await expect
      .poll(async () => coreOf(await draft()).nodeStyles?.['b.summary']?.background, { timeout: 10_000 })
      .toBe('#fdf1e7')
    // Sólo el nodo tocado guarda estilo; la propiedad no cambia.
    const row = (await (await a.get(`/api/admin/developer-properties/${prop.id}`)).json()).row
    expect(row.name).toBe(prop.name)
    expect(Number(row.price)).toBe(415000)
  })

  test('7 · por tamaño: en Móvil el espaciado es propio y el de escritorio no cambia', async ({ page }) => {
    const canvas = await open(page)
    await page.locator('[data-ficha-node="b.summary"]').click()
    await page.getByTestId('inspector-tabs').getByRole('button', { name: 'Diseño' }).click()
    // Pasa a Móvil y da un relleno vertical propio.
    await page.getByRole('button', { name: /^Móvil$/ }).click()
    await expect(page.getByTestId('node-device-banner')).toContainText('Móvil')
    const padY = page.locator('label', { hasText: 'Relleno vertical' }).locator('input[type="number"]')
    await padY.fill('6')
    await padY.press('Enter')
    await expect
      .poll(async () => coreOf(await draft()).nodeStyles?.['b.summary']?.responsive?.mobile?.paddingY, { timeout: 10_000 })
      .toBe(6)
    const saved = coreOf(await draft()).nodeStyles['b.summary']
    expect(saved.paddingY).toBeUndefined()
    expect(saved.background).toBe('#fdf1e7')
    void canvas
  })

  test('8 · texto fijo: doble clic escribe sobre el título de una sección y se guarda sólo el texto nuevo', async ({ page }) => {
    const canvas = await open(page)
    // «Hipoteca y costes» sale si la propiedad tiene precio de venta.
    const title = canvas.locator('[data-sb-node$=":t.hipoteca.title"]')
    await title.scrollIntoViewIfNeeded()
    await title.dblclick()
    await expect(title).toHaveAttribute('contenteditable', /.+/)
    await page.keyboard.press('Control+A')
    await page.keyboard.type('Financiación de tu casa')
    await page.keyboard.press('Enter')
    await expect(title).toContainText('Financiación de tu casa')
    await expect
      .poll(async () => coreOf(await draft()).content['t.hipoteca.title'], { timeout: 10_000 })
      .toBe('Financiación de tu casa')
    // Un texto fijo, no un dato: el servidor no guarda ningún dato de la propiedad en la plantilla.
    const content = coreOf(await draft()).content
    expect(Object.keys(content).filter((k) => k.startsWith('d.'))).toEqual([])
  })

  test('9 · ocultar y reordenar desde «Estructura» cambian el lienzo y la lista de secciones', async ({ page }) => {
    const canvas = await open(page)
    const tree = page.getByTestId('ficha-tree')
    await expect(canvas.locator('#hipoteca')).toHaveCount(1)
    await tree.locator('[data-ficha-node="s.hipoteca"]').hover()
    await page.getByTestId('ficha-toggle-hipoteca').click()
    await expect(canvas.locator('#hipoteca')).toHaveCount(0)
    await expect(tree.locator('[data-ficha-node="s.hipoteca"]')).toHaveAttribute('data-hidden', '1')
    await expect
      .poll(async () => ((coreOf(await draft()).content.sections as any[] | undefined) || []).find((s) => s.key === 'hipoteca')?.visible, { timeout: 10_000 })
      .toBe(false)
    // De nuevo visible.
    await page.getByTestId('ficha-toggle-hipoteca').click()
    await expect(canvas.locator('#hipoteca')).toHaveCount(1)
    // Subir «Ubicación» una posición cambia el orden guardado.
    const before = ((coreOf(await draft()).content.sections as any[]) || []).map((s) => s.key)
    const i = before.indexOf('ubicacion')
    await tree.locator('[data-ficha-node="s.ubicacion"]').hover()
    await page.getByTestId('ficha-up-ubicacion').click()
    await expect
      .poll(async () => ((coreOf(await draft()).content.sections as any[]) || []).map((s) => s.key).indexOf('ubicacion'), { timeout: 10_000 })
      .toBe(Math.max(0, i - 1))
  })

  test('10 · el formulario del lienzo no envía nada', async ({ page }) => {
    const canvas = await open(page)
    const form = canvas.getByTestId('property-contact-form')
    await form.scrollIntoViewIfNeeded()
    // No se desactiva (así su texto se puede seleccionar en el lienzo), pero no envía: aria-disabled y nota de vista previa.
    await expect(canvas.getByTestId('property-contact-submit')).toHaveAttribute('aria-disabled', 'true')
    await expect(canvas.getByTestId('property-contact-preview-note')).toBeVisible()
  })

  test('11 · deshacer y rehacer devuelven y repiten lo hecho en el árbol', async ({ page }) => {
    const canvas = await open(page)
    await expect(canvas.locator('#orientacion')).toHaveCount(1)
    await page.getByTestId('ficha-tree').locator('[data-ficha-node="s.orientacion"]').hover()
    await page.getByTestId('ficha-toggle-orientacion').click()
    await expect(canvas.locator('#orientacion')).toHaveCount(0)
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect(canvas.locator('#orientacion')).toHaveCount(1)
    await page.getByRole('button', { name: 'Rehacer' }).click()
    await expect(canvas.locator('#orientacion')).toHaveCount(0)
    await page.getByRole('button', { name: 'Deshacer' }).click()
  })

  test('12 · recargar el editor conserva lo guardado', async ({ page }) => {
    const canvas = await open(page)
    await expect(canvas.getByTestId('ficha-summary')).toHaveCSS('background-color', 'rgb(253, 241, 231)')
    await expect(canvas.locator('[data-sb-node$=":t.hipoteca.title"]')).toContainText('Financiación de tu casa')
  })

  test('13 · publicada, la web enseña lo editado (estilo y texto) y la propiedad sigue siendo la suya', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Publicar cambios' }).click()
    await expect(page.getByTestId('site-page-status-ficha-propiedad')).toHaveText('Publicada')
    const web = await page.context().newPage()
    await web.setViewportSize({ width: 1440, height: 900 })
    await web.goto(`/propiedades/${prop.slug}`)
    const summary = web.getByTestId('ficha-summary')
    await expect(summary).toHaveCSS('background-color', 'rgb(253, 241, 231)')
    await expect(summary).toHaveAttribute('data-sb-node', /:b\.summary$/)
    await expect(web.locator('#hipoteca h2')).toHaveText('Financiación de tu casa')
    await expect(web.locator('h1')).toHaveText(prop.name)
    // En móvil: el relleno propio de ese tamaño.
    await web.setViewportSize({ width: 390, height: 800 })
    expect(await summary.evaluate((el) => getComputedStyle(el).paddingTop)).toBe('6px')
    await web.setViewportSize({ width: 1440, height: 900 })
    expect(await summary.evaluate((el) => getComputedStyle(el).paddingTop)).not.toBe('6px')
    await web.close()
  })

  test('14 · cada inmobiliaria tiene su ficha: lo de A no sale en la web de B y lo de B no cambia la de A', async ({ browser }) => {
    const propB = await createProperty(b, `Ficha de B ${RUN}`)
    const dB = await draft(b)
    const coreB = coreOf(dB)
    // B nunca ha tocado la suya: ni estilos ni textos de A en su borrador.
    expect(coreB.nodeStyles).toBeUndefined()
    expect(Object.keys(coreB.content).filter((k) => k.startsWith('t.'))).toEqual([])
    // B personaliza la suya y la publica.
    const blocks = (dB.blocks as any[]).map((x) => (x.type === 'page-core' ? { ...x, nodeStyles: { 'b.summary': { background: '#e8f0ff' } } } : x))
    expect((await b.put('/api/admin/site-pages/ficha-propiedad', { data: { blocks, seo: dB.seo || {} } })).ok()).toBeTruthy()
    expect((await b.post('/api/admin/site-pages/ficha-propiedad/publish')).ok()).toBeTruthy()

    const ctxB = await browser.newContext({ storageState: STATE_B, viewport: { width: 1440, height: 900 } })
    const pb = await ctxB.newPage()
    await pb.goto(`/propiedades/${propB.slug}?vista_previa=${orgB}`)
    await expect(pb.getByTestId('ficha-summary')).toHaveCSS('background-color', 'rgb(232, 240, 255)')
    await expect(pb.locator('#hipoteca h2')).not.toHaveText('Financiación de tu casa')
    await ctxB.close()

    // La de A sigue con lo suyo.
    const ctxA = await browser.newContext({ storageState: STATE_A, viewport: { width: 1440, height: 900 } })
    const pa = await ctxA.newPage()
    await pa.goto(`/propiedades/${prop.slug}?vista_previa=${orgA}`)
    await expect(pa.getByTestId('ficha-summary')).toHaveCSS('background-color', 'rgb(253, 241, 231)')
    await ctxA.close()
  })

  test('15 · volver a la página original quita lo editado y la web vuelve a su ficha de siempre', async ({ page }) => {
    expect((await a.delete('/api/admin/site-pages/ficha-propiedad')).ok()).toBeTruthy()
    const web = await page.context().newPage()
    await web.goto(`/propiedades/${prop.slug}`)
    await expect(web.getByTestId('ficha-summary')).not.toHaveCSS('background-color', 'rgb(253, 241, 231)')
    await expect(web.locator('#hipoteca h2')).not.toHaveText('Financiación de tu casa')
    await web.close()
  })
})
