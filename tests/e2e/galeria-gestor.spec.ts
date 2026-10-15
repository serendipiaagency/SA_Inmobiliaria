import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'
import { buildPng, buildGif } from '../../test/unit/helpers/mediaFixtures'

/**
 * Gestor de la galería en el editor de propiedades (Cola 5): subida múltiple
 * con cola y vista previa, validación antes de subir, estancia al subir y por
 * foto, descripción, clasificación masiva, reordenar con botones, portada,
 * eliminar, miniaturas WebP generadas en el navegador y la API detrás (con
 * el aislamiento entre agencias). La clasificación se guarda en la base y es
 * lo que enseña la web.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('Gestor de la galería', () => {
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  let propertyId = 0
  let slug = ''

  const png = (name: string, w = 160, h = 100) => ({ name, mimeType: 'image/png', buffer: Buffer.from(buildPng(w, h)) })
  const rows = async () => ((await (await a.get('/api/admin/project-images', { params: { developerPropertyId: String(propertyId), perPage: '100' } })).json()).rows as any[]).sort((x, y) => x.sortOrder - y.sortOrder || x.id - y.id)

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora gestor ${RUN}`, email: `gestor-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
    const res = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Gestor galería ${RUN}`, price: 200000, bedrooms: 2, bathrooms: 1, area: 80, status: 'new' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    propertyId = (await res.json()).id
    slug = (await (await a.get(`/api/admin/developer-properties/${propertyId}`)).json()).row.slug
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${propertyId}?hard=1`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose(), anon?.dispose()])
  })

  async function openGallery(page: import('@playwright/test').Page) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/admin/developer-properties/${propertyId}`)
    await page.locator('aside').getByRole('button', { name: /Galería/ }).click()
    await expect(page.getByTestId('gallery-manager')).toBeVisible()
  }

  test('59–64 · subir varias a la vez con estancia: cola con vista previa y estado, validación de formato y tamaño, miniatura generada y todo persistido', async ({ page }) => {
    await openGallery(page)
    await expect(page.getByTestId('gallery-dropzone')).toBeVisible()
    await page.getByTestId('gallery-new-room').selectOption('living')
    await page.getByTestId('gallery-file-input').setInputFiles([
      png('salon-a.png'),
      png('salon-b.png'),
      { name: 'documento.txt', mimeType: 'text/plain', buffer: Buffer.from('no soy una imagen') },
      { name: 'enorme.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 10) },
    ])
    const queue = page.getByTestId('gallery-queue-item')
    await expect(queue).toHaveCount(4)
    // Las dos buenas terminan; el formato y el tamaño se rechazan antes de subir, con su motivo.
    await expect(page.locator('[data-testid="gallery-queue-item"][data-status="done"]')).toHaveCount(2, { timeout: 30_000 })
    await expect(page.locator('[data-testid="gallery-queue-item"][data-status="error"]')).toHaveCount(2)
    const errors = await page.getByTestId('gallery-queue-error').allTextContents()
    expect(errors.join(' ')).toMatch(/Formato no admitido/)
    expect(errors.join(' ')).toMatch(/10 MB/)
    // Persistido con la estancia elegida al subir, y la miniatura WebP del navegador (cuando el navegador sabe generarla).
    await expect.poll(async () => (await rows()).length, { timeout: 15_000 }).toBe(2)
    const saved = await rows()
    expect(saved.map((r) => r.room)).toEqual(['living', 'living'])
    // El servidor da su propio nombre al fichero: lo que importa es que es un WebP distinto del original.
    expect(saved.every((r) => typeof r.thumbKey === 'string' && r.thumbKey.endsWith('.webp') && r.thumbKey !== r.image)).toBe(true)
    // La miniatura se sirve (fichero público de la agencia) y es una imagen WebP.
    const thumb = await anon.get(`/api/media/${saved[0].thumbKey}`)
    expect(thumb.status()).toBe(200)
    expect(thumb.headers()['content-type']).toContain('image/webp')
    // Se ven en la cuadrícula, con su estancia.
    await expect(page.getByTestId('gallery-item')).toHaveCount(2)
    await expect(page.getByTestId('gallery-item-room').first()).toHaveValue('living')
  })

  test('65–68 · estancia y descripción por foto, y clasificación masiva (seleccionar varias → asignar estancia); lo que se guarda es lo que enseña la web', async ({ page }) => {
    // Cuatro fotos más por API (la cola ya se probó) y se abre el gestor.
    for (let i = 0; i < 4; i++) {
      const up = await a.post('/api/admin/upload', { multipart: { file: png(`extra-${i}.png`), folder: 'project-images' } })
      const key = (await up.json()).key
      const r = await a.post('/api/admin/project-images', { data: { developerPropertyId: propertyId, image: key, sortOrder: 10 + i } })
      expect(r.ok(), await r.text()).toBeTruthy()
    }
    await openGallery(page)
    await expect(page.getByTestId('gallery-item')).toHaveCount(6)
    // Una foto: estancia desde su selector (se guarda al momento).
    const first = page.getByTestId('gallery-item').first()
    await first.getByTestId('gallery-item-room').selectOption('kitchen')
    await expect.poll(async () => (await rows())[0].room).toBe('kitchen')
    // Su descripción desde «Datos».
    const id0 = (await rows())[0].id
    await page.getByTestId(`gallery-item-edit-${id0}`).click({ force: true })
    await page.getByTestId('media-metadata-description').fill('Cocina con isla y zona de desayuno')
    await page.getByTestId('media-metadata-save').click()
    await expect.poll(async () => (await rows())[0].description).toBe('Cocina con isla y zona de desayuno')
    // Clasificación masiva: tres fotos → dormitorio.
    const items = page.getByTestId('gallery-item')
    for (const i of [3, 4, 5]) await items.nth(i).getByTestId('gallery-item-select').check()
    await page.getByTestId('gallery-bulk-room').selectOption('bedroom')
    await page.getByTestId('gallery-bulk-room-apply').click()
    await expect.poll(async () => (await rows()).filter((r) => r.room === 'bedroom').length).toBe(3)
    // «Sin clasificar»: quitar la estancia a una foto la deja en «Todas las fotos» sin más.
    await items.nth(0).getByTestId('gallery-item-room').selectOption('')
    await expect.poll(async () => (await rows())[0].room).toBeNull()
    // La web lo enseña: sólo las estancias con fotos, con su número.
    const pub = await (await anon.get(`/api/public/properties/${slug}`)).json()
    const count = (room: string) => pub.gallery.filter((g: any) => g.room === room).length
    expect(count('bedroom')).toBe(3)
    expect(count('living')).toBe(1)
    expect(pub.gallery.find((g: any) => g.description)?.description).toBe('Cocina con isla y zona de desayuno')
  })

  test('69–73 · reordenar con botones (teclado y táctil), portada, ocultar y eliminar; el orden del gestor es el de la web y la portada la principal del mosaico', async ({ page }) => {
    await openGallery(page)
    const before = (await rows()).map((r) => r.id)
    // Mover la tercera dos puestos hacia delante con los botones «←».
    const third = page.getByTestId('gallery-item').nth(2)
    await third.getByTestId('gallery-item-left').click()
    await expect.poll(async () => (await rows()).map((r) => r.id)[1]).toBe(before[2])
    await page.getByTestId('gallery-item').nth(1).getByTestId('gallery-item-left').click()
    await expect.poll(async () => (await rows()).map((r) => r.id)[0]).toBe(before[2])
    // Con teclado: el botón recibe el foco y Enter lo activa (los botones nativos).
    await page.getByTestId('gallery-item').nth(0).getByTestId('gallery-item-right').focus()
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await rows()).map((r) => r.id)[1]).toBe(before[2])
    // La web respeta el orden del gestor.
    const pub = await (await anon.get(`/api/public/properties/${slug}`)).json()
    expect(pub.gallery.map((g: any) => g.id)).toEqual((await rows()).map((r) => r.id))
    // Portada: «Usar como portada» y guardar; la web la pone la primera del mosaico.
    const target = (await rows())[2]
    await page.getByTestId(`gallery-item-cover-${target.id}`).click({ force: true })
    await page.getByTestId('property-editor-save').click()
    await expect(page.getByTestId('property-editor-save-state')).toHaveText('Guardado', { timeout: 8000 })
    // «Guardado» puede ser el de antes del clic: se espera a que la portada llegue a la API, no se lee una sola vez.
    await expect
      .poll(async () => (await (await a.get(`/api/admin/developer-properties/${propertyId}`)).json()).row.coverImage, { timeout: 15_000 })
      .toBe(target.image)
    await page.goto(`/propiedades/${slug}`)
    await expect(page.getByTestId('gallery-main').locator('img')).toHaveAttribute('src', new RegExp(target.image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    // Ocultar y eliminar desde el gestor.
    await openGallery(page)
    const total = (await rows()).length
    await page.getByTestId('gallery-item').last().getByTestId('gallery-item-select').check()
    await page.getByTestId('gallery-bulk-hide').click()
    await expect.poll(async () => (await rows()).filter((r) => r.isHidden).length).toBe(1)
    const pubHidden = await (await anon.get(`/api/public/properties/${slug}`)).json()
    expect(pubHidden.gallery.length).toBe(total - 1)
    const lastId = (await rows()).at(-1)!.id
    // Tras ocultar, la lista se vuelve a cargar: el clic puede caer antes de que el botón esté activo, así que se repite hasta que sale la confirmación.
    const dialog = page.getByRole('alertdialog')
    await expect(async () => {
      await page.getByTestId(`gallery-item-delete-${lastId}`).click({ force: true })
      await expect(dialog).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 15_000 })
    await dialog.getByRole('button', { name: 'Eliminar' }).click()
    await expect.poll(async () => (await rows()).length).toBe(total - 1)
  })

  test('74–76 · generar miniaturas de las fotos que no la tienen (compatibilidad con lo subido antes) y no repetirlas', async ({ page }) => {
    const up = await a.post('/api/admin/upload', { multipart: { file: png('antigua.png', 800, 500), folder: 'project-images' } })
    const key = (await up.json()).key
    const created = await a.post('/api/admin/project-images', { data: { developerPropertyId: propertyId, image: key, sortOrder: 99 } })
    const id = (await created.json()).id
    await openGallery(page)
    expect((await rows()).find((r) => r.id === id).thumbKey).toBeNull()
    await page.getByTestId('gallery-select-all').check()
    await page.getByTestId('gallery-bulk-thumbs').click()
    await expect.poll(async () => (await rows()).every((r) => !!r.thumbKey), { timeout: 30_000 }).toBe(true)
    const antigua = (await rows()).find((r) => r.id === id)
    const res = await anon.get(`/api/media/${antigua.thumbKey}`)
    expect(res.status()).toBe(200)
    // El original mide 800 px de ancho; la miniatura, 640 como mucho (se decodifica en el navegador).
    const width = await page.evaluate(async (u) => (await createImageBitmap(await (await fetch(u)).blob())).width, `/api/media/${antigua.thumbKey}`)
    expect(width).toBe(640)
    // Una segunda pasada no vuelve a generar ninguna (ya la tienen todas).
    const before = (await rows()).map((r) => r.thumbKey)
    await page.getByTestId('gallery-bulk-thumbs').click()
    await page.waitForTimeout(500)
    expect((await rows()).map((r) => r.thumbKey)).toEqual(before)
  })

  test('77–79 · seguridad: la otra agencia no puede clasificar ni subir miniaturas a estas fotos; una GIF subida por API se acepta como foto', async () => {
    const mine = await rows()
    const id = mine[0].id
    expect((await b.put(`/api/admin/project-images/${id}`, { data: { room: 'garden', description: 'ajeno' } })).status()).toBe(404)
    expect((await b.delete(`/api/admin/project-images/${id}`)).status()).toBe(404)
    const listed = await (await b.get('/api/admin/project-images', { params: { developerPropertyId: String(propertyId), perPage: '100' } })).json()
    expect(listed.rows ?? []).toEqual([])
    const up = await a.post('/api/admin/upload', { multipart: { file: { name: 'animada.gif', mimeType: 'image/gif', buffer: Buffer.from(buildGif(8, 8)) }, folder: 'project-images' } })
    expect(up.ok(), await up.text()).toBeTruthy()
  })
})
