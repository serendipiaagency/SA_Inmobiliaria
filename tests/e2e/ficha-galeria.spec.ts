import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'
import { buildPng } from '../../test/unit/helpers/mediaFixtures'

/**
 * Galería multimedia de la ficha pública (Cola 5): mosaico a ancho completo
 * con la portada grande y «Ver todas las fotos (n)», fila de categorías con
 * sólo lo que hay (fotos, vídeos, planos, 360°, tour, renders) y estancias,
 * visor inmersivo (cabecera, categorías sin recargar, filtros por estancia,
 * vídeo con consentimiento, planos con zoom y descarga, 360°, tour de
 * Matterport/Kuula incrustados y proveedores no reconocidos como enlace), posición de
 * lectura, teclado, Atrás, móvil y tableta, compatibilidad con lo existente
 * y aislamiento entre agencias. Todo contra la API y la web reales.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const EMPTY_STATE = { cookies: [], origins: [] }

test.describe('Galería multimedia de la ficha', () => {
  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  const p: Record<string, { id: number; slug: string }> = {}
  const keys: Record<string, string> = {}
  let foreignSlug = ''

  async function upload(name: string, folder = 'properties', ctx = a) {
    const res = await ctx.post('/api/admin/upload', { multipart: { file: { name, mimeType: 'image/png', buffer: Buffer.from(buildPng(160, 100)) }, folder } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).key as string
  }
  async function createProperty(ctx: APIRequestContext, developerId: number, name: string, extra: Record<string, any>) {
    const res = await ctx.post('/api/admin/developer-properties', { data: { developerId, name, price: 250000, bedrooms: 2, bathrooms: 1, area: 80, status: 'new', ...extra } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    const { row } = await (await ctx.get(`/api/admin/developer-properties/${id}`)).json()
    cleanup.push(() => ctx.delete(`/api/admin/developer-properties/${id}?hard=1`))
    return { id, slug: row.slug as string }
  }
  async function photo(id: number, key: string, extra: Record<string, any> = {}) {
    const res = await a.post('/api/admin/project-images', { data: { developerPropertyId: id, image: key, ...extra } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).id as number
  }
  async function media(id: number, data: Record<string, any>) {
    const res = await a.post('/api/admin/property-media', { data: { propertyKind: 'developer', propertyId: id, ...data } })
    expect(res.ok(), await res.text()).toBeTruthy()
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora galería ${RUN}`, email: `gal-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))

    // La completa: portada y siete fotos (cuatro estancias y dos sin clasificar), una oculta, una privada, vídeo, 360, dos tours, dos planos y un render.
    p.rich = await createProperty(a, developerId, `Galería completa ${RUN}`, { coverImage: await upload('portada.png'), propertyType: 'Apartment' })
    const rooms: [string, string | null][] = [['salon-1', 'living'], ['salon-2', 'living'], ['cocina', 'kitchen'], ['dorm-1', 'bedroom'], ['dorm-2', 'bedroom'], ['sin-1', null], ['sin-2', null]]
    let order = 1
    for (const [n, room] of rooms) {
      keys[n] = await upload(`${n}.png`)
      await photo(p.rich.id, keys[n]!, { sortOrder: order++, ...(room ? { room } : {}), title: n === 'cocina' ? 'Cocina abierta' : undefined, description: n === 'cocina' ? 'Cocina abierta al salón con isla' : undefined })
    }
    await photo(p.rich.id, await upload('oculta.png'), { sortOrder: 20, room: 'bathroom', isHidden: 1 })
    await photo(p.rich.id, await upload('privada.png'), { sortOrder: 21, room: 'bathroom', isPrivate: 1 })
    await photo(p.rich.id, await upload('no-publicable.png'), { sortOrder: 22, room: 'bathroom', isPublishable: 0 })
    await media(p.rich.id, { mediaType: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Recorrido' })
    await media(p.rich.id, { mediaType: 'pano360', r2Key: await upload('pano.png', 'property-media'), title: 'Salón 360' })
    await media(p.rich.id, { mediaType: 'virtual_tour', url: 'https://my.matterport.com/show/?m=AbCdEfGh123', title: 'Tour Matterport', sortOrder: 1 })
    await media(p.rich.id, { mediaType: 'virtual_tour', url: 'https://kuula.co/share/abc123', title: 'Tour Kuula', sortOrder: 2 })
    await media(p.rich.id, { mediaType: 'virtual_tour', url: 'https://example-tour.com/v/xyz', title: 'Tour externo', sortOrder: 3 })
    await media(p.rich.id, { mediaType: 'render', r2Key: await upload('render.png', 'property-media'), title: 'Render fachada' })
    for (const [i, t] of ['Planta baja', 'Planta alta'].entries()) {
      const r = await a.post('/api/admin/floor-plans', { data: { developerPropertyId: p.rich.id, title: t, image: await upload(`plano-${i}.png`, 'floor-plans'), sortOrder: i } })
      expect(r.ok(), await r.text()).toBeTruthy()
    }
    // Una con miniatura propia en la primera foto de la galería (la que sigue a la portada).
    keys.thumb = await upload('miniatura.png')
    keys.thumbOriginal = await upload('con-miniatura.png')
    await photo(p.rich.id, keys.thumbOriginal!, { sortOrder: 0, thumbKey: keys.thumb })

    // La existente sin clasificar: portada y tres fotos, sin estancias, sin miniaturas (como todo lo anterior a la galería por categorías).
    p.legacy = await createProperty(a, developerId, `Galería existente ${RUN}`, { coverImage: await upload('legacy-portada.png') })
    for (let i = 1; i <= 3; i++) {
      keys[`legacy${i}`] = await upload(`legacy-${i}.png`)
      await photo(p.legacy.id, keys[`legacy${i}`]!, { sortOrder: i })
    }
    // La sencilla: una foto.
    p.plain = await createProperty(a, developerId, `Galería sencilla ${RUN}`, { coverImage: await upload('sencilla.png') })

    const devB = await b.post('/api/admin/developers', { data: { name: `Ajena galería ${RUN}`, email: `ajena-gal-${RUN}@mm.test`, status: 'active' } })
    expect(devB.ok(), await devB.text()).toBeTruthy()
    const devBId = (await devB.json()).id
    cleanup.push(() => b.delete(`/api/admin/developers/${devBId}`))
    const foreign = await createProperty(b, devBId, `Ajena galería ${RUN}`, { coverImage: await upload('ajena.png', 'properties', b) })
    foreignSlug = foreign.slug
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose(), anon?.dispose()])
  })

  const open = async (page: Page, slug = p.rich!.slug) => {
    await page.goto(`/propiedades/${slug}`)
    await expect(page.getByTestId('gallery-mosaic')).toBeVisible()
  }

  test('1–6 · mosaico a ancho completo: portada grande, secundarias, contador y «Ver todas las fotos (n)» con el total real; lo oculto, privado o no publicable no cuenta', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    // Portada + miniatura propia + 7 de la galería = 9 públicas (las tres no publicables se descartan).
    await expect(page.getByTestId('gallery-counter')).toHaveText('1 / 9')
    await expect(page.getByTestId('gallery-see-all')).toContainText('(9)')
    await expect(page.getByTestId('gallery-status')).toHaveText(/obra nueva/i)
    // Ancho completo del contenedor y encima de las dos columnas.
    const wrap = await page.getByTestId('ficha-gallery-wrap').boundingBox()
    const main = await page.getByTestId('ficha-main').boundingBox()
    const aside = await page.getByTestId('ficha-aside').boundingBox()
    expect(wrap!.width).toBeGreaterThan(main!.width + aside!.width - 2)
    expect(wrap!.y + wrap!.height).toBeLessThanOrEqual(Math.min(main!.y, aside!.y) + 1)
    // Portada grande a la izquierda y cuatro secundarias a la derecha, sin huecos ni cinco iguales.
    await expect(page.getByTestId('gallery-cell')).toHaveCount(4)
    const cover = await page.getByTestId('gallery-main').boundingBox()
    const cells = await page.getByTestId('gallery-cell').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
    expect(cover!.width).toBeGreaterThan(cells[0].width * 1.6)
    expect(cover!.height).toBeGreaterThan(cells[0].height * 1.6)
    for (const c of cells) expect(c.x).toBeGreaterThan(cover!.x + cover!.width - 2)
    // La portada va a su tamaño; las secundarias, con la miniatura de la foto si la tiene (la de la galería con thumbKey).
    const mainSrc = await page.getByTestId('gallery-main').locator('img').getAttribute('src')
    expect(mainSrc).toContain(`/api/media/${await coverKey()}`)
    // Sin desbordes y sin imágenes deformadas (object-fit cover en todas).
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    const fits = await page.getByTestId('gallery-mosaic').locator('img').evaluateAll((els) => els.map((e) => getComputedStyle(e).objectFit))
    expect(new Set(fits)).toEqual(new Set(['cover']))
  })

  async function coverKey() {
    const row = await (await anon.get(`/api/public/properties/${p.rich!.slug}`)).json()
    return row.project.coverImage as string
  }

  test('7–10 · categorías: sólo las que tienen contenido real, en su orden, con su número; las vacías no existen; y las estancias con fotos', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    const cats = page.getByTestId('gallery-categories')
    await expect(cats).toBeVisible()
    const keysShown = await cats.locator('[data-gallery-category]:not([data-gallery-room])').evaluateAll((els) => els.map((e) => e.getAttribute('data-gallery-category')))
    expect(keysShown).toEqual(['photos', 'videos', 'plans', 'pano360', 'tour', 'renders'])
    for (const none of ['drone', 'night', 'compare', 'staging', 'social']) await expect(cats.locator(`[data-gallery-category="${none}"]:not([data-gallery-room])`)).toHaveCount(0)
    await expect(cats.locator('[data-gallery-category="photos"]:not([data-gallery-room]) .gm-cat-n')).toHaveText('9')
    await expect(cats.locator('[data-gallery-category="plans"] .gm-cat-n')).toHaveText('2')
    await expect(cats.locator('[data-gallery-category="tour"] .gm-cat-n')).toHaveText('3')
    // Estancias: sólo las que tienen fotos (salón, cocina, dormitorios), con su número; el baño (todas ocultas/privadas) no existe.
    const rooms = await cats.locator('[data-gallery-room]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-gallery-room'), e.querySelector('.gm-cat-n')?.textContent]))
    expect(rooms).toEqual([['living', '2'], ['kitchen', '1'], ['bedroom', '2']])
    // Cada etiqueta lleva icono SVG propio (mismo grosor) y texto, sin emojis.
    const strokes = await cats.locator('.gm-cat-ic svg').evaluateAll((els) => els.map((e) => e.getAttribute('stroke-width')))
    expect(new Set(strokes)).toEqual(new Set(['1.7']))
    const labels = await cats.locator('.gm-cat-label').allTextContents()
    expect(labels.join(' ')).not.toMatch(/\p{Extended_Pictographic}/u)
    // Una propiedad sin más que fotos: sin fila de categorías (no hay nada que distinguir).
    await open(page, p.legacy!.slug)
    await expect(page.getByTestId('gallery-categories')).toHaveCount(0)
  })

  test('11–16 · visor inmersivo: toda la ventana, cabecera con volver, categorías con miniatura e icono, contador y cerrar; sin recargar al cambiar de categoría', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    await page.evaluate(() => ((window as any).__sin_recarga = 42))
    await page.getByTestId('gallery-see-all').click()
    const viewer = page.getByTestId('gallery-viewer')
    await expect(viewer).toBeVisible()
    await expect(viewer).toHaveAttribute('role', 'dialog')
    await expect(viewer).toHaveAttribute('aria-modal', 'true')
    const box = await viewer.boundingBox()
    expect(box).toMatchObject({ x: 0, y: 0, width: 1440, height: 900 })
    // La página de debajo no se desplaza mientras está abierto.
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')
    // Cabecera: volver, categorías (con miniatura, icono, etiqueta y número), contador y cerrar.
    await expect(viewer.getByTestId('gallery-viewer-back')).toContainText('Volver a la propiedad')
    const tabs = viewer.getByTestId('gallery-viewer-tabs').locator('[role="tab"]')
    await expect(tabs).toHaveCount(6)
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
    await expect(tabs.first().locator('.gv-tab-ic svg')).toHaveCount(1)
    await expect(tabs.first().locator('.gv-tab-label')).toHaveText('Todas las fotos')
    await expect(tabs.first().locator('.gv-tab-n')).toHaveText('9')
    await expect(viewer.getByTestId('gallery-viewer-counter')).toHaveText('9')
    // Fotos grandes en cuadrícula.
    await expect(viewer.locator('[data-testid="gallery-viewer-grid"] .gv-card')).toHaveCount(9)
    // Cambiar de categoría: actualiza elementos, contador y activa, sin recargar la página.
    await viewer.locator('[data-gallery-category="plans"][role="tab"]').click()
    await expect(viewer.locator('[data-gallery-category="plans"][role="tab"]')).toHaveAttribute('aria-selected', 'true')
    await expect(viewer.locator('[data-testid="gallery-viewer-grid"] .gv-card')).toHaveCount(2)
    await expect(viewer.getByTestId('gallery-viewer-counter')).toHaveText('2')
    await expect(viewer.getByTestId('gallery-viewer-rooms')).toHaveCount(0)
    await viewer.locator('[data-gallery-category="renders"][role="tab"]').click()
    await expect(viewer.locator('[data-testid="gallery-viewer-grid"] .gv-card, [data-testid="gallery-viewer-image"]')).toHaveCount(1)
    expect(await page.evaluate(() => (window as any).__sin_recarga)).toBe(42)
    // Cerrar: vuelve a la ficha donde estaba y libera el scroll.
    await viewer.getByTestId('gallery-viewer-close').click()
    await expect(viewer).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')
  })

  test('17–20 · fotos: modo elemento con pie (título y descripción), flechas, miniaturas, teclado, Escape y «Atrás»; la posición de lectura se conserva', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    await page.evaluate(() => window.scrollTo(0, 420))
    const y = await page.evaluate(() => window.scrollY)
    // Clic en una foto del mosaico: el visor se abre en ESA foto.
    await page.getByTestId('gallery-cell').nth(1).click()
    const viewer = page.getByTestId('gallery-viewer')
    await expect(viewer.getByTestId('gallery-viewer-image')).toBeVisible()
    await expect(viewer.getByTestId('gallery-viewer-counter')).toHaveText('3 / 9')
    await page.keyboard.press('ArrowRight')
    await expect(viewer.getByTestId('gallery-viewer-counter')).toHaveText('4 / 9')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(viewer.getByTestId('gallery-viewer-counter')).toHaveText('2 / 9')
    await viewer.getByTestId('gallery-viewer-next').click()
    await viewer.getByTestId('gallery-viewer-thumbs').locator('button').nth(5).click()
    await expect(viewer.getByTestId('gallery-viewer-counter')).toHaveText('6 / 9')
    // «Volver» desde un elemento va a la cuadrícula de la categoría (no cierra).
    await viewer.getByTestId('gallery-viewer-back').click()
    await expect(viewer.getByTestId('gallery-viewer-grid')).toBeVisible()
    // La foto con título y descripción los enseña en el visor.
    await viewer.locator('[data-testid="gallery-viewer-grid"] .gv-card[aria-label="Cocina abierta"]').click()
    await expect(viewer.getByTestId('gallery-viewer-caption')).toContainText('Cocina abierta')
    await expect(viewer.getByTestId('gallery-viewer-caption')).toContainText('Cocina abierta al salón con isla')
    // Escape cierra y la ficha sigue donde estaba.
    await page.keyboard.press('Escape')
    await expect(viewer).toHaveCount(0)
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThan(4)
    // «Atrás» del navegador también cierra el visor (no sale de la ficha).
    await page.getByTestId('gallery-main').click()
    await expect(viewer).toBeVisible()
    await page.goBack()
    await expect(viewer).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/propiedades/${p.rich!.slug}`))
  })

  test('21–24 · estancias: el filtro del visor sólo ofrece las que tienen fotos; una estancia del mosaico abre el visor ya filtrado; «Todas» lo deshace', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    await page.getByTestId('gallery-categories').locator('[data-gallery-room="bedroom"]').click()
    const viewer = page.getByTestId('gallery-viewer')
    const rooms = viewer.getByTestId('gallery-viewer-rooms')
    await expect(rooms).toBeVisible()
    // Sólo salón, cocina y dormitorios (con su número) más «Todas».
    expect(await rooms.locator('[data-gallery-room]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gallery-room')))).toEqual(['', 'living', 'kitchen', 'bedroom'])
    await expect(rooms.locator('[data-gallery-room="bedroom"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(viewer.locator('[data-testid="gallery-viewer-grid"] .gv-card')).toHaveCount(2)
    await rooms.locator('[data-gallery-room="kitchen"]').click()
    await expect(viewer.locator('[data-testid="gallery-viewer-grid"] .gv-card')).toHaveCount(1)
    await rooms.locator('[data-gallery-room=""]').click()
    await expect(viewer.locator('[data-testid="gallery-viewer-grid"] .gv-card')).toHaveCount(9)
    // Las fotos sin estancia siguen en «Todas las fotos».
    await expect(rooms.locator('[data-gallery-room=""] .gv-room-n')).toHaveText('9')
  })

  test('25–28 · vídeo: miniatura con reproductor; el de un tercero espera al consentimiento y luego se incrusta sin cookies', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: EMPTY_STATE, viewport: { width: 1440, height: 900 } })
    await ctx.route(/youtube(-nocookie)?\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }))
    const page = await ctx.newPage()
    await page.goto(`/propiedades/${p.rich!.slug}`)
    await page.getByTestId('cookie-reject').click()
    await page.getByTestId('gallery-categories').locator('[data-gallery-category="videos"]').click()
    const viewer = page.getByTestId('gallery-viewer')
    // Un solo vídeo: se abre directamente (con su reproductor), sin iframe hasta el consentimiento.
    const gate = viewer.getByTestId('consent-gate')
    await expect(gate).toContainText('YouTube')
    await expect(page.locator('iframe[src*="youtube"]')).toHaveCount(0)
    await gate.getByTestId('consent-gate-allow').click()
    await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toHaveCount(1)
    await ctx.close()
  })

  test('29–32 · planos: categoría propia (no mezclada con estancias), visor con zoom y descarga; el zoom se cierra sin cerrar la galería', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    await page.getByTestId('gallery-categories').locator('[data-gallery-category="plans"]').click()
    const viewer = page.getByTestId('gallery-viewer')
    await expect(viewer.locator('[data-testid="gallery-viewer-grid"] .gv-card')).toHaveCount(2)
    await expect(viewer.locator('[data-testid="gallery-viewer-grid"] .gv-card').first()).toHaveAttribute('aria-label', 'Planta baja')
    await viewer.locator('[data-testid="gallery-viewer-grid"] .gv-card').first().click()
    const plan = viewer.getByTestId('gallery-viewer-plan')
    await expect(plan).toBeVisible()
    // Sin recortes: el plano se ve entero (object-fit contain).
    expect(await plan.locator('img').evaluate((e) => getComputedStyle(e).objectFit)).toBe('contain')
    // Descarga: el propio fichero público del plano.
    expect(await plan.getByTestId('gallery-viewer-plan-download').getAttribute('href')).toMatch(/^\/api\/media\//)
    await plan.getByTestId('gallery-viewer-plan-zoom').click()
    await expect(page.getByTestId('floor-plan-viewer')).toBeVisible()
    await page.getByTestId('floor-plan-zoom-in').click()
    await expect(page.getByTestId('floor-plan-zoom-level')).not.toHaveText('100 %')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('floor-plan-viewer')).toHaveCount(0)
    await expect(viewer).toBeVisible()
    // Pasa al otro plano con la flecha.
    await viewer.getByTestId('gallery-viewer-next').click()
    await expect(viewer.getByTestId('gallery-viewer-counter')).toHaveText('2 / 2')
  })

  test('33–37 · 360° y tour: la 360 en su visor; Matterport y Kuula incrustados tras el consentimiento; un proveedor no reconocido como enlace, nunca presentado como funcional', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: EMPTY_STATE, viewport: { width: 1440, height: 900 } })
    await ctx.route(/matterport\.com|kuula\.co/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }))
    const page = await ctx.newPage()
    await page.goto(`/propiedades/${p.rich!.slug}`)
    await page.getByTestId('cookie-reject').click()
    const cats = page.getByTestId('gallery-categories')
    await cats.locator('[data-gallery-category="pano360"]').click()
    const viewer = page.getByTestId('gallery-viewer')
    await expect(viewer.getByTestId('gallery-viewer-pano')).toBeVisible()
    // Tour virtual: tres elementos (Matterport, Kuula y uno externo no incrustable).
    await viewer.locator('[data-gallery-category="tour"][role="tab"]').click()
    await expect(viewer.locator('[data-testid="gallery-viewer-grid"] .gv-card')).toHaveCount(3)
    await viewer.locator('[data-testid="gallery-viewer-grid"] .gv-card').first().click()
    // Matterport: incrustado tras el consentimiento.
    const gate = viewer.getByTestId('consent-gate')
    await expect(gate).toContainText('Matterport')
    await expect(page.locator('iframe[src*="matterport"]')).toHaveCount(0)
    await gate.getByTestId('consent-gate-allow').click()
    await expect(page.locator('iframe[src*="my.matterport.com/show/?m=AbCdEfGh123"]')).toHaveCount(1)
    // Kuula: también incrustado. El consentimiento es por categoría («Contenido
    // de terceros», ConsentGate.vue), no por proveedor: ya concedido al permitir
    // Matterport, el tour de Kuula se incrusta directamente, sin volver a pedirlo.
    await viewer.getByTestId('gallery-viewer-next').click()
    await expect(viewer.getByTestId('consent-gate')).toHaveCount(0)
    await expect(page.locator('iframe[src*="kuula.co/share/abc123"]')).toHaveCount(1)
    // El proveedor no reconocido: enlace que se abre aparte, sin iframe.
    await viewer.getByTestId('gallery-viewer-next').click()
    const link = viewer.getByTestId('gallery-viewer-link')
    await expect(link).toBeVisible()
    await expect(link.locator('a')).toHaveAttribute('target', '_blank')
    await expect(link.locator('a')).toHaveAttribute('href', 'https://example-tour.com/v/xyz')
    await expect(page.locator('iframe[src*="example-tour"]')).toHaveCount(0)
    await ctx.close()
  })

  test('38–41 · accesibilidad: el foco entra en el visor, se queda dentro con Tab, todo botón tiene nombre y las imágenes su alt', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    await page.getByTestId('gallery-see-all').click()
    const viewer = page.getByTestId('gallery-viewer')
    await expect(viewer.getByTestId('gallery-viewer-close')).toBeFocused()
    for (let i = 0; i < 40; i++) await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="gallery-viewer"]'))).toBe(true)
    await page.keyboard.press('Shift+Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="gallery-viewer"]'))).toBe(true)
    const unnamed = await viewer.locator('button, a').evaluateAll((els) => els.filter((e) => !(e.textContent || '').trim() && !e.getAttribute('aria-label') && !e.querySelector('img[alt]:not([alt=""])')).length)
    expect(unnamed).toBe(0)
    const noAlt = await page.getByTestId('gallery-mosaic').locator('img').evaluateAll((els) => els.filter((e) => !e.getAttribute('alt')).length)
    expect(noAlt).toBe(0)
    // Cierra con Escape y el foco vuelve al botón que lo abrió.
    await page.keyboard.press('Escape')
    await expect(viewer).toHaveCount(0)
    await expect(page.getByTestId('gallery-see-all')).toBeFocused()
  })

  test('42–45 · responsive: móvil (carrusel, visor a pantalla completa, categorías desplazables, sin desbordes) y tableta', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await expect(page.locator('[data-testid="gallery-cell"]:visible')).toHaveCount(0) // en el móvil, sólo la principal y el carrusel (las celdas del mosaico existen pero están ocultas)
    await expect(page.getByTestId('gallery-strip')).toBeVisible()
    await expect(page.getByTestId('gallery-see-all')).toBeVisible()
    const main = await page.getByTestId('gallery-main').boundingBox()
    expect(main!.width).toBeGreaterThan(340)
    await page.getByTestId('gallery-see-all').click()
    const viewer = page.getByTestId('gallery-viewer')
    expect(await viewer.boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    // Las categorías de la cabecera se desplazan en horizontal dentro de su contenedor, sin ensanchar la página.
    const tabs = await viewer.getByTestId('gallery-viewer-tabs').evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }))
    expect(tabs.scroll).toBeGreaterThan(tabs.client)
    await page.keyboard.press('Escape')
    // Tableta.
    await page.setViewportSize({ width: 820, height: 1100 })
    await open(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await expect(page.getByTestId('gallery-cell')).toHaveCount(4)
  })

  test('46–50 · compatibilidad: lo existente sin clasificar ni miniaturas se ve igual (originales, «Todas las fotos»); una foto con miniatura la usa; la sencilla no tiene secundarias', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, p.legacy!.slug)
    await expect(page.getByTestId('gallery-counter')).toHaveText('1 / 4')
    await expect(page.getByTestId('gallery-see-all')).toContainText('(4)')
    const srcs = await page.getByTestId('gallery-mosaic').locator('img').evaluateAll((els) => els.map((e) => e.getAttribute('src')))
    for (const s of srcs) expect(s).not.toContain('.thumb')
    await page.getByTestId('gallery-see-all').click()
    await expect(page.getByTestId('gallery-viewer-rooms')).toHaveCount(0) // sin estancias, sin filtros
    await expect(page.getByTestId('gallery-viewer').locator('[data-testid="gallery-viewer-grid"] .gv-card')).toHaveCount(4)
    await page.keyboard.press('Escape')
    // Con miniatura propia: las secundarias y la cuadrícula la usan; el original sólo al ampliar.
    await open(page)
    const apiRow = await (await anon.get(`/api/public/properties/${p.rich!.slug}`)).json()
    const withThumb = apiRow.gallery.find((g: any) => g.thumb)
    expect(withThumb.thumb).toBe(keys.thumb)
    await page.getByTestId('gallery-see-all').click()
    const gridImg = page.getByTestId('gallery-viewer').locator(`[data-gallery-key="p${withThumb.id}"] img`).first()
    await expect(gridImg).toBeVisible()
    // La sencilla.
    await page.keyboard.press('Escape')
    await open(page, p.plain!.slug)
    await expect(page.getByTestId('gallery-counter')).toHaveText('1 / 1')
    await expect(page.getByTestId('gallery-cell')).toHaveCount(0)
    await expect(page.getByTestId('gallery-strip')).toHaveCount(0)
  })

  test('51–54 · API pública y aislamiento: trae estancia, descripción y miniatura sin datos internos; lo oculto no sale; la otra agencia no ve nada de ésta', async () => {
    const pub = await (await anon.get(`/api/public/properties/${p.rich!.slug}`)).json()
    const cocina = pub.gallery.find((g: any) => g.title === 'Cocina abierta')
    expect(cocina).toMatchObject({ room: 'kitchen', description: 'Cocina abierta al salón con isla' })
    expect(pub.gallery.some((g: any) => g.room === 'bathroom')).toBe(false)
    for (const g of pub.gallery) for (const k of ['isHidden', 'isPrivate', 'isPublishable', 'developerPropertyId']) expect(g, k).not.toHaveProperty(k)
    // Los ajenos no están en la ficha de esta agencia, ni la ficha de la otra se sirve desde aquí.
    expect((await anon.get(`/api/public/properties/${foreignSlug}`)).status()).toBe(404)
    // Y la otra agencia no puede clasificar ni cambiar las fotos de ésta.
    const mine = await (await a.get('/api/admin/project-images', { params: { developerPropertyId: String(p.rich!.id), perPage: '100' } })).json()
    const someId = mine.rows[0].id
    expect((await b.put(`/api/admin/project-images/${someId}`, { data: { room: 'garden' } })).status()).toBe(404)
    // Una miniatura de otra agencia se rechaza.
    const foreignThumb = await upload('ajena-thumb.png', 'properties', b)
    expect((await a.put(`/api/admin/project-images/${someId}`, { data: { thumbKey: foreignThumb } })).status()).toBe(404)
    // Una estancia fuera del catálogo se rechaza.
    expect((await a.put(`/api/admin/project-images/${someId}`, { data: { room: 'sotano-raro' } })).status()).toBe(422)
  })

  test('55–58 · el resto de bloques de la ficha, intacto bajo la galería: mismas clases, mismo orden y sin solaparse', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    const classes = await page.evaluate(() => ({
      summary: document.querySelector('[data-testid="ficha-summary"]')!.className,
      priceCard: document.querySelector('[data-testid="ficha-price-card"]')!.className,
      contact: document.querySelector('[data-testid="property-contact-card"]')!.className,
      nav: document.querySelector('[data-testid="ficha-section-nav"]')!.className,
      h1: getComputedStyle(document.querySelector('h1')!).fontSize,
    }))
    expect(classes.summary).toContain('pcard')
    expect(classes.summary).toContain('order-[-4]')
    expect(classes.priceCard).toContain('pcard')
    expect(classes.nav).toContain('sticky')
    expect(classes.h1).toBe('40px')
    // La barra de apartados y la tarjeta principal empiezan debajo de la galería; el precio, a la derecha, también.
    const g = await page.getByTestId('ficha-gallery-wrap').boundingBox()
    for (const id of ['ficha-summary', 'ficha-section-nav']) {
      const box = await page.getByTestId(id).boundingBox()
      expect(box!.y, id).toBeGreaterThanOrEqual(g!.y + g!.height - 1)
    }
    const price = await page.locator('[data-testid="ficha-price-card"]:visible').first().boundingBox() // hay una tarjeta para móvil y otra en la columna
    expect(price!.y).toBeGreaterThanOrEqual(g!.y + g!.height - 1)
    // Siguen las dos columnas debajo de la galería (≈ ⅔ y ⅓).
    const main = await page.getByTestId('ficha-main').boundingBox()
    const aside = await page.getByTestId('ficha-aside').boundingBox()
    expect(aside!.x).toBeGreaterThan(main!.x + main!.width - 1)
    // «Fotos» sigue siendo la primera pestaña de la barra y lleva a la galería.
    const first = page.getByTestId('ficha-section-nav').locator('a').first()
    await expect(first).toHaveAttribute('href', '#fotos')
  })
})
