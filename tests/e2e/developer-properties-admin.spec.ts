import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * Covers the redesigned "Propiedades (web)" admin listing (search/filters/
 * sort/publish/duplicate) and the Property Builder's new sections (granular
 * location + map, structured payment plan instead of raw JSON, video
 * upload, gallery drag-and-drop ordering, expanded social links) — real
 * HTTP against the running Worker, same pattern as site-builder.spec.ts.
 */

test.describe('Propiedades (web) — listado admin', () => {
  // Reuses the session from global-setup.ts rather than logging in again —
  // /api/auth/login (and other endpoints) are IP rate-limited and the whole
  // suite shares one address in local wrangler dev.
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let developerId: number
  const createdIds: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const devs = await (await a.get('/api/admin/developers', { params: { perPage: '1' } })).json()
    developerId = devs.rows[0].id
  })

  test.afterAll(async () => {
    await Promise.all(createdIds.map((id) => a.delete(`/api/admin/developer-properties/${id}`)))
    await a?.dispose()
  })

  async function createProperty(overrides: Record<string, any> = {}) {
    const res = await a.post('/api/admin/developer-properties', {
      data: { developerId, name: `E2E test property ${Date.now()}-${Math.random()}`, ...overrides },
    })
    const body = await res.json()
    createdIds.push(body.id)
    return body.id as number
  }

  test('el listado filtra por precio, tipo y ubicación, y ordena por precio', async () => {
    const cheap = await createProperty({ price: 100000, propertyType: 'Studio', city: 'Alicante', status: 'ready' })
    const expensive = await createProperty({ price: 900000, propertyType: 'Villa', city: 'Marbella', status: 'ready' })

    const byPriceRange = await (await a.get('/api/admin/developer-properties', { params: { priceMin: '500000' } })).json()
    expect(byPriceRange.rows.some((r: any) => r.id === expensive)).toBe(true)
    expect(byPriceRange.rows.some((r: any) => r.id === cheap)).toBe(false)

    const byType = await (await a.get('/api/admin/developer-properties', { params: { propertyType: 'Villa' } })).json()
    expect(byType.rows.some((r: any) => r.id === expensive)).toBe(true)
    expect(byType.rows.some((r: any) => r.id === cheap)).toBe(false)

    const byCity = await (await a.get('/api/admin/developer-properties', { params: { city: 'Alicante' } })).json()
    expect(byCity.rows.some((r: any) => r.id === cheap)).toBe(true)

    const sorted = await (await a.get('/api/admin/developer-properties', { params: { sort: 'price_desc', perPage: '5' } })).json()
    const prices = sorted.rows.map((r: any) => r.price).filter((p: number) => p != null)
    expect([...prices]).toEqual([...prices].sort((x, y) => y - x))
  })

  test('la búsqueda de texto encuentra por nombre y por referencia (id numérico)', async () => {
    const id = await createProperty({ name: 'Villa Marina Única E2E' })
    const byName = await (await a.get('/api/admin/developer-properties', { params: { q: 'Marina Única E2E' } })).json()
    expect(byName.rows.some((r: any) => r.id === id)).toBe(true)

    const byRef = await (await a.get('/api/admin/developer-properties', { params: { q: String(id) } })).json()
    expect(byRef.rows.some((r: any) => r.id === id)).toBe(true)
  })

  test('publicar/despublicar cambia publishedAt, y duplicar clona la propiedad con sus datos', async () => {
    const id = await createProperty({ price: 250000 })
    await a.put(`/api/admin/developer-properties/${id}`, { data: { publishedAt: new Date().toISOString() } })
    let row = (await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row
    expect(row.publishedAt).toBeTruthy()

    await a.put(`/api/admin/developer-properties/${id}`, { data: { publishedAt: null } })
    row = (await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row
    expect(row.publishedAt).toBeFalsy()

    const dup = await a.post(`/api/admin/developer-properties/${id}/duplicate`)
    expect(dup.ok()).toBeTruthy()
    const { id: dupId } = await dup.json()
    createdIds.push(dupId)
    const dupRow = (await (await a.get(`/api/admin/developer-properties/${dupId}`)).json()).row
    expect(dupRow.name).toContain('copia')
    expect(dupRow.price).toBe(250000)
    expect(dupRow.publishedAt).toBeFalsy()
  })

  test('los campos de ubicación granular y el plan de pagos estructurado persisten', async () => {
    const id = await createProperty({
      country: 'España',
      city: 'Valencia',
      street: 'Calle Colón',
      streetNumber: '12',
      block: 'B',
      portal: '2',
      floor: '4',
      doorLetter: 'A',
      district: 'Ciutat Vella',
      lat: 39.47,
      lng: -0.376,
      paymentPlan: JSON.stringify([{ label: 'Reserva', value: '10%' }, { label: 'A la entrega', value: '90%' }]),
    })
    const row = (await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row
    expect(row.city).toBe('Valencia')
    expect(row.district).toBe('Ciutat Vella')
    expect(row.lat).toBeCloseTo(39.47)
    const plan = JSON.parse(row.paymentPlan)
    expect(plan).toEqual([
      { label: 'Reserva', value: '10%' },
      { label: 'A la entrega', value: '90%' },
    ])
  })

  test('la galería admite reordenar por sortOrder y las redes sociales aceptan las nuevas plataformas', async () => {
    const id = await createProperty()
    const img1 = await a.post('/api/admin/project-images', { data: { developerPropertyId: id, image: 'public/1/properties/e2e-a.jpg', sortOrder: 0 } })
    const img2 = await a.post('/api/admin/project-images', { data: { developerPropertyId: id, image: 'public/1/properties/e2e-b.jpg', sortOrder: 1 } })
    const { id: img1Id } = await img1.json()
    const { id: img2Id } = await img2.json()

    // Simulate a drag-drop reorder: img2 moves to position 0.
    await a.put(`/api/admin/project-images/${img2Id}`, { data: { sortOrder: 0 } })
    await a.put(`/api/admin/project-images/${img1Id}`, { data: { sortOrder: 1 } })
    const gallery = await (await a.get('/api/admin/project-images', { params: { perPage: '100' } })).json()
    const ours = gallery.rows.filter((r: any) => r.developerPropertyId === id).sort((x: any, y: any) => x.sortOrder - y.sortOrder)
    expect(ours.map((r: any) => r.id)).toEqual([img2Id, img1Id])

    const social = await a.post('/api/admin/social-media', { data: { developerPropertyId: id, platform: 'whatsapp', url: 'https://wa.me/123456', sortOrder: 0 } })
    expect(social.ok()).toBeTruthy()
    const socialRow = await social.json()
    expect(socialRow.ok).toBe(true)
  })

  test('el listado admin carga en el navegador sin errores y muestra las tarjetas', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    await createProperty({ name: 'Tarjeta visible E2E', price: 321000 })
    await page.goto('/admin/developer-properties')
    await expect(page.getByRole('heading', { name: 'Propiedades (web)' })).toBeVisible()
    await expect(page.getByPlaceholder(/Nombre, referencia, dirección/)).toBeVisible()
    // Grid (cards) is the default view — assert it actually renders real
    // card content, not just an empty wrapper: a regression here (e.g. a
    // component resolving to nothing because it isn't correctly
    // registered) would leave the whole grid silently blank in production
    // without failing a check that only looks at page chrome.
    await expect(page.getByRole('button', { name: 'Grid' })).toHaveClass(/bg-ink/)
    await expect(page.getByText('Tarjeta visible E2E')).toBeVisible()
    await expect(page.getByText('321.000 €').first()).toBeVisible()
    await page.getByRole('button', { name: /^Filtros/ }).click()
    await expect(page.getByText('Precio mínimo')).toBeVisible()
    // Excludes network-level resource failures (net::ERR_*) — an external
    // CDN/font being unreachable from this sandboxed test environment is an
    // infra concern, not a sign this page's own code is broken.
    expect(consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('net::ERR_'))).toEqual([])
  })

  test('el editor de propiedad muestra el mapa de ubicación y el plan de pagos sin JSON crudo', async ({ page }) => {
    const id = await createProperty({ paymentPlan: JSON.stringify([{ label: 'Reserva', value: '10%' }]) })
    await page.goto(`/admin/developer-properties/${id}`)
    // Section nav renders twice (mobile tabs + desktop sidebar, CSS-toggled,
    // not v-if) — scope to the desktop <aside>, which is what's actually
    // visible at this viewport.
    const nav = page.locator('aside')
    await nav.getByRole('button', { name: 'Ubicación' }).click()
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 })

    await nav.getByRole('button', { name: 'Precio' }).click()
    // "Reserva" is an <input>'s value, not text content — getByText only
    // matches text nodes, so it must be read via the input locator.
    await expect(page.locator('input[placeholder*="Reserva"]')).toHaveValue('Reserva')
    // Sections stay mounted (v-show, not v-if) so other sections' textareas
    // (e.g. Descripción) still exist in the DOM — only the visible ones
    // matter for "no raw JSON textarea in the Precio section" here.
    await expect(page.locator('textarea:visible')).toHaveCount(0)

    await nav.getByRole('button', { name: 'Multimedia' }).click()
    await expect(page.getByRole('button', { name: 'URL externa' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Subir archivo' })).toBeVisible()

    await nav.getByRole('button', { name: 'Redes sociales' }).click()
    await expect(page.getByRole('button', { name: '+ Añadir red social' })).toBeVisible()
  })
})
