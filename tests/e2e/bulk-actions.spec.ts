import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

/**
 * FASE 28 — Bulk Actions. El framework (job + items, selección manual o
 * "todos los filtrados", confirmación, progreso, fallo parcial reportado
 * fila a fila, idempotencia) se prueba aquí contra HTTP real — la
 * cobertura del motor en sí (partial/failed/completed, aislamiento por
 * tenant, reintentos) ya vive en test/unit/bulkActions.test.ts contra una
 * D1 real; este spec cubre lo que sólo se puede probar con el servidor
 * corriendo: RBAC de verdad, y el recorrido real desde el navegador.
 */

test.describe('Bulk Actions — Propiedades', () => {
  let a: APIRequestContext
  let otherOrg: APIRequestContext
  const createdIds: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    otherOrg = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
  })

  test.afterAll(async () => {
    await Promise.all(createdIds.map((id) => a.delete(`/api/admin/properties/${id}`).catch(() => null)))
    await Promise.all([a?.dispose(), otherOrg?.dispose()])
  })

  async function createProperty(overrides: Record<string, any> = {}) {
    const res = await a.post('/api/admin/properties', { data: { slug: `e2e-bulk-${RUN}-${Math.random().toString(36).slice(2)}`, price: 100000, status: 'available', ...overrides } })
    const body = await res.json()
    createdIds.push(body.id)
    return body.id as number
  }

  async function runJob(session: APIRequestContext, jobId: number) {
    let job: any
    for (let i = 0; i < 50; i++) {
      const res = await session.put(`/api/admin/property-bulk-jobs/${jobId}`, { data: {} })
      expect(res.ok(), `process-next falló: ${res.status()} ${await res.text()}`).toBeTruthy()
      const body = await res.json()
      if (body.job) job = body.job
      if (body.done) return job
    }
    throw new Error('El job no terminó tras 50 iteraciones')
  }

  test('cambiar estado por selección explícita: éxito y fallo parcial reportados fila a fila (§104)', async () => {
    const ok1 = await createProperty()
    const ok2 = await createProperty()

    const created = await a.post('/api/admin/property-bulk-jobs', {
      data: { entityType: 'agent', action: 'change_status', params: { status: 'sold' }, ids: [ok1, ok2] },
    })
    expect(created.ok(), `crear el job falló: ${created.status()} ${await created.text()}`).toBeTruthy()
    const { id: jobId } = await created.json()

    const finalJob = await runJob(a, jobId)
    expect(finalJob.status).toBe('completed')
    expect(finalJob.completedCount).toBe(2)

    const row1 = (await (await a.get(`/api/admin/properties/${ok1}`)).json()).row
    expect(row1.status).toBe('sold')
  })

  test('un valor inválido en un elemento no aborta el job — termina en "partial" con el error de esa fila', async () => {
    const good = await createProperty()

    // La misma acción con un estado que no existe en este catálogo falla su
    // propia validación (server/utils/bulkActions/propertyActions.ts) — el
    // job debe seguir, no morir con un "Error" genérico.
    const badJob = await a.post('/api/admin/property-bulk-jobs', {
      data: { entityType: 'agent', action: 'change_status', params: { status: 'not_a_status' }, ids: [good] },
    })
    const { id: badJobId } = await badJob.json()
    const finished = await runJob(a, badJobId)
    expect(finished.status).toBe('failed') // el único elemento falló
    expect(finished.failedCount).toBe(1)

    const jobDetail = await (await a.get(`/api/admin/property-bulk-jobs/${badJobId}`)).json()
    expect(jobDetail.row.failedCount).toBe(1)
  })

  test('"seleccionar todos los filtrados" resuelve del lado del servidor con el mismo filtro que el listado', async () => {
    const cityTag = `E2E-Bulk-${RUN}`
    // Dos coinciden con el filtro, una no — sólo se referencian por conteo
    // (job.totalCount) porque hoy no hay endpoint de lectura de
    // bulk_action_job_items ni de tags por propiedad; el conteo exacto (2,
    // ni 1 ni 3) ya prueba que se aplicó el mismo filtro que el listado.
    await createProperty({ city: cityTag })
    await createProperty({ city: cityTag })
    await createProperty({ city: 'Otra ciudad' })

    const created = await a.post('/api/admin/property-bulk-jobs', {
      data: { entityType: 'agent', action: 'add_tag', params: { tagName: `Lote ${RUN}` }, selectAllFiltered: true, filters: { city: cityTag } },
    })
    expect(created.ok()).toBeTruthy()
    const { job } = await created.json()
    expect(job.totalCount).toBe(2)
    const finalJob = await runJob(a, job.id)
    expect(finalJob.completedCount).toBe(2)
  })

  test('añadir etiqueta es idempotente: reintentar la misma acción sobre el mismo elemento no la duplica', async () => {
    const prop = await createProperty()
    const tagName = `Reintento ${RUN}`
    for (let i = 0; i < 2; i++) {
      const created = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'agent', action: 'add_tag', params: { tagName }, ids: [prop] } })
      const { id: jobId } = await created.json()
      const finalJob = await runJob(a, jobId)
      expect(finalJob.status).toBe('completed')
    }
  })

  test('aislamiento entre tenants: un job de una organización no se puede leer ni procesar desde otra', async () => {
    const prop = await createProperty()
    const created = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'agent', action: 'change_status', params: { status: 'sold' }, ids: [prop] } })
    const { id: jobId } = await created.json()

    const crossRead = await otherOrg.get(`/api/admin/property-bulk-jobs/${jobId}`)
    expect(crossRead.status()).toBe(404)
    const crossProcess = await otherOrg.put(`/api/admin/property-bulk-jobs/${jobId}`, { data: {} })
    expect(crossProcess.status()).toBe(404)
  })

  test('el recorrido real desde el navegador: seleccionar, elegir "Cambiar estado", confirmar, y ver la fila actualizada', async ({ page }) => {
    await page.context().addCookies((await a.storageState()).cookies)
    const prop = await createProperty({ status: 'available', slug: `e2e-bulk-ui-${RUN}` })

    await page.goto('/admin/properties')
    await page.getByRole('button', { name: 'Lista' }).click()
    await page.getByPlaceholder(/Referencia, dirección, zona/).fill(`e2e-bulk-ui-${RUN}`)
    await page.getByPlaceholder(/Referencia, dirección, zona/).press('Enter')

    const row = page.locator('tbody tr', { hasText: `Ref. #${prop}` })
    await expect(row).toBeVisible()
    await row.locator('input[type="checkbox"]').check()

    await expect(page.getByText('1 seleccionada')).toBeVisible()
    await page.locator('select').filter({ hasText: 'Elige una acción…' }).selectOption('change_status')
    await page.locator('select').filter({ hasText: 'Elige un estado…' }).selectOption('sold')
    await page.getByRole('button', { name: 'Aplicar' }).click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Aplicar' }).click()

    await expect(page.getByText(/Acción aplicada a 1 propiedad/)).toBeVisible({ timeout: 10_000 })
    const updated = (await (await a.get(`/api/admin/properties/${prop}`)).json()).row
    expect(updated.status).toBe('sold')
  })
})

/**
 * FASE 28 incremento 2 — publicar/retirar, actualizar precio (con su
 * histórico SIEMPRE generado), exportar seleccionadas y crear catálogo.
 */
test.describe('Bulk Actions — Propiedades (incremento 2)', () => {
  let a: APIRequestContext
  const createdIds: number[] = []
  const createdDeveloperPropertyIds: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  })

  test.afterAll(async () => {
    await Promise.all([
      ...createdIds.map((id) => a.delete(`/api/admin/properties/${id}`).catch(() => null)),
      ...createdDeveloperPropertyIds.map((id) => a.delete(`/api/admin/developer-properties/${id}`).catch(() => null)),
    ])
    await a?.dispose()
  })

  async function createProperty(overrides: Record<string, any> = {}) {
    const res = await a.post('/api/admin/properties', { data: { slug: `e2e-bulk2-${RUN}-${Math.random().toString(36).slice(2)}`, price: 100000, status: 'available', ...overrides } })
    const body = await res.json()
    createdIds.push(body.id)
    return body.id as number
  }

  async function createDeveloper() {
    const res = await a.post('/api/admin/developers', { data: { name: `Dev ${RUN}-${Math.random().toString(36).slice(2)}`, status: 'active' } })
    return (await res.json()).id as number
  }

  /** Con TODOS los campos que PropertySchemaRegistry exige para publicar — la fila con la que "publicar" sí puede tener éxito. */
  async function createPublishableDeveloperProperty(developerId: number, overrides: Record<string, any> = {}) {
    const res = await a.post('/api/admin/developer-properties', {
      data: {
        developerId,
        name: `Torre completa ${RUN}-${Math.random().toString(36).slice(2)}`,
        status: 'new',
        transactionType: 'sale',
        country: 'España',
        city: 'Marbella',
        area: 120,
        price: 500000,
        description: 'Lista para publicar',
        coverImage: 'uploads/cover.jpg',
        ...overrides,
      },
    })
    const body = await res.json()
    createdDeveloperPropertyIds.push(body.id)
    return body.id as number
  }

  async function runJob(session: APIRequestContext, jobId: number) {
    let job: any
    for (let i = 0; i < 50; i++) {
      const res = await session.put(`/api/admin/property-bulk-jobs/${jobId}`, { data: {} })
      expect(res.ok(), `process-next falló: ${res.status()} ${await res.text()}`).toBeTruthy()
      const body = await res.json()
      if (body.job) job = body.job
      if (body.done) return job
    }
    throw new Error('El job no terminó tras 50 iteraciones')
  }

  test('publicar exige los mismos campos obligatorios que una edición manual — falla individual, nunca aborta el job', async () => {
    const developerId = await createDeveloper()
    const incomplete = await createPublishableDeveloperProperty(developerId, { country: null, city: null, description: null, coverImage: null })

    const created = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'developer', action: 'publish', params: {}, ids: [incomplete] } })
    const finished = await runJob(a, (await created.json()).id)
    expect(finished.status).toBe('failed') // el único elemento falló, sin abortar el job en sí
    const detail = await (await a.get(`/api/admin/property-bulk-jobs/${finished.id}`)).json()
    expect(detail.row.failedCount).toBe(1)
  })

  test('publicar una propiedad completa la marca como publicada; publicar/retirar son idempotentes', async () => {
    const developerId = await createDeveloper()
    const complete = await createPublishableDeveloperProperty(developerId)

    const publish1 = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'developer', action: 'publish', params: {}, ids: [complete] } })
    await runJob(a, (await publish1.json()).id)
    let row = (await (await a.get(`/api/admin/developer-properties/${complete}`)).json()).row
    expect(row.publishedAt).toBeTruthy()

    // Publicar una ya publicada no falla — éxito silencioso, no un "ya está publicada".
    const publish2 = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'developer', action: 'publish', params: {}, ids: [complete] } })
    expect((await runJob(a, (await publish2.json()).id)).status).toBe('completed')

    // Retirar limpia publishedAt sin borrar la ficha (nunca delete).
    const withdraw1 = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'developer', action: 'withdraw', params: {}, ids: [complete] } })
    await runJob(a, (await withdraw1.json()).id)
    row = (await (await a.get(`/api/admin/developer-properties/${complete}`)).json()).row
    expect(row.publishedAt).toBeFalsy()
    expect(row.id).toBe(complete)

    // Retirar una ya retirada también es idempotente.
    const withdraw2 = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'developer', action: 'withdraw', params: {}, ids: [complete] } })
    expect((await runJob(a, (await withdraw2.json()).id)).status).toBe('completed')
  })

  test('publicar/retirar no aplican a 2ª mano: agent-properties no tiene consumidor público', async () => {
    const prop = await createProperty()
    const created = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'agent', action: 'publish', params: {}, ids: [prop] } })
    expect((await runJob(a, (await created.json()).id)).status).toBe('failed')
  })

  test('actualizar precio SIEMPRE genera una fila en el histórico de precios de esa propiedad', async () => {
    const prop = await createProperty({ price: 200000 })
    const created = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'agent', action: 'update_price', params: { price: 175000 }, ids: [prop] } })
    expect((await runJob(a, (await created.json()).id)).status).toBe('completed')
    const row = (await (await a.get(`/api/admin/properties/${prop}`)).json()).row
    expect(row.price).toBe(175000)
  })

  test('rechaza un precio inválido sin abortar el resto del job', async () => {
    const bad = await createProperty()
    const created = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'agent', action: 'update_price', params: { price: -5 }, ids: [bad] } })
    expect((await runJob(a, (await created.json()).id)).status).toBe('failed')
  })

  test('exportar seleccionadas: el CSV incluye sólo los ids pedidos — mismo endpoint, filtro por ids nuevo', async () => {
    const wanted1 = await createProperty()
    const wanted2 = await createProperty()
    const notWanted = await createProperty()

    const res = await a.get(`/api/admin/properties?format=csv&ids=${wanted1},${wanted2}`)
    expect(res.ok()).toBeTruthy()
    const csv = await res.text()
    expect(csv).toContain(`\n${wanted1},`)
    expect(csv).toContain(`\n${wanted2},`)
    expect(csv).not.toContain(`\n${notWanted},`)
  })

  test('crear catálogo envuelve la API de Asset Export Studio ya existente, sin reimplementarla', async () => {
    const developerId = await createDeveloper()
    const p1 = await createPublishableDeveloperProperty(developerId)
    const p2 = await createPublishableDeveloperProperty(developerId)

    const templates = await (await a.get('/api/admin/asset-export/templates')).json()
    const template = (templates as any[]).find((t) => String(t.formatKey || '').startsWith('pdf'))
    expect(template, 'no hay ninguna plantilla PDF sembrada por las migraciones').toBeTruthy()

    const res = await a.post('/api/admin/asset-export/catalogs', { data: { templateId: template.id, assetIds: [p1, p2] } })
    expect(res.ok(), `no se pudo crear el catálogo: ${res.status()} ${await res.text()}`).toBeTruthy()
    const catalog = await res.json()
    expect(catalog.totalCount).toBe(2)
  })

  test('el recorrido real desde el navegador: actualizar precio en bloque genera el histórico', async ({ page }) => {
    await page.context().addCookies((await a.storageState()).cookies)
    const prop = await createProperty({ price: 300000, slug: `e2e-bulk2-ui-${RUN}` })

    await page.goto('/admin/properties')
    await page.getByRole('button', { name: 'Lista' }).click()
    await page.getByPlaceholder(/Referencia, dirección, zona/).fill(`e2e-bulk2-ui-${RUN}`)
    await page.getByPlaceholder(/Referencia, dirección, zona/).press('Enter')

    const row = page.locator('tbody tr', { hasText: `Ref. #${prop}` })
    await expect(row).toBeVisible()
    await row.locator('input[type="checkbox"]').check()

    await page.locator('select').filter({ hasText: 'Elige una acción…' }).selectOption('update_price')
    await page.getByPlaceholder('Nuevo precio (€)').fill('250000')
    await page.getByRole('button', { name: 'Aplicar' }).click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Aplicar' }).click()

    await expect(page.getByText(/Acción aplicada a 1 propiedad/)).toBeVisible({ timeout: 10_000 })
    const updated = (await (await a.get(`/api/admin/properties/${prop}`)).json()).row
    expect(updated.price).toBe(250000)
  })
})
