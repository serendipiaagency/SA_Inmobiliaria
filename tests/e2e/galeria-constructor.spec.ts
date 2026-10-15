import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'
import { buildPng } from '../../test/unit/helpers/mediaFixtures'

/**
 * La galería en el Constructor Web (Cola 5): sólo presentación. Altura,
 * separación, esquinas, contador, «Ver todas», categorías, iconos y color se
 * ajustan en la zona de la Ficha de propiedad y la web publicada los sigue;
 * lo que la galería ENSEÑA (qué categorías, qué fotos y su clasificación) no
 * se toca desde aquí. Sin versión publicada, la ficha es la de siempre.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('Galería · Constructor', () => {
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  let slug = ''

  const coreBlock = async () => {
    const page = await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
    return { page, block: (page.blocks as any[]).find((b) => b.type === 'page-core') }
  }
  const publishGallery = async (gallery: Record<string, unknown> | null) => {
    const { page, block } = await coreBlock()
    const blocks = (page.blocks as any[]).map((b) => (b === block ? { ...b, content: { ...(b.content || {}), ...(gallery ? { gallery } : {}) } } : b))
    if (!gallery) delete blocks.find((b) => b.type === 'page-core').content.gallery
    expect((await a.put('/api/admin/site-pages/ficha-propiedad', { data: { blocks, seo: page.seo || {} } })).ok()).toBeTruthy()
    expect((await a.post('/api/admin/site-pages/ficha-propiedad/publish')).ok()).toBeTruthy()
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora gal-cfg ${RUN}`, email: `galcfg-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
    const up = async (n: string) => (await (await a.post('/api/admin/upload', { multipart: { file: { name: n, mimeType: 'image/png', buffer: Buffer.from(buildPng(160, 100)) }, folder: 'properties' } })).json()).key as string
    const res = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Galería Constructor ${RUN}`, price: 200000, bedrooms: 2, bathrooms: 1, area: 80, status: 'new', coverImage: await up('portada.png'), videoUrl: 'https://youtu.be/dQw4w9WgXcQ' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id
    slug = (await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row.slug
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    for (let i = 1; i <= 5; i++) await a.post('/api/admin/project-images', { data: { developerPropertyId: id, image: await up(`f${i}.png`), sortOrder: i, room: i < 3 ? 'living' : 'kitchen' } })
  })

  test.afterAll(async () => {
    await a.delete('/api/admin/site-pages/ficha-propiedad').catch(() => null)
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), anon?.dispose()])
  })

  test('80–86 · la web publicada sigue las opciones: separación, esquinas, color, sin contador, sin «Ver todas», categorías ocultas; el visor conserva las suyas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    // De partida (sin versión publicada): contador, «Ver todas» y categorías como siempre.
    await page.goto(`/propiedades/${slug}`)
    await expect(page.getByTestId('gallery-counter')).toBeVisible()
    await expect(page.getByTestId('gallery-see-all')).toBeVisible()
    await expect(page.getByTestId('gallery-categories')).toBeVisible()
    const defaults = await page.getByTestId('gallery-mosaic').evaluate((e) => ({ gap: e.style.getPropertyValue('--gm-gap'), radius: e.style.getPropertyValue('--gm-radius') }))
    expect(defaults).toEqual({ gap: '4px', radius: '14px' })

    await publishGallery({ height: 'tall', gap: 12, radius: 24, showCounter: false, showAllButton: false, categories: 'hidden', accent: '#1f4a3f', iconStyle: 'solid' })
    await page.goto(`/propiedades/${slug}`)
    const vars = await page.getByTestId('gallery-mosaic').evaluate((e) => ({ gap: e.style.getPropertyValue('--gm-gap'), radius: e.style.getPropertyValue('--gm-radius'), accent: e.style.getPropertyValue('--gm-accent') }))
    expect(vars).toEqual({ gap: '12px', radius: '24px', accent: '#1f4a3f' })
    await expect(page.getByTestId('gallery-counter')).toHaveCount(0)
    await expect(page.getByTestId('gallery-see-all')).toHaveCount(0)
    await expect(page.getByTestId('gallery-categories')).toHaveCount(0)
    // La altura «Alta» hace el mosaico más alto que el normal (a igual ancho).
    const tall = (await page.getByTestId('gallery-mosaic').locator('.gm').boundingBox())!.height
    await publishGallery({ height: 'compact' })
    await page.goto(`/propiedades/${slug}`)
    const compact = (await page.getByTestId('gallery-mosaic').locator('.gm').boundingBox())!.height
    expect(tall).toBeGreaterThan(compact * 1.2)
    // Presentación, no contenido: la clasificación y las categorías siguen siendo las de la propiedad (el visor, con todas sus categorías y estancias).
    await page.getByTestId('gallery-main').click()
    const viewer = page.getByTestId('gallery-viewer')
    await expect(viewer.getByTestId('gallery-viewer-tabs').locator('[role="tab"]')).toHaveCount(2) // fotos y vídeo
    await expect(viewer.getByTestId('gallery-viewer-rooms').locator('[data-gallery-room]')).toHaveCount(3) // todas, salón, cocina
    await page.keyboard.press('Escape')
  })

  test('87–90 · el servidor sólo guarda opciones de presentación (valida y descarta lo demás) y quitar la versión publicada devuelve la ficha de siempre', async ({ page }) => {
    const { page: draft, block } = await coreBlock()
    const dirty = { height: 'gigante', gap: 7, radius: 99, categories: 'tarjetas', rooms: ['living'], kinds: ['video'], hideEmpty: 1 }
    const blocks = (draft.blocks as any[]).map((b) => (b === block ? { ...b, content: { ...(b.content || {}), gallery: dirty } } : b))
    expect((await a.put('/api/admin/site-pages/ficha-propiedad', { data: { blocks, seo: draft.seo || {} } })).ok()).toBeTruthy()
    const saved = (await coreBlock()).block.content.gallery
    // Lo inválido no se guarda (se queda en los valores de partida); nada de clasificación.
    for (const k of ['rooms', 'kinds', 'hideEmpty']) expect(saved ?? {}, k).not.toHaveProperty(k)
    expect(saved ?? {}).not.toHaveProperty('height')
    expect(saved ?? {}).not.toHaveProperty('gap')
    await a.delete('/api/admin/site-pages/ficha-propiedad')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${slug}`)
    const vars = await page.getByTestId('gallery-mosaic').evaluate((e) => ({ gap: e.style.getPropertyValue('--gm-gap'), radius: e.style.getPropertyValue('--gm-radius') }))
    expect(vars).toEqual({ gap: '4px', radius: '14px' })
  })

  test('91–95 · el inspector de la zona de la ficha tiene el grupo «Galería» y lo que se cambia se guarda en el borrador y se ve en el lienzo', async ({ page }) => {
    await a.delete('/api/admin/site-pages/ficha-propiedad')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/site-builder?pagina=ficha-propiedad')
    // El lienzo enseña la ficha real; el bloque de la ficha se elige en «Estructura» (sus opciones de zona).
    const canvas = page.frameLocator('iframe[title="Vista previa del Constructor Web"]')
    await expect(canvas.getByTestId('ficha-gallery-wrap')).toBeVisible({ timeout: 20_000 })
    await page.locator('[data-block-row]').filter({ hasText: 'Ficha de propiedad' }).first().click()
    const core = page.getByTestId('page-core-inspector')
    await expect(core).toBeVisible({ timeout: 20_000 })
    const group = page.getByTestId('page-core-gallery')
    await expect(group).toBeVisible()
    await group.getByTestId('page-core-gallery-gap').locator('select').selectOption('12')
    await group.getByTestId('page-core-gallery-counter').getByRole('switch').click()
    await group.getByTestId('page-core-gallery-categories').getByRole('button', { name: 'Ocultas' }).click()
    await expect
      .poll(async () => {
        const g = (await coreBlock()).block.content.gallery || {}
        return [g.gap, g.showCounter, g.categories].join('|')
      }, { timeout: 10_000 })
      .toBe('12|false|hidden')
    // El lienzo lo enseña con los datos reales de la propiedad de ejemplo (sin contador).
    await expect(canvas.getByTestId('ficha-gallery-wrap').getByTestId('gallery-counter')).toHaveCount(0)
  })
})
