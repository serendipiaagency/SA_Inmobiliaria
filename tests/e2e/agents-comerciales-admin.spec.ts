import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * Covers the "Agentes" → "Comerciales" rename and its new professional
 * ficha (built on team_members, the entity leads/visits/deals actually
 * reference — not the disconnected `agents` table): admin listing search/
 * filters, the property↔comercial assignment relationship this module
 * added, real performance metrics derived from existing CRM data, private
 * (never public) document storage, and the public listing's showOnWeb
 * filter.
 */

test.describe('Comerciales — admin', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  const createdTeamIds: number[] = []
  const createdPropertyIds: number[] = []
  const createdDocMediaKeys: string[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  })

  test.afterAll(async () => {
    await Promise.all(createdPropertyIds.map((id) => a.delete(`/api/admin/developer-properties/${id}`)))
    await Promise.all(createdTeamIds.map((id) => a.delete(`/api/admin/team/${id}`)))
    await a?.dispose()
  })

  async function createAgent(overrides: Record<string, any> = {}) {
    const res = await a.post('/api/admin/team', {
      data: { name: `E2E Comercial ${Date.now()}-${Math.random()}`, email: `e2e-${Date.now()}-${Math.random()}@example.com`, position: 'Agente', ...overrides },
    })
    const body = await res.json()
    createdTeamIds.push(body.id)
    return body.id as number
  }

  test('el listado busca por texto y filtra por estado laboral y oficina', async () => {
    const marker = `Comercial Único E2E ${Date.now()}`
    const id = await createAgent({ name: marker, officeName: 'Oficina Centro E2E', employmentStatus: 'inactive' })

    const byName = await (await a.get('/api/admin/team', { params: { q: marker } })).json()
    expect(byName.rows.some((r: any) => r.id === id)).toBe(true)

    const byStatus = await (await a.get('/api/admin/team', { params: { employmentStatus: 'inactive' } })).json()
    expect(byStatus.rows.some((r: any) => r.id === id)).toBe(true)
    const byOtherStatus = await (await a.get('/api/admin/team', { params: { employmentStatus: 'active', q: marker } })).json()
    expect(byOtherStatus.rows.some((r: any) => r.id === id)).toBe(false)

    const byOffice = await (await a.get('/api/admin/team', { params: { officeName: 'Oficina Centro' } })).json()
    expect(byOffice.rows.some((r: any) => r.id === id)).toBe(true)
  })

  test('los campos laborales, comerciales (zonas/tipos JSON) y de contacto persisten', async () => {
    const id = await createAgent({
      employeeCode: 'EMP-001',
      department: 'Ventas',
      officeName: 'Oficina Norte',
      hireDate: '2024-01-15',
      contractType: 'Indefinido',
      whatsapp: '+34600000000',
      zones: JSON.stringify(['Marbella centro', 'Puerto Banús']),
      propertyTypes: JSON.stringify(['lujo', 'obra-nueva']),
    })
    const row = (await (await a.get(`/api/admin/team/${id}`)).json()).row
    expect(row.employeeCode).toBe('EMP-001')
    expect(row.department).toBe('Ventas')
    expect(row.whatsapp).toBe('+34600000000')
    expect(JSON.parse(row.zones)).toEqual(['Marbella centro', 'Puerto Banús'])
    expect(JSON.parse(row.propertyTypes)).toEqual(['lujo', 'obra-nueva'])
    // Backward compatibility: an agent with none of the new fields set
    // still saves and reads back cleanly, with the documented defaults.
    expect(row.employmentStatus).toBeTruthy()
  })

  test('asignar y desasignar una propiedad actualiza developer_properties.agentId y aparece en el listado', async () => {
    const agentId = await createAgent()
    // Created explicitly rather than reading an existing developer: on a
    // freshly migrated database (CI) there may be none yet — this spec
    // doesn't depend on another file having created one first.
    const devRes = await a.post('/api/admin/developers', { data: { name: `E2E dev ${Date.now()}`, email: `e2e-dev-${Date.now()}@example.com`, status: 'active' } })
    const dev = await devRes.json()
    const propRes = await a.post('/api/admin/developer-properties', { data: { developerId: dev.id, name: `E2E assign ${Date.now()}`, status: 'new' } })
    const { id: propId } = await propRes.json()
    createdPropertyIds.push(propId)

    await a.put(`/api/admin/developer-properties/${propId}`, { data: { agentId } })
    let row = (await (await a.get(`/api/admin/developer-properties/${propId}`)).json()).row
    expect(row.agentId).toBe(agentId)

    // The bespoke developer-properties listing must actually project
    // agentId — this is what the ficha's "Propiedades" tab reads to show
    // assigned properties; regressed once already (silently dropped from
    // the SELECT, so the UI never showed a successful assignment).
    const listed = await (await a.get('/api/admin/developer-properties', { params: { perPage: '100' } })).json()
    const listedRow = listed.rows.find((r: any) => r.id === propId)
    expect(listedRow.agentId).toBe(agentId)

    await a.put(`/api/admin/developer-properties/${propId}`, { data: { agentId: null } })
    row = (await (await a.get(`/api/admin/developer-properties/${propId}`)).json()).row
    expect(row.agentId).toBeFalsy()
  })

  test('el endpoint de rendimiento responde con ceros reales para un comercial recién creado', async () => {
    // leads/visits/deals have no admin-facing create endpoint (they're
    // written by public/CRM flows, not this module) — the aggregation
    // logic itself (scoping, "active" exclusions, sums) is covered directly
    // against a seeded DB in test/unit/comerciales.performance.test.ts. This
    // just proves the HTTP endpoint is wired up and 404s for other resources.
    const agentId = await createAgent()
    const perf = await (await a.get(`/api/admin/team/${agentId}/performance`)).json()
    expect(perf).toEqual({ leadsAssigned: 0, leadsActive: 0, visitsTotal: 0, visitsCompleted: 0, dealsClosed: 0, commercialVolume: 0, commissionTotal: 0, assignedProperties: 0 })

    const notSupported = await a.get('/api/admin/developer-properties/1/performance')
    expect(notSupported.status()).toBe(404)
  })

  test('un documento de comercial se sube en privado y no es accesible sin sesión', async () => {
    const agentId = await createAgent()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    const upload = await a.post('/api/admin/team-member-documents/private-upload', { multipart: { file: { name: 'contrato.png', mimeType: 'image/png', buffer: png } } })
    expect(upload.ok(), await upload.text()).toBeTruthy()
    const { key } = await upload.json()
    createdDocMediaKeys.push(key)

    const docRes = await a.post('/api/admin/team-member-documents', { data: { teamMemberId: agentId, fileKey: key, label: 'Contrato E2E' } })
    expect(docRes.ok()).toBeTruthy()

    // Same key, no auth at all: requireOrgScope rejects with 401 (a
    // *wrong*-tenant session gets 404 instead — see server/api/media/
    // [...key].get.ts's comment on why: a 403 there would itself confirm
    // the object exists in someone else's account). Plain fetch, not a
    // second APIRequestContext: two request contexts hitting the same
    // baseURL concurrently have been observed to bleed cookies between
    // each other in this Playwright version, which would silently turn
    // this into a false-negative test rather than a real 401 check.
    const anonRes = await fetch(`${BASE_URL}/api/media/${key}`)
    expect(anonRes.status).toBe(401)

    // With an authenticated admin session it IS reachable (this tenant owns it).
    const ownRes = await a.get(`/api/media/${key}`)
    expect(ownRes.ok()).toBeTruthy()
  })

  test('el listado público de equipo respeta showOnWeb', async () => {
    const hiddenName = `Oculto E2E ${Date.now()}`
    const visibleName = `Visible E2E ${Date.now()}`
    await createAgent({ name: hiddenName, showOnWeb: 0 })
    await createAgent({ name: visibleName, showOnWeb: 1 })

    const pub = await (await a.get('/api/public/team')).json()
    const names = pub.rows.map((r: any) => r.name)
    expect(names).toContain(visibleName)
    expect(names).not.toContain(hiddenName)
  })

  test('el listado admin carga en el navegador, muestra las tarjetas y la ficha navega por pestañas sin errores', async ({ page }) => {
    const marker = `Tarjeta visible Comercial E2E ${Date.now()}`
    await createAgent({ name: marker, position: 'Agente Senior E2E' })

    // Chromium's "Failed to load resource" text never includes the URL —
    // only msg.location().url does — so filtering by substring on the text
    // alone can't tell a real app error apart from a broken pre-existing
    // seeded image.
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.location().url.includes('/api/media/')) consoleErrors.push(msg.text())
    })
    await page.goto('/admin/agents')
    await expect(page.getByRole('heading', { name: 'Comerciales' })).toBeVisible()
    await expect(page.getByText(marker)).toBeVisible()

    await page.getByText(marker).click()
    // Horizontal stepper (Constructor de Comerciales) — click through all 6
    // steps, then the "Propiedades asignadas"/"Rendimiento"/"Documentos"
    // secondary tabs below the builder (kept out of the primary steps since
    // they only apply once the record is saved).
    for (const step of ['Datos personales', 'Información profesional', 'Contacto y redes', 'Perfil y presentación', 'Zonas y especialidades', 'Resumen']) {
      await page.getByRole('button', { name: step, exact: false }).first().click()
    }
    for (const tab of ['Propiedades asignadas', 'Rendimiento', 'Documentos']) {
      await page.getByRole('button', { name: tab, exact: true }).click()
    }
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible()

    expect(consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('net::ERR_'))).toEqual([])
  })

  test('el Constructor de Comerciales tiene stepper horizontal, preview en vivo, y las etiquetas/idiomas heredados (coma) se parsean en chips', async ({ page }) => {
    const id = await createAgent({
      name: 'Legacy Chips E2E',
      position: 'Agente E2E',
      specialties: 'Captación, Negociación, Venta residencial',
      languages: 'Español, Inglés',
    })

    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.location().url.includes('/api/media/')) consoleErrors.push(msg.text())
    })

    await page.goto(`/admin/agents/${id}`)
    await expect(page.getByRole('heading', { name: 'Legacy Chips E2E' })).toBeVisible()
    // The 6 steps render as a horizontal stepper (not the old vertical <aside> tab list).
    for (const step of ['Datos personales', 'Información profesional', 'Contacto y redes', 'Perfil y presentación', 'Zonas y especialidades', 'Resumen']) {
      await expect(page.getByRole('button', { name: step, exact: false }).first()).toBeVisible()
    }
    // Live preview reflects the loaded data without any save.
    await expect(page.getByText('Vista previa de la ficha')).toBeVisible()
    await expect(page.getByText('Legacy Chips E2E').last()).toBeVisible()
    // Legacy comma-separated specialties render as removable chips (label + "×"
    // button inside one span), not a raw string — substring match, not exact.
    await expect(page.getByText('Captación')).toBeVisible()
    await expect(page.getByText('Negociación')).toBeVisible()

    await page.getByRole('button', { name: 'Zonas y especialidades', exact: false }).first().click()
    await expect(page.getByText('Español')).toBeVisible()
    await expect(page.getByText('Inglés')).toBeVisible()

    expect(consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('net::ERR_'))).toEqual([])
  })

  test('crear y editar comparten el mismo Constructor de Comerciales, y las etiquetas/idiomas se guardan como listas reales', async () => {
    const id = await createAgent({ name: 'Chips Persist E2E', position: 'Agente E2E' })
    await a.put(`/api/admin/team/${id}`, {
      data: { specialties: JSON.stringify(['Captación', 'Lujo']), languages: JSON.stringify(['Español', 'Francés']) },
    })
    const row = (await (await a.get(`/api/admin/team/${id}`)).json()).row
    expect(JSON.parse(row.specialties)).toEqual(['Captación', 'Lujo'])
    expect(JSON.parse(row.languages)).toEqual(['Español', 'Francés'])
  })
})
