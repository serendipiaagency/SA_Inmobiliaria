import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * Covers "Propiedades 2ª mano" reaching parity with "Propiedades (web)":
 * the redesigned admin listing (search/filters/sort/grid cards) and the
 * Property Builder sections that used to be developer-properties-only —
 * granular location + map, and a Comercial (agent) assignment picker.
 * Real HTTP against the running Worker, same pattern as
 * developer-properties-admin.spec.ts.
 */

test.describe('Propiedades 2ª mano — listado admin', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  const createdIds: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  })

  test.afterAll(async () => {
    await Promise.all(createdIds.map((id) => a.delete(`/api/admin/properties/${id}`)))
    await a?.dispose()
  })

  async function createProperty(overrides: Record<string, any> = {}) {
    const res = await a.post('/api/admin/properties', {
      data: { slug: `e2e-2h-${Date.now()}-${Math.random().toString(36).slice(2)}`, ...overrides },
    })
    const body = await res.json()
    createdIds.push(body.id)
    return body.id as number
  }

  test('el listado filtra por precio, tipo de operación y ubicación', async () => {
    const cheap = await createProperty({ price: 90000, transactionType: 'rent', city: 'E2E-Alicante', status: 'available' })
    const expensive = await createProperty({ price: 900000, transactionType: 'sale', city: 'E2E-Madrid', status: 'available' })

    const byPrice = await (await a.get('/api/admin/properties', { params: { priceMax: '100000' } })).json()
    expect(byPrice.rows.some((r: any) => r.id === cheap)).toBe(true)
    expect(byPrice.rows.some((r: any) => r.id === expensive)).toBe(false)

    const byTransaction = await (await a.get('/api/admin/properties', { params: { transactionType: 'rent' } })).json()
    expect(byTransaction.rows.some((r: any) => r.id === cheap)).toBe(true)
    expect(byTransaction.rows.some((r: any) => r.id === expensive)).toBe(false)

    const byCity = await (await a.get('/api/admin/properties', { params: { city: 'E2E-Madrid' } })).json()
    expect(byCity.rows.some((r: any) => r.id === expensive)).toBe(true)
    expect(byCity.rows.some((r: any) => r.id === cheap)).toBe(false)
  })

  test('los campos de ubicación granular, coordenadas del mapa y el comercial asignado persisten', async () => {
    const teamRes = await a.get('/api/admin/team', { params: { perPage: '1' } })
    const team = await teamRes.json()
    const agentId = team.rows[0]?.id

    const id = await createProperty({
      country: 'España',
      city: 'Alicante',
      street: 'Calle Mayor',
      streetNumber: '12',
      postalCode: '03001',
      district: 'Centro',
      lat: 38.3452,
      lng: -0.481,
      agentId,
    })

    const row = (await (await a.get(`/api/admin/properties/${id}`)).json()).row
    expect(row.country).toBe('España')
    expect(row.city).toBe('Alicante')
    expect(row.street).toBe('Calle Mayor')
    expect(row.postalCode).toBe('03001')
    expect(row.lat).toBe(38.3452)
    expect(row.lng).toBe(-0.481)
    if (agentId) expect(row.agentId).toBe(agentId)

    // A partial PUT (only price) must not clobber the location/agent fields just set.
    await a.put(`/api/admin/properties/${id}`, { data: { price: 123456 } })
    const after = (await (await a.get(`/api/admin/properties/${id}`)).json()).row
    expect(after.price).toBe(123456)
    expect(after.city).toBe('Alicante')
    expect(after.lat).toBe(38.3452)
  })

  test('el listado admin carga en el navegador y el editor de propiedad muestra el mapa de ubicación y el selector de comercial', async ({ page }) => {
    await page.context().addCookies((await a.storageState()).cookies)
    const id = await createProperty({ propertyType: 'Apartment', price: 250000, city: 'E2E-Valencia' })

    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto('/admin/properties')
    await expect(page.getByRole('heading', { name: 'Propiedades 2ª mano' })).toBeVisible()
    await expect(page.getByPlaceholder(/Referencia, dirección, zona/)).toBeVisible()

    await page.goto(`/admin/properties/${id}`)
    // Section nav renders twice (mobile tabs + desktop sidebar, CSS-toggled,
    // not v-if) — scope to the desktop <aside>, matching the
    // developer-properties spec's pattern.
    const nav = page.locator('aside')
    await nav.getByRole('button', { name: 'Ubicación' }).click()
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 })

    await nav.getByRole('button', { name: 'Comercial' }).click()
    await expect(page.getByText('Sin asignar')).toBeVisible()

    expect(consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('net::ERR_'))).toEqual([])
  })

  test('el vídeo (URL) y las redes sociales persisten igual que en Propiedades (web)', async () => {
    const id = await createProperty({ videoUrl: 'https://youtube.com/watch?v=e2e2h' })
    const row = (await (await a.get(`/api/admin/properties/${id}`)).json()).row
    expect(row.videoUrl).toBe('https://youtube.com/watch?v=e2e2h')

    const social = await a.post('/api/admin/agent-property-social-media', {
      data: { propertyId: id, platform: 'instagram', url: 'https://instagram.com/e2e2h', sortOrder: 0 },
    })
    expect(social.ok()).toBeTruthy()
    const socialRows = await (await a.get('/api/admin/agent-property-social-media', { params: { perPage: '100' } })).json()
    expect(socialRows.rows.some((r: any) => r.propertyId === id && r.platform === 'instagram')).toBe(true)
  })

  test('"Usar como portada" en la Galería fija mainImage (no coverImage) para 2ª mano', async ({ page }) => {
    await page.context().addCookies((await a.storageState()).cookies)
    const id = await createProperty({ propertyType: 'Villa', price: 500000 })
    const gallery = await a.post('/api/admin/gallery-images', { data: { propertyId: id, image: 'public/1/properties/e2e-cover.jpg', sortOrder: 0 } })
    expect(gallery.ok()).toBeTruthy()

    await page.goto(`/admin/properties/${id}`)
    const nav = page.locator('aside')
    await nav.getByRole('button', { name: 'Galería' }).click()
    await page.getByRole('button', { name: 'Usar como portada' }).click()
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Guardado')).toBeVisible({ timeout: 5000 })

    const row = (await (await a.get(`/api/admin/properties/${id}`)).json()).row
    expect(row.mainImage).toBe('public/1/properties/e2e-cover.jpg')
    expect(row.coverImage).toBeUndefined()
  })
})
