import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'
import { buildPng } from '../../test/unit/helpers/mediaFixtures'

/**
 * Bloque «Eficiencia energética» del Constructor: desplegable (con las clases
 * a la vista al plegarlo), imágenes subidas desde el inspector que salen en
 * la web, y la letra sin su cifra dicha como «Valor no indicado» (nada
 * inventado). Con una propiedad completa y otra con la letra de emisiones
 * pero sin su valor — el caso de la captura del propietario.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('Eficiencia energética: desplegable, imágenes y valores', () => {
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  let full: { id: number; slug: string }
  let partial: { id: number; slug: string }
  let developerId = 0

  async function createProperty(developerId: number, name: string, energy: Record<string, any>) {
    const res = await a.post('/api/admin/developer-properties', { data: { developerId, name, price: 280000, bedrooms: 2, bathrooms: 1, area: 80, status: 'ready', transactionType: 'sale', ...(energy.energyRating ? { energyRating: energy.energyRating } : {}) } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    if (Object.keys(energy).length) {
      const put = await a.put(`/api/admin/developer-properties/${id}`, { data: energy })
      expect(put.ok(), await put.text()).toBeTruthy()
    }
    const { row } = await (await a.get(`/api/admin/developer-properties/${id}`)).json()
    return { id, slug: row.slug as string }
  }

  /** Publica la ficha con un bloque de eficiencia energética con estas opciones (y la zona dinámica de siempre). */
  async function publishEnergyBlock(content: Record<string, unknown>) {
    const draft = await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
    const blocks = (draft.blocks as any[]).filter((b) => b.type !== 'energy-efficiency')
    blocks.push({ id: 'energia-e2e', type: 'energy-efficiency', version: 1, content })
    const put = await a.put('/api/admin/site-pages/ficha-propiedad', { data: { blocks, seo: draft.seo || {} } })
    expect(put.ok(), await put.text()).toBeTruthy()
    const pub = await a.post('/api/admin/site-pages/ficha-propiedad/publish')
    expect(pub.ok(), await pub.text()).toBeTruthy()
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })

    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora energía ${RUN}`, email: `en-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))

    full = await createProperty(developerId, `Energía completa ${RUN}`, { energyRating: 'B', energyConsumption: 55, emissionsRating: 'B', emissionsValue: 10.4 })
    // Como en la captura: letra de emisiones sin su cifra.
    partial = await createProperty(developerId, `Energía parcial ${RUN}`, { energyRating: 'A', energyConsumption: 30, emissionsRating: 'A' })
  })

  test.afterAll(async () => {
    await a.delete('/api/admin/site-pages/ficha-propiedad').catch(() => null)
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
  })

  test('la letra sin su cifra se dice («Valor no indicado»); con la cifra, sale la cifra', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${partial.slug}`)
    const card = page.getByTestId('ficha-energy').getByTestId('energy-card')
    await card.scrollIntoViewIfNeeded()
    await expect(card.getByTestId('energy-consumption')).toContainText('30')
    await expect(card.getByTestId('energy-consumption')).not.toContainText('Valor no indicado')
    await expect(card.getByTestId('energy-emissions')).toContainText('A')
    await expect(card.getByTestId('energy-emissions')).toContainText('Valor no indicado')
    // El «0» o cualquier cifra no se inventa: la celda de emisiones no lleva dígitos.
    await expect(card.getByTestId('energy-emissions')).not.toContainText(/\d/)

    await page.goto(`/propiedades/${full.slug}`)
    const card2 = page.getByTestId('ficha-energy').getByTestId('energy-card')
    await expect(card2.getByTestId('energy-emissions')).toContainText('10,4')
    await expect(card2.getByTestId('energy-no-value')).toHaveCount(0)
  })

  test('móvil: la tabla cabe en 320 px, con «Sin dato» en vez de un texto que se corta, y sin desbordes', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto(`/propiedades/${partial.slug}`)
    const card = page.getByTestId('ficha-energy').getByTestId('energy-card')
    await card.scrollIntoViewIfNeeded()
    const tag = card.getByTestId('energy-emissions')
    await expect(tag).toBeVisible()
    await expect(tag.locator('.ec-nodata-short')).toBeVisible()
    await expect(tag.locator('.ec-nodata-long')).toBeHidden()
    const [c, t] = await Promise.all([card.boundingBox(), tag.boundingBox()])
    expect(t!.x + t!.width, 'la etiqueta cabe dentro de la tarjeta').toBeLessThanOrEqual(c!.x + c!.width + 0.5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('desplegable: de partida llega abierto; el título lo pliega y al plegar se siguen viendo las clases', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${full.slug}`)
    const card = page.getByTestId('ficha-energy').getByTestId('energy-card')
    await card.scrollIntoViewIfNeeded()
    const toggle = card.getByTestId('energy-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveText('Eficiencia energética')
    await expect(card.getByTestId('energy-table')).toBeVisible()
    await expect(card.getByTestId('energy-glance')).toHaveCount(0)
    // El botón controla el cuerpo y el cuerpo es el que se pliega.
    const bodyId = await toggle.getAttribute('aria-controls')
    expect(bodyId).toBeTruthy()
    await expect(page.locator(`#${bodyId}`)).toHaveAttribute('data-testid', 'energy-body')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(card.getByTestId('energy-table')).toBeHidden()
    // Plegado: las clases de la vivienda (consumo y emisiones) a la vista.
    await expect(card.getByTestId('energy-glance')).toContainText('Consumo')
    await expect(card.getByTestId('energy-glance')).toContainText('Emisiones')
    // Con el teclado: Enter lo despliega de nuevo.
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(card.getByTestId('energy-table')).toBeVisible()
    await expect(card.getByTestId('energy-glance')).toHaveCount(0)
  })

  test('Constructor: «Bloque desplegable» y «Llega desplegado» cambian lo que ve el visitante', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    // Sin «desplegable»: título fijo, sin botón.
    await publishEnergyBlock({ collapsible: false })
    await page.goto(`/propiedades/${full.slug}`)
    const block = page.getByTestId('energy-block')
    await expect(block.getByTestId('energy-card')).toBeVisible()
    await expect(block.getByTestId('energy-toggle')).toHaveCount(0)
    await expect(block.getByTestId('energy-table')).toBeVisible()

    // Desplegable pero cerrado de partida: se ve el título y las clases; la tabla, al pulsar.
    await publishEnergyBlock({ startOpen: false })
    await page.goto(`/propiedades/${full.slug}`)
    const closed = page.getByTestId('energy-block')
    await expect(closed.getByTestId('energy-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(closed.getByTestId('energy-table')).toBeHidden()
    await expect(closed.getByTestId('energy-glance')).toContainText('B')
    await closed.getByTestId('energy-toggle').click()
    await expect(closed.getByTestId('energy-table')).toBeVisible()
  })

  test('Constructor: subir una imagen en el inspector, describirla y verla publicada en la ficha', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    // Un bloque de partida y su borrador limpio.
    await publishEnergyBlock({})
    await page.goto('/admin/site-builder?pagina=ficha-propiedad')
    const canvas = page.frameLocator('iframe[title="Vista previa del Constructor Web"]')
    await expect(canvas.getByTestId('page-core-preview')).toBeVisible({ timeout: 15_000 })
    await canvas.locator('[data-testid="energy-block"], [data-testid="energy-block-empty"]').first().click()
    await expect(page.getByTestId('energy-block-inspector')).toBeVisible()
    await expect(page.getByTestId('energy-opt-collapsible')).toBeVisible()

    // Subir una imagen: aparece en la lista, con su texto alternativo y su pie.
    await page.getByTestId('image-list-file').setInputFiles({ name: 'etiqueta.png', mimeType: 'image/png', buffer: Buffer.from(buildPng(240, 160)) })
    const item = page.getByTestId('image-list-item')
    await expect(item).toHaveCount(1, { timeout: 15_000 })
    await page.getByTestId('image-list-alt-0').fill('Escala oficial de la etiqueta energética')
    await page.getByTestId('image-list-caption-0').fill('Fuente: IDAE')
    await page.getByTestId('energy-opt-images-position').getByRole('button', { name: 'Al lado' }).click()

    // El borrador lo guarda (sólo presentación: la imagen, su texto y la posición).
    await expect
      .poll(
        async () => {
          const draft = await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
          const blk = (draft.blocks as any[]).find((b) => b.type === 'energy-efficiency')
          return `${blk?.content?.images?.length}|${blk?.content?.images?.[0]?.alt}|${blk?.content?.images?.[0]?.caption}|${blk?.content?.imagesPosition}`
        },
        { timeout: 15_000 },
      )
      .toBe('1|Escala oficial de la etiqueta energética|Fuente: IDAE|side')
    const saved = await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
    const content = (saved.blocks as any[]).find((b) => b.type === 'energy-efficiency').content
    expect(content).not.toHaveProperty('consumption')
    expect(content).not.toHaveProperty('rating')

    await page.getByRole('button', { name: 'Publicar cambios' }).click()
    await expect(page.getByTestId('site-page-status-ficha-propiedad')).toHaveText('Publicada')

    // En la web: la imagen carga (de verdad, no un hueco), con su texto alternativo y su pie.
    const web = await page.context().newPage()
    await web.goto(`/propiedades/${full.slug}`)
    const images = web.getByTestId('energy-block').getByTestId('energy-images')
    await expect(images).toBeVisible()
    const img = images.locator('img')
    await expect(img).toHaveAttribute('alt', 'Escala oficial de la etiqueta energética')
    await expect(images).toContainText('Fuente: IDAE')
    // La imagen carga en diferido: hay que acercarla a la pantalla antes de esperar a que se pinte.
    await img.scrollIntoViewIfNeeded()
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : 0))).toBeGreaterThan(0)
    // Una propiedad sin datos energéticos sigue sin tarjeta, aunque el bloque tenga imágenes.
    const bare = await createProperty(developerId, `Energía sin datos ${RUN}`, {})
    await web.goto(`/propiedades/${bare.slug}`)
    await expect(web.locator('h1')).toBeVisible()
    await expect(web.getByTestId('energy-block')).toHaveCount(0)
    await web.close()

    // Quitar la imagen la quita del borrador.
    await page.getByTestId('image-list-remove-0').click()
    await expect(page.getByTestId('image-list-item')).toHaveCount(0)
    await expect
      .poll(async () => {
        const draft = await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
        const blk = (draft.blocks as any[]).find((b) => b.type === 'energy-efficiency')
        return blk?.content?.images?.length ?? 0
      })
      .toBe(0)
  })

  test('el servidor no acepta imágenes con esquemas peligrosos ni más de seis', async () => {
    const draft = await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
    const blocks = (draft.blocks as any[]).filter((b) => b.type !== 'energy-efficiency')
    const images = [
      { src: 'javascript:alert(1)', alt: 'x' },
      { src: 'data:image/svg+xml;base64,AAAA', alt: 'x' },
      ...Array.from({ length: 9 }, (_, i) => ({ src: `site-builder/e2e-${i}.png`, alt: `n${i}` })),
    ]
    blocks.push({ id: 'energia-san', type: 'energy-efficiency', version: 1, content: { images } })
    const put = await a.put('/api/admin/site-pages/ficha-propiedad', { data: { blocks, seo: draft.seo || {} } })
    expect(put.ok(), await put.text()).toBeTruthy()
    const saved = await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
    const imgs = (saved.blocks as any[]).find((b) => b.id === 'energia-san').content.images as Array<{ src: string }>
    expect(imgs).toHaveLength(6)
    expect(imgs.every((i) => i.src.startsWith('site-builder/'))).toBe(true)
  })
})
