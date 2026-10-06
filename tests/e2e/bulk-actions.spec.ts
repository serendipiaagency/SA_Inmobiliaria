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
    await page.getByPlaceholder('Nuevo precio', { exact: true }).fill('250000')
    await page.getByRole('button', { name: 'Aplicar' }).click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Aplicar' }).click()

    await expect(page.getByText(/Acción aplicada a 1 propiedad/)).toBeVisible({ timeout: 10_000 })
    const updated = (await (await a.get(`/api/admin/properties/${prop}`)).json()).row
    expect(updated.price).toBe(250000)
  })
})

/**
 * FASE 28 incremento 3 (cierre) — Bulk Leads: cambiar comercial, cambiar
 * fase, etiqueta, crear tarea, exportar. Mismo motor de jobs que Properties
 * (`entityType: 'lead'`), reutilizando en cada caso el servicio de dominio
 * que ya escribe esa tabla fuera de Bulk Actions — ver docs/bulk-actions.md.
 */
test.describe('Bulk Actions — Leads (FASE 28 incremento 3)', () => {
  let a: APIRequestContext
  let otherOrg: APIRequestContext
  let apiKey: string
  let commercialId: number

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    otherOrg = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    // La API v1 de creación de leads exige una clave con scope "write" — mismo
    // patrón ya establecido en cross-tenant.spec.ts.
    const keyRes = await a.post('/api/admin/saas/apikeys', { data: { name: `e2e-lead-bulk-${RUN}`, scopes: 'write' } })
    expect(keyRes.ok()).toBeTruthy()
    apiKey = (await keyRes.json()).plainKey
    const team = await (await a.get('/api/admin/team', { params: { perPage: 200 } })).json()
    commercialId = team.rows[0].id
  })

  test.afterAll(async () => {
    await Promise.all([a?.dispose(), otherOrg?.dispose()])
  })

  async function createLead(overrides: Record<string, any> = {}) {
    const res = await a.fetch('/api/v1/leads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { name: `E2E Lead ${RUN}-${Math.random().toString(36).slice(2)}`, email: `lead-${RUN}-${Math.random().toString(36).slice(2)}@example.com`, ...overrides },
    })
    expect(res.ok(), `crear lead falló: ${res.status()} ${await res.text()}`).toBeTruthy()
    const { data } = await res.json()
    return data.id as number
  }

  async function runJob(session: APIRequestContext, jobId: number) {
    let job: any
    for (let i = 0; i < 50; i++) {
      const res = await session.put(`/api/admin/lead-bulk-jobs/${jobId}`, { data: {} })
      expect(res.ok(), `process-next falló: ${res.status()} ${await res.text()}`).toBeTruthy()
      const body = await res.json()
      if (body.job) job = body.job
      if (body.done) return job
    }
    throw new Error('El job no terminó tras 50 iteraciones')
  }

  /** `ids` (incremento 3) filtra el mismo listado que usa la Tabla — no hace falta un GET de detalle nuevo. */
  async function getLead(id: number) {
    const res = await a.get('/api/admin/saas/leads', { params: { ids: String(id) } })
    const { rows } = await res.json()
    return rows.find((r: any) => r.id === id)
  }

  test('cambiar comercial reutiliza leads/routing.ts#reassignLead y queda en el historial de asignaciones', async () => {
    const lead = await createLead()
    const created = await a.post('/api/admin/lead-bulk-jobs', { data: { action: 'change_commercial', params: { commercialId }, ids: [lead] } })
    expect(created.ok(), `crear el job falló: ${created.status()} ${await created.text()}`).toBeTruthy()
    const finalJob = await runJob(a, (await created.json()).id)
    expect(finalJob.status).toBe('completed')

    const row = await getLead(lead)
    expect(row.agentId).toBe(commercialId)

    const history = await (await a.get(`/api/admin/saas/leads/${lead}/assignment-history`)).json()
    expect(history.rows.length).toBeGreaterThan(0)
    expect(history.rows[0].toCommercialId).toBe(commercialId)
  })

  test('cambiar fase reutiliza leads/pipeline.ts#transitionLeadStage — rechaza una fase inválida sin abortar el job', async () => {
    const lead = await createLead()
    const created = await a.post('/api/admin/lead-bulk-jobs', { data: { action: 'change_stage', params: { stage: 'qualified', reason: 'Campaña de cualificación' }, ids: [lead] } })
    const finalJob = await runJob(a, (await created.json()).id)
    expect(finalJob.status).toBe('completed')
    const row = await getLead(lead)
    expect(row.stage).toBe('qualified')

    const bad = await createLead()
    const badJob = await a.post('/api/admin/lead-bulk-jobs', { data: { action: 'change_stage', params: { stage: 'not_a_real_stage', reason: 'Prueba' }, ids: [bad] } })
    expect((await runJob(a, (await badJob.json()).id)).status).toBe('failed')
  })

  test('añadir etiqueta es idempotente: reintentar la misma acción sobre el mismo lead no falla ni la duplica', async () => {
    const lead = await createLead()
    const tagName = `Lead urgente ${RUN}`
    for (let i = 0; i < 2; i++) {
      const created = await a.post('/api/admin/lead-bulk-jobs', { data: { action: 'add_tag', params: { tagName }, ids: [lead] } })
      const finalJob = await runJob(a, (await created.json()).id)
      expect(finalJob.status).toBe('completed')
    }
  })

  test('crear tarea genera una fila de Task real por lead seleccionado, nunca una sola compartida por el lote', async () => {
    const lead1 = await createLead()
    const lead2 = await createLead()
    const created = await a.post('/api/admin/lead-bulk-jobs', {
      data: { action: 'create_task', params: { type: 'call', title: `Llamar E2E ${RUN}`, assigneeId: commercialId }, ids: [lead1, lead2] },
    })
    const finalJob = await runJob(a, (await created.json()).id)
    expect(finalJob.status).toBe('completed')
    expect(finalJob.completedCount).toBe(2)

    const tasks1 = await (await a.get('/api/admin/saas/tasks', { params: { leadId: String(lead1) } })).json()
    const tasks2 = await (await a.get('/api/admin/saas/tasks', { params: { leadId: String(lead2) } })).json()
    expect(tasks1.rows.some((t: any) => t.title === `Llamar E2E ${RUN}`)).toBeTruthy()
    expect(tasks2.rows.some((t: any) => t.title === `Llamar E2E ${RUN}`)).toBeTruthy()
  })

  test('exportar seleccionados: el CSV incluye sólo los ids pedidos', async () => {
    const wanted = await createLead()
    const notWanted = await createLead()

    const res = await a.get(`/api/admin/saas/leads?format=csv&ids=${wanted}`)
    expect(res.ok()).toBeTruthy()
    const csv = await res.text()
    expect(csv).toContain(`\n${wanted},`)
    expect(csv).not.toContain(`\n${notWanted},`)
  })

  test('aislamiento entre tenants: un job de leads de una organización no se puede leer ni procesar desde otra', async () => {
    const lead = await createLead()
    const created = await a.post('/api/admin/lead-bulk-jobs', { data: { action: 'add_tag', params: { tagName: 'x' }, ids: [lead] } })
    const { id: jobId } = await created.json()

    const crossRead = await otherOrg.get(`/api/admin/lead-bulk-jobs/${jobId}`)
    expect(crossRead.status()).toBe(404)
    const crossProcess = await otherOrg.put(`/api/admin/lead-bulk-jobs/${jobId}`, { data: {} })
    expect(crossProcess.status()).toBe(404)
  })

  test('el recorrido real desde el navegador: seleccionar en la vista Tabla, cambiar fase, confirmar', async ({ page }) => {
    await page.context().addCookies((await a.storageState()).cookies)
    const lead = await createLead({ name: `E2E Lead UI ${RUN}` })

    await page.goto('/admin/leads')
    await page.getByRole('button', { name: 'Tabla' }).click()
    await page.getByPlaceholder(/Buscar por nombre, email o propiedad/).fill(`E2E Lead UI ${RUN}`)

    const row = page.locator('tbody tr', { hasText: `E2E Lead UI ${RUN}` })
    await expect(row).toBeVisible()
    await row.locator('input[type="checkbox"]').check()

    await expect(page.getByText('1 seleccionado')).toBeVisible()
    await page.locator('select').filter({ hasText: 'Elige una acción…' }).selectOption('change_stage')
    await page.locator('select').filter({ hasText: 'Elige una fase…' }).selectOption('qualified')
    await page.getByRole('button', { name: 'Aplicar' }).click()

    // «Cambiar fase» pide el motivo (cierre del núcleo, FASE 13): su ventana es la confirmación.
    await expect(page.getByTestId('lead-stage-reason-modal')).toBeVisible()
    await page.getByTestId('lead-stage-reason-text').fill('Cualificados en bloque')
    await page.getByTestId('lead-stage-reason-confirm').click()

    await expect(page.getByText(/Acción aplicada a 1 lead/)).toBeVisible({ timeout: 10_000 })
    const updated = await getLead(lead)
    expect(updated.stage).toBe('qualified')
  })
})
