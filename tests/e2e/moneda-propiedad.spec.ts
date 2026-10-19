import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = Date.now().toString(36)

/**
 * Moneda por propiedad (Cola 11): una propiedad en MXN se enseña en MXN en la
 * API pública, en su ficha y en el panel, sin convertirla; una sin moneda
 * propia sigue en la de la agencia.
 */
test.describe('Moneda por propiedad', () => {
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  let developerId: number
  const ids: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const dev = await a.post('/api/admin/developers', { data: { name: `Moneda promotora ${RUN}`, email: `moneda-${RUN}@mm.test`, status: 'active' } })
    developerId = (await dev.json()).id
  })
  test.afterAll(async () => {
    for (const id of ids) await a.delete(`/api/admin/developer-properties/${id}?hard=1`)
    await a.delete(`/api/admin/developers/${developerId}`)
    await a.dispose()
  })

  async function create(extra: Record<string, unknown>) {
    const r = await a.post('/api/admin/developer-properties', {
      data: { developerId, name: `Villa moneda ${RUN} ${Math.random().toString(36).slice(2, 6)}`, status: 'ready', price: 4500000, bedrooms: 3, area: 200, community: `Moneda ${RUN}`, publishedAt: '2026-10-01 10:00:00', ...extra },
    })
    expect(r.ok(), await r.text()).toBeTruthy()
    const id = (await r.json()).id as number
    ids.push(id)
    return (await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row
  }

  test('el servidor acepta cualquier moneda ISO y rechaza lo que no lo es', async () => {
    const ok = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Moneda ISO ${RUN}`, status: 'ready', price: 1, currency: 'MXN' } })
    expect(ok.ok()).toBeTruthy()
    ids.push((await ok.json()).id)
    const bad = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Moneda mala ${RUN}`, status: 'ready', price: 1, currency: 'ZZZ' } })
    expect(bad.status()).toBe(422)
  })

  test('la API pública y la ficha enseñan la moneda propia sin convertir', async ({ page }) => {
    const row = await create({ currency: 'MXN' })
    const pub = await (await a.get(`/api/public/properties/${row.slug}`)).json()
    expect((pub.project || pub).currency).toBe('MXN')

    await page.goto(`/propiedades/${row.slug}`)
    const price = page.getByTestId('ficha-aside').getByTestId('ficha-price')
    await expect(price).toBeVisible()
    await expect(price).toContainText('MXN')
    await expect(price).toContainText('4.500.000')
  })

  test('una propiedad sin moneda propia se enseña en la de la agencia', async ({ page }) => {
    const row = await create({})
    expect(row.currency ?? null).toBeNull()
    await page.goto(`/propiedades/${row.slug}`)
    const price = page.getByTestId('ficha-aside').getByTestId('ficha-price')
    await expect(price).toBeVisible()
    await expect(price).not.toContainText('MXN')
  })

  test('el panel enseña la tarjeta en la moneda de la propiedad', async ({ page }) => {
    const row = await create({ currency: 'MXN', name: `Villa panel MXN ${RUN}` })
    await page.goto(`/admin/developer-properties/${row.id}`)
    await expect(page.getByTestId('property-summary-price')).toContainText('MXN')
    await expect(page.getByTestId('property-summary-price')).toContainText('4.500.000')
  })
})
