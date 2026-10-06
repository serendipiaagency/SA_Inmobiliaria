import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Cierre D1p del núcleo inmobiliario — ficha y búsqueda de propiedades, sobre
 * HTTP real y en el panel, en los dos catálogos:
 *
 *  1. estado comercial común: `PUT` (con «Reservada» y la disponibilidad de 2ª
 *     mano detrás), filtro, columna y edición inline, acción masiva «Cambiar
 *     estado comercial» con auditoría;
 *  2. fechas con selector y AAAA-MM-DD al cambiar; exclusiva caducada;
 *  3. «Dormitorios» en el panel;
 *  4. piscina y jardín privados o comunitarios; 8. «Más características»;
 *  5. renta mensual; 6. la comunidad, un solo campo;
 *  7. búsqueda por referencias externa y de agencia, código comercial y calle;
 *  9. el portal desactivado y explicado en 2ª mano;
 * 10. CSV de todo el filtro; 11. «Creada por …»; 12. pastilla del tipo con su rótulo.
 *
 * Nada cruza de agencia (404) y sin sesión no se entra (401). Ninguna ruta
 * nueva: el presupuesto de rutas de Nitro está agotado.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const TAG = `D1P${RUN.replace(/[^0-9]/g, '').slice(-8)}`
const visible = (page: import('@playwright/test').Page, testId: string) => page.locator(`[data-testid="${testId}"]:visible`).first()

test.describe('Cierre D1p — ficha y búsqueda de propiedades', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let developerId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    // Dentro de un describe con `storageState`, un contexto nuevo hereda la sesión: el anónimo la vacía a propósito.
    anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } })
    const dev = await a.post('/api/admin/developers', { data: { name: `Dev D1p ${RUN}`, email: `dev-d1p-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
    await anon?.dispose()
  })

  let seq = 0
  /**
   * Una «zona» (localidad) propia por prueba y por catálogo: los listados se
   * filtran por ella, así que lo que creen otras pruebas (o un reintento) no
   * entra en las comparaciones exactas. Termina en «-z» para que «…-1-z» no
   * coincida con «…-10-z» (el filtro de localidad es un LIKE).
   */
  const newZone = () => `Zona ${TAG}-${++seq}-z`
  async function createProperty(resource: 'developer-properties' | 'properties', zone: string, data: Record<string, unknown> = {}) {
    seq += 1
    const base = resource === 'developer-properties' ? { developerId, name: `Torre ${TAG} ${seq}`, status: 'new' } : { slug: `d1p-${RUN}-${seq}`, status: 'available' }
    const res = await a.post(`/api/admin/${resource}`, { data: { price: 300000, transactionType: 'sale', city: zone, ...base, ...data } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/${resource}/${id}?hard=1`))
    return id
  }
  const row = async (resource: string, id: number) => (await (await a.get(`/api/admin/${resource}/${id}`)).json()).row
  const listIds = async (resource: string, zone: string, params: Record<string, string> = {}, ctx: APIRequestContext = a) => {
    const res = await ctx.get(`/api/admin/${resource}`, { params: { perPage: '100', city: zone, ...params } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return ((await res.json()).rows as any[]).map((r) => r.id).sort((x: number, y: number) => x - y)
  }

  async function runJob(jobId: number) {
    for (let i = 0; i < 50; i++) {
      const res = await a.put(`/api/admin/property-bulk-jobs/${jobId}`, { data: {} })
      expect(res.ok(), await res.text()).toBeTruthy()
      const body = await res.json()
      if (body.done) return body.job
    }
    throw new Error('El job no terminó')
  }

  test('estado comercial (API, los dos catálogos): «Reservada» y la disponibilidad lo siguen; filtro y columna; nada cruza de agencia', async () => {
    for (const resource of ['developer-properties', 'properties'] as const) {
      const zone = newZone()
      const id = await createProperty(resource, zone)
      const other = await createProperty(resource, zone)

      // «Reservada» marca la casilla de la web.
      expect((await a.put(`/api/admin/${resource}/${id}`, { data: { commercialStatus: 'reserved' } })).ok()).toBeTruthy()
      expect(await row(resource, id)).toMatchObject({ commercialStatus: 'reserved', isReserved: 1 })

      // Filtro y columna del listado.
      expect(await listIds(resource, zone, { commercialStatus: 'reserved' })).toEqual([id])
      expect(await listIds(resource, zone, { commercialStatus: 'none' })).toEqual([other])
      const list = await (await a.get(`/api/admin/${resource}`, { params: { city: zone, perPage: '100' } })).json()
      expect(list.rows.find((r: any) => r.id === id)).toMatchObject({ commercialStatus: 'reserved', isReserved: 1 })
      expect((await a.get(`/api/admin/${resource}`, { params: { commercialStatus: 'embargada' } })).status()).toBe(422)

      // «Vendida»: en 2ª mano la disponibilidad va detrás; el estado de la obra nunca se toca.
      expect((await a.put(`/api/admin/${resource}/${id}`, { data: { commercialStatus: 'sold' } })).ok()).toBeTruthy()
      const sold = await row(resource, id)
      expect(sold).toMatchObject({ commercialStatus: 'sold', isReserved: 0, status: resource === 'properties' ? 'sold' : 'new' })

      // Valor fuera del vocabulario: 422. Otra agencia y sin sesión: no.
      expect((await a.put(`/api/admin/${resource}/${id}`, { data: { commercialStatus: 'embargada' } })).status()).toBe(422)
      expect((await b.put(`/api/admin/${resource}/${id}`, { data: { commercialStatus: 'available' } })).status()).toBe(404)
      expect((await anon.put(`/api/admin/${resource}/${id}`, { data: { commercialStatus: 'available' } })).status()).toBe(401)
      expect(await listIds(resource, zone, { commercialStatus: 'sold' }, b)).toEqual([])
    }

    // 2ª mano: marcarla disponible otra vez devuelve el estado comercial «Vendida» a «Disponible».
    const agent = await createProperty('properties', newZone())
    await a.put(`/api/admin/properties/${agent}`, { data: { commercialStatus: 'sold' } })
    await a.put(`/api/admin/properties/${agent}`, { data: { status: 'available' } })
    expect(await row('properties', agent)).toMatchObject({ status: 'available', commercialStatus: 'available' })
  })

  test('acción masiva «Cambiar estado comercial»: valida al crear, aplica a la selección, queda en la auditoría; otra agencia no la procesa', async () => {
    const zone = newZone()
    const p1 = await createProperty('developer-properties', zone)
    const p2 = await createProperty('developer-properties', zone)
    const bad = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'developer', action: 'change_commercial_status', params: { commercialStatus: 'embargada' }, ids: [p1] } })
    expect(bad.status()).toBe(422)

    const created = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'developer', action: 'change_commercial_status', params: { commercialStatus: 'withdrawn' }, ids: [p1, p2] } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const { id: jobId } = await created.json()
    expect((await b.put(`/api/admin/property-bulk-jobs/${jobId}`, { data: {} })).status()).toBe(404)
    const job = await runJob(jobId)
    expect(job).toMatchObject({ status: 'completed', completedCount: 2 })
    for (const id of [p1, p2]) expect((await row('developer-properties', id)).commercialStatus).toBe('withdrawn')

    // Una copia nace sin estado comercial (ni publicada ni reservada): una copia «Retirada» o «Vendida» sería falsa.
    const dup = await a.post(`/api/admin/developer-properties/${p1}/duplicate`)
    expect(dup.ok(), await dup.text()).toBeTruthy()
    const copyId = (await dup.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${copyId}?hard=1`))
    expect(await row('developer-properties', copyId)).toMatchObject({ commercialStatus: null, isReserved: 0 })

    const audit = await (await a.get('/api/admin/audit-log', { params: { perPage: '50', q: 'property-bulk-jobs' } })).json()
    expect(audit.rows.some((r: any) => r.resource === 'property-bulk-jobs' && String(r.resourceId) === String(jobId) && /change_commercial_status × 2/.test(r.detail || ''))).toBe(true)
  })

  test('fechas: AAAA-MM-DD al cambiarlas (422 si no), vencimiento ≥ inicio, exclusiva caducada y captación en el filtro', async () => {
    expect((await a.post('/api/admin/properties', { data: { slug: `d1p-bad-${RUN}`, status: 'available', captureDate: '15/02/2026' } })).status()).toBe(422)
    const zone = newZone()
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
    const caducada = await createProperty('properties', zone, { isExclusive: 1, exclusiveFrom: '2025-01-01', exclusiveUntil: past, captureDate: '2025-01-10' })
    const porCaducar = await createProperty('properties', zone, { isExclusive: 1, exclusiveUntil: soon, captureDate: '2025-03-10' })

    // Reenviar la fecha tal cual (el autoguardado manda la ficha entera) no se valida otra vez; cambiarla mal, sí.
    expect((await a.put(`/api/admin/properties/${caducada}`, { data: { captureDate: '2025-01-10', price: 310000 } })).ok()).toBeTruthy()
    expect((await a.put(`/api/admin/properties/${caducada}`, { data: { captureDate: '2025-02-30' } })).status()).toBe(422)
    expect((await a.put(`/api/admin/properties/${caducada}`, { data: { exclusiveUntil: '2024-12-31' } })).status()).toBe(422)

    expect(await listIds('properties', zone, { exclusivity: 'expired' })).toEqual([caducada])
    expect(await listIds('properties', zone, { exclusivity: 'expiring' })).toEqual([porCaducar])
    expect(await listIds('properties', zone, { capturedFrom: '2025-03-01', capturedTo: '2025-03-31' })).toEqual([porCaducar])
    expect((await a.get('/api/admin/properties', { params: { capturedFrom: 'ayer' } })).status()).toBe(422)

    const summary = (await (await a.get(`/api/admin/properties/${caducada}`, { params: { view: 'summary' } })).json()).summary
    expect(summary.exclusivity).toMatchObject({ state: 'expired', until: past })
  })

  test('piscina y jardín (cualquiera de los tres), piscina privada / comunitaria, jardín privado y «Más características»', async () => {
    for (const resource of ['developer-properties', 'properties'] as const) {
      const zone = newZone()
      const generica = await createProperty(resource, zone, { hasPool: 1 })
      const comunitaria = await createProperty(resource, zone, { hasCommunityPool: 1, hasGym: 1, hasFiber: 1 })
      const privada = await createProperty(resource, zone, { hasPrivatePool: 1, hasPrivateGarden: 1, hasGym: 1 })
      await createProperty(resource, zone)
      expect(await listIds(resource, zone, { features: 'pool' })).toEqual([generica, comunitaria, privada].sort((x, y) => x - y))
      expect(await listIds(resource, zone, { features: 'communityPool' })).toEqual([comunitaria])
      expect(await listIds(resource, zone, { features: 'privatePool,privateGarden' })).toEqual([privada])
      expect(await listIds(resource, zone, { features: 'garden' })).toEqual([privada])
      expect(await listIds(resource, zone, { amenities: 'hasGym,hasFiber' })).toEqual([comunitaria])
      expect((await a.get(`/api/admin/${resource}`, { params: { amenities: 'has_gym' } })).status()).toBe(422)
    }
  })

  test('búsqueda por referencia externa, de agencia, código comercial y (2ª mano) calle; sólo de la agencia', async () => {
    const dev = await createProperty('developer-properties', newZone(), { externalReference: `EXT-${TAG}`, agencyReference: `AG-${TAG}` })
    const agent = await createProperty('properties', newZone(), { street: `Calle ${TAG}`, commercialCode: `CC-${TAG}` })
    const q = async (ctx: APIRequestContext, resource: string, text: string) => ((await (await ctx.get(`/api/admin/${resource}`, { params: { q: text } })).json()).rows as any[]).map((r) => r.id)
    expect(await q(a, 'developer-properties', `EXT-${TAG}`)).toEqual([dev])
    expect(await q(a, 'developer-properties', `ag-${TAG}`)).toEqual([dev])
    expect(await q(a, 'properties', `Calle ${TAG}`)).toEqual([agent])
    expect(await q(a, 'properties', `CC-${TAG}`)).toEqual([agent])
    expect(await q(b, 'properties', `CC-${TAG}`)).toEqual([])
    expect(await q(b, 'developer-properties', `EXT-${TAG}`)).toEqual([])
  })

  test('CSV: todo el filtro con el estado comercial; resumen con «Creada por» y renta mensual', async () => {
    const zone = newZone()
    const ids = [await createProperty('properties', zone, { commercialStatus: 'rented', transactionType: 'rent', price: 1200, area: 60 }), await createProperty('properties', zone), await createProperty('properties', zone)]
    const csv = await a.get('/api/admin/properties', { params: { format: 'csv', city: zone } })
    expect(csv.ok()).toBeTruthy()
    const lines = (await csv.text()).trim().split('\n')
    expect(lines[0]).toContain('commercialStatus')
    expect(lines).toHaveLength(ids.length + 1)
    for (const id of ids) expect(lines.some((l) => l.startsWith(`${id},`))).toBe(true)
    expect(lines.find((l) => l.startsWith(`${ids[0]},`))).toContain('rented')

    const summary = (await (await a.get(`/api/admin/properties/${ids[0]}`, { params: { view: 'summary' } })).json()).summary
    expect(summary).toMatchObject({ transactionType: 'rent', price: 1200, pricePerM2: 20, statusTitle: 'Disponibilidad', commercialStatusLabel: 'Alquilada' })
    expect(summary.createdByName).toBeTruthy()
    expect(summary.createdAt).toBeTruthy()
  })

  test('panel: estado comercial en la fila (inline), filtro, dormitorios, tipo con su rótulo y portal desactivado en 2ª mano', async ({ page }) => {
    const zone = newZone()
    const id = await createProperty('properties', zone, { propertyType: 'Villa', bedrooms: 3 })
    await page.addInitScript(() => localStorage.setItem('sa-admin-properties-view', 'list'))
    await page.goto(`/admin/properties?city=${encodeURIComponent(zone)}&propertyType=Villa`)
    // La pastilla del tipo enseña el rótulo, no la clave guardada.
    await expect(page.getByText('Tipo: Chalet')).toBeVisible()
    await expect(page.getByTestId(`property-commercial-chip-${id}`)).toHaveText('Sin indicar')
    await expect(page.locator('tbody tr', { hasText: `Ref. #${id}` })).toContainText('3 dorm.')

    await page.getByTestId(`property-inline-commercial-${id}-open`).click()
    await page.getByTestId(`property-inline-commercial-${id}-input`).selectOption('reserved')
    await expect(page.getByTestId(`property-commercial-chip-${id}`)).toHaveText('Reservada')
    expect(await row('properties', id)).toMatchObject({ commercialStatus: 'reserved', isReserved: 1 })

    // Filtro rápido por estado comercial (va a la URL).
    await page.getByTestId('property-commercial-status-filter').selectOption('withdrawn')
    await expect(page).toHaveURL(/commercialStatus=withdrawn/)
    await expect(page.locator('tbody tr', { hasText: `Ref. #${id}` })).toHaveCount(0)

    // Filtros: dormitorios, vencimiento de la exclusiva, «Más características» y el portal explicado.
    await page.goto('/admin/properties?portal=idealista')
    await expect(page).not.toHaveURL(/portal=idealista/)
    await page.getByRole('button', { name: /^Filtros/ }).click()
    await expect(page.getByText('Dormitorios (mín.)')).toBeVisible()
    await expect(page.getByTestId('filter-exclusivity')).toBeVisible()
    await expect(page.getByTestId('filter-portal-unavailable')).toBeDisabled()
    await page.getByTestId('filter-amenities').locator('summary').click()
    await expect(page.getByTestId('filter-amenity-hasGym')).toBeVisible()
    await expect(page.getByTestId('filter-feature-privatePool')).toBeVisible()
  })

  test('editor: fechas con calendario, «Dormitorios», «Renta mensual» en alquiler y sin los campos heredados vacíos', async ({ page }) => {
    const id = await createProperty('properties', newZone(), { transactionType: 'rent', price: 950 })
    await page.goto(`/admin/properties/${id}`)
    await expect(visible(page, 'property-summary')).toBeVisible()
    await expect(visible(page, 'property-summary-price')).toContainText('/mes')
    await expect(visible(page, 'property-summary-created')).toContainText('Creada por')
    await expect(visible(page, 'field-date-captureDate')).toHaveAttribute('type', 'date')
    await visible(page, 'property-editor-step-price').click()
    await expect(page.getByLabel('Renta mensual', { exact: true }).first()).toBeVisible()
    await visible(page, 'property-editor-step-features').click()
    await expect(page.locator('[data-field="bedrooms"]:visible').first()).toContainText('Dormitorios')
    await visible(page, 'property-editor-step-commercial').click()
    await expect(visible(page, 'field-date-exclusiveUntil')).toHaveAttribute('type', 'date')
    // Sin dato anterior, ni «Gastos de comunidad anuales» ni la casilla antigua «Reservada»: un solo sitio para cada cosa.
    await expect(page.locator('[data-field="serviceChargeAnnual"]')).toHaveCount(0)
    await expect(page.locator('[data-field="isReserved"]')).toHaveCount(0)
  })
})
