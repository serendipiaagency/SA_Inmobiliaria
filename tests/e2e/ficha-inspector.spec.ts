import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { STATE_A } from './global-setup'
import { buildPng } from '../../test/unit/helpers/mediaFixtures'

/**
 * Ficha de propiedad editable (paso 2): el inspector de cada bloque de la
 * ficha. Cada bloque tiene sus opciones de presentación en la pestaña
 * «Contenido»; lo que se cambia se ve en el lienzo, se guarda en el borrador y
 * llega a la web publicada. Los datos siguen siendo los de la propiedad y el
 * formulario de contacto conserva sus validaciones.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const CANVAS = 'iframe[title="Vista previa del Constructor Web"]'
const RUN = `${Date.now()}`.slice(-7)
const PAGE_URL = '/admin/site-builder?pagina=ficha-propiedad'

test.describe('Inspector por bloque de la ficha editable', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  let prop = { id: 0, slug: '', name: '' }

  async function createProperty(ctx: APIRequestContext, name: string) {
    const dev = await ctx.post('/api/admin/developers', { data: { name: `Promotora ${name}`, email: `fi-${RUN}-${Math.floor(Math.random() * 1e6)}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => ctx.delete(`/api/admin/developers/${developerId}`))
    const up = await ctx.post('/api/admin/upload', { multipart: { file: { name: 'portada.png', mimeType: 'image/png', buffer: Buffer.from(buildPng(320, 200)) }, folder: 'properties' } })
    expect(up.ok(), await up.text()).toBeTruthy()
    const cover = (await up.json()).key as string
    const res = await ctx.post('/api/admin/developer-properties', {
      data: { developerId, name, coverImage: cover, price: 390000, bedrooms: 3, bathrooms: 2, area: 112, status: 'ready', transactionType: 'sale', lat: 43.5453, lng: -5.6619, orientation: 'S', description: 'Vivienda luminosa con terraza orientada al sur.', community: 'Barrio del inspector', energyRating: 'B', energyConsumption: 55, emissionsRating: 'B', emissionsValue: 10.4 },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    cleanup.push(() => ctx.delete(`/api/admin/developer-properties/${id}?hard=1`))
    const { row } = await (await ctx.get(`/api/admin/developer-properties/${id}`)).json()
    return { id, slug: row.slug as string, name }
  }

  const draft = async () => await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
  const coreOf = (d: any) => (d.blocks as any[]).find((x) => x.type === 'page-core')
  const savedContent = async () => coreOf(await draft()).content as Record<string, any>

  async function open(page: Page) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(PAGE_URL)
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.getByTestId('ficha-summary')).toBeVisible({ timeout: 20_000 })
    return canvas
  }
  const pick = async (page: Page, field: string) => {
    await page.locator(`[data-ficha-node="${field}"]`).click()
    await expect(page.getByTestId('node-inspector')).toBeVisible()
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    prop = await createProperty(a, `Inspector ${RUN}`)
    expect((await a.delete('/api/admin/site-pages/ficha-propiedad')).ok()).toBeTruthy()
  })

  test.afterAll(async () => {
    await a.delete('/api/admin/site-pages/ficha-propiedad').catch(() => null)
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
  })

  test('1 · «Galería»: sus opciones salen en «Contenido» y no las de otros bloques', async ({ page }) => {
    await open(page)
    await pick(page, 'b.gallery')
    const group = page.getByTestId('page-core-gallery')
    await expect(group).toBeVisible()
    await expect(group.getByTestId('page-core-gallery-height')).toBeVisible()
    await expect(group.getByTestId('page-core-gallery-counter')).toBeVisible()
    // Nada de las opciones de la tarjeta principal ni de «Atendido por».
    await expect(page.getByTestId('page-core-show-reference')).toHaveCount(0)
    await expect(page.getByTestId('page-core-contact-tone')).toHaveCount(0)
    // Un contenedor con opciones no enseña el aviso de «sin texto propio».
    await expect(page.getByTestId('node-no-content')).toHaveCount(0)
  })

  test('2 · «Galería»: lo cambiado se ve en el lienzo y se guarda sólo como diferencia', async ({ page }) => {
    const canvas = await open(page)
    await pick(page, 'b.gallery')
    const group = page.getByTestId('page-core-gallery')
    await group.getByTestId('page-core-gallery-gap').locator('select').selectOption('12')
    await expect.poll(async () => (await savedContent()).gallery?.gap, { timeout: 10_000 }).toBe(12)
    await expect.poll(() => canvas.getByTestId('gallery-mosaic').evaluate((e) => (e as HTMLElement).style.getPropertyValue('--gm-gap'))).toBe('12px')
    // Sólo lo que difiere de lo de partida.
    expect(Object.keys((await savedContent()).gallery)).toEqual(['gap'])
  })

  test('3 · «Descripción»: las líneas visibles cambian el recorte en el lienzo y se guardan', async ({ page }) => {
    const canvas = await open(page)
    await pick(page, 'b.description')
    await page.getByTestId('page-core-description-lines').getByRole('button', { name: '8', exact: true }).click()
    await expect.poll(async () => (await savedContent()).descriptionLines, { timeout: 10_000 }).toBe(8)
    await expect.poll(() => canvas.getByTestId('ficha-description-text').evaluate((e) => (e as HTMLElement).style.getPropertyValue('--desc-lines'))).toBe('8')
    // Volver al valor de partida no deja nada guardado.
    await page.getByTestId('page-core-description-lines').getByRole('button', { name: '4', exact: true }).click()
    await expect.poll(async () => (await savedContent()).descriptionLines, { timeout: 10_000 }).toBeUndefined()
  })

  test('4 · «Datos clave»: las columnas se ven en el lienzo y se guardan', async ({ page }) => {
    const canvas = await open(page)
    await pick(page, 'b.keyfacts')
    await expect(canvas.getByTestId('ficha-key-facts')).toHaveAttribute('data-cols', 'auto')
    await page.getByTestId('page-core-facts-columns').getByRole('button', { name: '2', exact: true }).click()
    await expect(canvas.getByTestId('ficha-key-facts')).toHaveAttribute('data-cols', '2')
    await expect.poll(async () => (await savedContent()).factsColumns, { timeout: 10_000 }).toBe(2)
    // Dos columnas de verdad: dos datos por fila.
    const cols = await canvas.getByTestId('ficha-key-facts').evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length)
    expect(cols).toBe(2)
  })

  test('5 · «Ubicación»: la altura del mapa cambia el lienzo; el zoom no se ofrece', async ({ page }) => {
    const canvas = await open(page)
    await pick(page, 's.ubicacion')
    const map = canvas.getByTestId('ficha-map')
    await map.scrollIntoViewIfNeeded()
    const before = (await map.boundingBox())!.height
    await page.getByTestId('page-core-map-height').getByRole('button', { name: 'Alta' }).click()
    await expect(map).toHaveAttribute('data-map-height', 'tall')
    // El lienzo se escala: se compara la proporción (480 px frente a 320 px), no los píxeles.
    await expect.poll(async () => (await map.boundingBox())!.height / before).toBeGreaterThan(1.3)
    await expect.poll(async () => (await savedContent()).mapHeight, { timeout: 10_000 }).toBe('tall')
    await expect(page.getByText(/El nivel de zoom no se puede cambiar/)).toBeVisible() // la nota de privacidad
    await expect(page.getByRole('slider', { name: /zoom/i })).toHaveCount(0)
  })

  test('6 · «Atendido por»: el fondo se cambia y el aviso dice qué no se toca', async ({ page }) => {
    const canvas = await open(page)
    await pick(page, 'b.contact')
    await page.getByTestId('page-core-contact-tone').getByRole('button', { name: 'Blanco' }).click()
    await expect(canvas.getByTestId('property-contact-card')).toHaveAttribute('data-tone', 'white')
    await expect.poll(async () => (await savedContent()).contactTone, { timeout: 10_000 }).toBe('white')
    await expect(page.getByTestId('contact-form-note')).toContainText('antispam')
  })

  test('7 · «Atendido por»: el título, la frase y el botón se reescriben; los campos y validaciones no son editables', async ({ page }) => {
    const canvas = await open(page)
    await pick(page, 't.contact.title')
    await expect(page.getByTestId('breadcrumb-node')).toHaveText('Título del formulario')
    const input = page.getByTestId('node-text')
    await input.fill('¿Hablamos de esta casa?')
    await expect(canvas.getByText('¿Hablamos de esta casa?')).toBeVisible()
    await expect.poll(async () => (await savedContent())['t.contact.title'], { timeout: 10_000 }).toBe('¿Hablamos de esta casa?')
    // El botón de envío también es un texto de la plantilla.
    await pick(page, 't.contact.submit')
    await page.getByTestId('node-text').fill('Quiero visitarla')
    await expect(canvas.getByTestId('property-contact-submit')).toContainText('Quiero visitarla')
    // El formulario conserva sus campos: nombre, email, mensaje, consentimiento y el campo trampa.
    const form = canvas.getByTestId('property-contact-form')
    await expect(form.locator('input[name="name"]')).toHaveCount(1)
    await expect(form.locator('input[name="email"]')).toHaveCount(1)
    await expect(form.locator('input[name="website"]')).toHaveCount(1)
    await expect(form.locator('input[type="checkbox"]')).toHaveCount(1)
  })

  test('8 · «Eficiencia energética»: sus opciones salen en el inspector y el bloque deja de ser desplegable al apagarlo', async ({ page }) => {
    const canvas = await open(page)
    await pick(page, 's.energia')
    await expect(page.getByTestId('energy-opt-collapsible')).toBeVisible()
    await expect(page.getByTestId('energy-opt-title')).toBeVisible()
    // De partida es desplegable: apagarlo quita el botón del título en el lienzo y se guarda sólo esa diferencia.
    await expect(canvas.getByTestId('energy-toggle')).toBeVisible()
    await page.getByTestId('energy-opt-collapsible').getByRole('switch').click()
    await expect(canvas.getByTestId('energy-toggle')).toHaveCount(0)
    await expect.poll(async () => (await savedContent()).energy?.collapsible, { timeout: 10_000 }).toBe(false)
    await page.getByTestId('energy-opt-collapsible').getByRole('switch').click()
    await expect(canvas.getByTestId('energy-toggle')).toBeVisible()
  })

  test('9 · una sección se oculta y se mueve desde «Avanzado», y deshacer lo devuelve', async ({ page }) => {
    const canvas = await open(page)
    await pick(page, 's.hipoteca')
    await page.getByTestId('inspector-tabs').getByRole('button', { name: 'Avanzado' }).click()
    await expect(canvas.locator('#hipoteca')).toHaveCount(1)
    await page.getByTestId('ficha-section-visible').getByRole('switch').click()
    await expect(canvas.locator('#hipoteca')).toHaveCount(0)
    await expect
      .poll(async () => ((await savedContent()).sections as any[] | undefined)?.find((s) => s.key === 'hipoteca')?.visible, { timeout: 10_000 })
      .toBe(false)
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect(canvas.locator('#hipoteca')).toHaveCount(1)
    // Subir: la posición guardada baja un puesto.
    const before = (((await savedContent()).sections as any[] | undefined) || []).map((s) => s.key)
    await page.getByTestId('ficha-section-up').click()
    await expect
      .poll(async () => ((((await savedContent()).sections as any[] | undefined) || []).map((s) => s.key)).indexOf('hipoteca'), { timeout: 10_000 })
      .toBeLessThan(before.includes('hipoteca') ? before.indexOf('hipoteca') : 99)
  })

  test('10 · un bloque que la ficha necesita no se puede ocultar ni mover', async ({ page }) => {
    await open(page)
    await pick(page, 'b.price')
    await page.getByTestId('inspector-tabs').getByRole('button', { name: 'Avanzado' }).click()
    await expect(page.getByTestId('ficha-required-note')).toBeVisible()
    await expect(page.getByTestId('ficha-section-visible')).toHaveCount(0)
    // Diseño, en cambio, sí: el aspecto del bloque se puede cambiar.
    await page.getByTestId('inspector-tabs').getByRole('button', { name: 'Diseño' }).click()
    await expect(page.getByTestId('node-background')).toBeVisible()
  })

  test('11 · el servidor sólo guarda valores de la lista cerrada', async () => {
    const d = await draft()
    const blocks = (d.blocks as any[]).map((x) => (x.type === 'page-core' ? { ...x, content: { ...x.content, descriptionLines: 99, factsColumns: 7, mapHeight: 'gigante', 't.contact.title': 'Sí', 'contact.email': 'a@example.com' } } : x))
    const res = await a.put('/api/admin/site-pages/ficha-propiedad', { data: { blocks, seo: d.seo || {} } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const c = await savedContent()
    expect(c.descriptionLines).toBeUndefined()
    expect(c.factsColumns).toBeUndefined()
    expect(c.mapHeight).toBeUndefined()
    expect(c['t.contact.title']).toBe('Sí')
    expect(c['contact.email']).toBeUndefined()
  })

  test('12 · publicada, la web enseña las opciones y el formulario sigue validando', async ({ page }) => {
    // Lo guardado en los tests 2–8 (la prueba 11 sólo dejó el título del formulario).
    const d = await draft()
    const blocks = (d.blocks as any[]).map((x) =>
      x.type === 'page-core'
        ? { ...x, content: { core: 'property-detail', descriptionLines: 8, factsColumns: 2, mapHeight: 'tall', contactTone: 'white', 't.contact.title': '¿Hablamos de esta casa?', 't.contact.submit': 'Quiero visitarla' } }
        : x,
    )
    expect((await a.put('/api/admin/site-pages/ficha-propiedad', { data: { blocks, seo: d.seo || {} } })).ok()).toBeTruthy()
    expect((await a.post('/api/admin/site-pages/ficha-propiedad/publish')).ok()).toBeTruthy()

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${prop.slug}`)
    await expect(page.getByTestId('ficha-key-facts')).toHaveAttribute('data-cols', '2')
    expect((await page.getByTestId('ficha-description-text').evaluate((e) => (e as HTMLElement).style.getPropertyValue('--desc-lines'))).trim()).toBe('8')
    const card = page.getByTestId('property-contact-card').first()
    await expect(card).toHaveAttribute('data-tone', 'white')
    await expect(card.getByText('¿Hablamos de esta casa?')).toBeVisible()
    await expect(card.getByTestId('property-contact-submit')).toContainText('Quiero visitarla')
    await expect(page.locator('#ubicacion [data-map-height="tall"]')).toHaveCount(1)
    await expect(page.locator('h1')).toHaveText(prop.name)
    // El formulario público sigue exigiendo sus campos: vacío, no envía y marca los errores.
    await card.scrollIntoViewIfNeeded()
    const requests: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/public/contact')) requests.push(r.url())
    })
    await card.getByTestId('property-contact-submit').click()
    await expect(card.locator('.pc-error').first()).toBeVisible()
    expect(requests).toEqual([])
  })

  test('13 · volver a la página original deja la ficha como estaba: sin opciones ni textos propios', async ({ page }) => {
    expect((await a.delete('/api/admin/site-pages/ficha-propiedad')).ok()).toBeTruthy()
    await page.goto(`/propiedades/${prop.slug}`)
    await expect(page.getByTestId('ficha-key-facts')).toHaveAttribute('data-cols', 'auto')
    const card = page.getByTestId('property-contact-card').first()
    await expect(card.getByText('Cuéntanos qué necesitas')).toBeVisible()
    await expect(card.getByTestId('property-contact-submit')).toContainText('Enviar mensaje')
  })
})
