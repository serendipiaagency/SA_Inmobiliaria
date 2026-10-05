import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Núcleo inmobiliario, bloque N7b: campos personalizados (definición por
 * agencia y valores en las fichas, públicos sólo los marcados), etiquetas a
 * mano en propiedades, leads y contactos (verlas, añadir, quitar, filtrar),
 * búsqueda geográfica (radio, zona visible y coordenadas) y los filtros que
 * faltaban en el listado de propiedades de los dos catálogos, el listado de
 * leads paginado con exportación completa y el filtro por comercial de las
 * Domain Tools con obra nueva — y nada cruza de agencia (404).
 *
 * Todo por rutas que ya existían (presupuesto de rutas de Nitro = 0): el
 * motor genérico (`custom-fields`, `property-custom-field-values`,
 * `custom-field-values`, `property-tags`, `crm-tags`), `?view=map|filterOptions`
 * del listado de propiedades, `page`/`perPage`/`tags` de saas/leads y saas/contacts.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const KEY = `n7b_${RUN.replace(/[^0-9]/g, '').slice(-9)}`

test.describe('N7b — campos personalizados, etiquetas, búsqueda geográfica y filtros', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let developerId: number
  let devProperty: { id: number; slug: string }
  let agentPropertyId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    developerId = (await (await a.post('/api/admin/developers', { data: { name: `Dev N7b ${RUN}`, email: `dev-n7b-${RUN}@mm.test`, status: 'active' } })).json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))

    // Puerta del Sol (Madrid): obra nueva y 2ª mano en el mismo sitio.
    const dev = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Torre N7b ${RUN}`, status: 'new', price: 510000, lat: 40.4168, lng: -3.7038, city: 'Madrid', transactionType: 'sale' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const devId = (await dev.json()).id
    devProperty = { id: devId, slug: (await (await a.get(`/api/admin/developer-properties/${devId}`)).json()).row.slug }
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${devId}?hard=1`))
    const agent = await a.post('/api/admin/properties', { data: { slug: `n7b-${RUN}`, price: 320000, status: 'available', transactionType: 'sale', lat: 40.4153, lng: -3.6845, city: 'Madrid' } })
    expect(agent.ok(), await agent.text()).toBeTruthy()
    agentPropertyId = (await agent.json()).id
    cleanup.push(() => a.delete(`/api/admin/properties/${agentPropertyId}?hard=1`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
    await anon?.dispose()
  })

  async function createField(ctx: APIRequestContext, data: Record<string, unknown>) {
    const res = await ctx.post('/api/admin/custom-fields', { data })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    cleanup.push(() => ctx.delete(`/api/admin/custom-fields/${id}?hard=1`))
    return id
  }

  test('definiciones: validación, clave única y aislamiento', async () => {
    // Una lista sin opciones no se guarda; «público» sólo en propiedades.
    expect((await a.post('/api/admin/custom-fields', { data: { entityType: 'lead', label: 'Perfil', fieldType: 'select' } })).status()).toBe(422)
    expect((await a.post('/api/admin/custom-fields', { data: { entityType: 'contact', label: 'Web', fieldType: 'text', isPublic: 1 } })).status()).toBe(422)

    const id = await createField(a, { entityType: 'lead', key: `${KEY}_perfil`, label: 'Perfil inversor', fieldType: 'select', optionsJson: ['Conservador', 'Agresivo'], section: 'Perfil' })
    expect((await a.post('/api/admin/custom-fields', { data: { entityType: 'lead', key: `${KEY}_perfil`, label: 'Otro', fieldType: 'text' } })).status()).toBe(409)
    // La clave no cambia.
    expect((await a.put(`/api/admin/custom-fields/${id}`, { data: { key: 'otra' } })).status()).toBe(422)
    // Otra agencia ni la lee ni la toca ni la lista.
    expect((await b.get(`/api/admin/custom-fields/${id}`)).status()).toBe(404)
    expect((await b.put(`/api/admin/custom-fields/${id}`, { data: { label: 'intruso' } })).status()).toBe(404)
    expect((await b.delete(`/api/admin/custom-fields/${id}`)).status()).toBe(404)
    const listB = await (await b.get('/api/admin/custom-fields', { params: { entityType: 'lead', perPage: '100' } })).json()
    expect(listB.rows.some((r: any) => r.id === id)).toBe(false)
  })

  test('valores en la ficha de propiedad (los dos catálogos): validación por tipo, públicos en la web, 404 entre agencias', async () => {
    await createField(a, { entityType: 'property', key: `${KEY}_vistas`, label: `Vistas ${RUN}`, fieldType: 'select', optionsJson: ['Mar', 'Montaña'], isPublic: 1 })
    await createField(a, { entityType: 'property', key: `${KEY}_comision`, label: `Comisión ${RUN}`, fieldType: 'number' })

    // Tipo equivocado → 422.
    const bad = await a.post('/api/admin/property-custom-field-values', { data: { entityType: 'property', entityKind: 'developer', entityId: devProperty.id, values: { [`${KEY}_vistas`]: 'Luna' } } })
    expect(bad.status()).toBe(422)
    const saved = await a.post('/api/admin/property-custom-field-values', {
      data: { entityType: 'property', entityKind: 'developer', entityId: devProperty.id, values: { [`${KEY}_vistas`]: 'Mar', [`${KEY}_comision`]: '3,5' } },
    })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    expect((await saved.json()).values).toMatchObject({ [`${KEY}_vistas`]: 'Mar', [`${KEY}_comision`]: 3.5 })
    const agentSave = await a.post('/api/admin/property-custom-field-values', { data: { entityType: 'property', entityKind: 'agent', entityId: agentPropertyId, values: { [`${KEY}_vistas`]: 'Montaña' } } })
    expect(agentSave.ok(), await agentSave.text()).toBeTruthy()

    // Web pública: el campo público sí, la comisión nunca.
    const pub = await (await anon.get(`/api/public/properties/${devProperty.slug}`)).json()
    const labels = (pub.customFields || []).map((f: any) => f.label)
    expect(labels).toContain(`Vistas ${RUN}`)
    expect(labels).not.toContain(`Comisión ${RUN}`)

    // Otra agencia: ni leer ni escribir los campos de esta propiedad; tampoco por el recurso de CRM.
    expect((await b.get('/api/admin/property-custom-field-values', { params: { entityType: 'property', entityKind: 'developer', entityId: String(devProperty.id) } })).status()).toBe(404)
    expect((await b.post('/api/admin/property-custom-field-values', { data: { entityType: 'property', entityKind: 'developer', entityId: devProperty.id, values: {} } })).status()).toBe(404)
    expect((await a.get('/api/admin/custom-field-values', { params: { entityType: 'property', entityKind: 'developer', entityId: String(devProperty.id) } })).status()).toBe(404)

    // Filtrar el listado por el campo personalizado.
    const opts = await (await a.get('/api/admin/developer-properties', { params: { view: 'filterOptions' } })).json()
    const def = opts.customFields.find((d: any) => d.key === `${KEY}_vistas`)
    expect(def).toBeTruthy()
    const filtered = await (await a.get('/api/admin/developer-properties', { params: { [`cf_${def.id}`]: 'Mar' } })).json()
    expect(filtered.rows.map((r: any) => r.id)).toContain(devProperty.id)
    const none = await (await a.get('/api/admin/developer-properties', { params: { [`cf_${def.id}`]: 'Montaña' } })).json()
    expect(none.rows.map((r: any) => r.id)).not.toContain(devProperty.id)
  })

  test('campos de contacto con obligatorio, de lead, de cita y de operación', async () => {
    await createField(a, { entityType: 'contact', key: `${KEY}_dni`, label: 'DNI', fieldType: 'text', isRequired: 1 })
    const contact = await (await a.post('/api/admin/saas/contacts', { data: { name: `Contacto N7b ${RUN}`, email: `c-n7b-${RUN}@example.com` } })).json()
    cleanup.push(() => a.delete(`/api/admin/contacts/${contact.id}?hard=1`))
    expect((await a.post('/api/admin/custom-field-values', { data: { entityType: 'contact', entityId: contact.id, values: { [`${KEY}_dni`]: '' } } })).status()).toBe(422)
    const ok = await a.post('/api/admin/custom-field-values', { data: { entityType: 'contact', entityId: contact.id, values: { [`${KEY}_dni`]: '12345678Z' } } })
    expect(ok.ok(), await ok.text()).toBeTruthy()
    const back = await (await a.get('/api/admin/custom-field-values', { params: { entityType: 'contact', entityId: String(contact.id) } })).json()
    expect(back.values[`${KEY}_dni`]).toBe('12345678Z')
    expect((await b.get('/api/admin/custom-field-values', { params: { entityType: 'contact', entityId: String(contact.id) } })).status()).toBe(404)
    // Un valor no se edita fila a fila.
    expect((await a.put('/api/admin/custom-field-values/1', { data: {} })).status()).toBe(405)
  })

  test('etiquetas a mano: contacto (nuevo), lead y propiedad — se ven, se filtran, se quitan; nada cruza de agencia', async () => {
    const contact = await (await a.post('/api/admin/saas/contacts', { data: { name: `Etiquetado N7b ${RUN}`, email: `t-n7b-${RUN}@example.com` } })).json()
    cleanup.push(() => a.delete(`/api/admin/contacts/${contact.id}?hard=1`))
    const added = await a.post('/api/admin/crm-tags', { data: { entityType: 'contact', entityId: contact.id, name: `VIP ${RUN}` } })
    expect(added.ok(), await added.text()).toBeTruthy()
    const { tag, tags } = await added.json()
    expect(tags.map((t: any) => t.name)).toEqual([`VIP ${RUN}`])

    // Se ve en el listado y se filtra.
    const list = await (await a.get('/api/admin/saas/contacts', { params: { tags: String(tag.id) } })).json()
    expect(list.map((c: any) => c.id)).toEqual([contact.id])
    expect(list[0].tags.map((t: any) => t.name)).toEqual([`VIP ${RUN}`])

    // Lead y propiedad con la misma etiqueta.
    const lead = await (await a.post('/api/admin/leads', { data: { name: `Lead N7b ${RUN}`, email: `l-n7b-${RUN}@example.com`, source: 'web' } })).json()
    expect((await a.post('/api/admin/crm-tags', { data: { entityType: 'lead', entityId: lead.id, tagId: tag.id } })).ok()).toBeTruthy()
    const leads = await (await a.get('/api/admin/saas/leads', { params: { tags: String(tag.id) } })).json()
    expect(leads.rows.map((r: any) => r.id)).toEqual([lead.id])
    expect(leads.rows[0].tags.map((t: any) => t.id)).toEqual([tag.id])
    expect((await a.post('/api/admin/property-tags', { data: { entityType: 'agent', entityId: agentPropertyId, tagId: tag.id } })).ok()).toBeTruthy()
    const props = await (await a.get('/api/admin/properties', { params: { tags: String(tag.id) } })).json()
    expect(props.rows.map((r: any) => r.id)).toEqual([agentPropertyId])
    expect(props.rows[0].tags.map((t: any) => t.name)).toContain(`VIP ${RUN}`)

    // Otra agencia: ni etiqueta lo nuestro, ni usa nuestra etiqueta, ni quita el enlace, ni lo ve.
    expect((await b.post('/api/admin/crm-tags', { data: { entityType: 'contact', entityId: contact.id, name: 'Intruso' } })).status()).toBe(404)
    const contactB = await (await b.post('/api/admin/saas/contacts', { data: { name: `B N7b ${RUN}`, email: `b-n7b-${RUN}@example.com` } })).json()
    expect((await b.post('/api/admin/crm-tags', { data: { entityType: 'contact', entityId: contactB.id, tagId: tag.id } })).status()).toBe(404)
    await b.delete(`/api/admin/contacts/${contactB.id}?hard=1`)
    const link = (await (await a.get('/api/admin/crm-tags', { params: { entityType: 'contact', entityId: String(contact.id) } })).json()).rows[0]
    expect((await b.delete(`/api/admin/crm-tags/${link.linkId}`)).status()).toBe(404)
    // El recurso de propiedades no quita etiquetas de contactos.
    expect((await a.delete(`/api/admin/property-tags/${link.linkId}`)).status()).toBe(404)

    // Quitar.
    expect((await a.delete(`/api/admin/crm-tags/${link.linkId}`)).ok()).toBeTruthy()
    expect((await (await a.get('/api/admin/crm-tags', { params: { entityType: 'contact', entityId: String(contact.id) } })).json()).rows).toEqual([])
  })

  test('búsqueda geográfica en el panel (los dos catálogos): radio, zona visible, coordenadas y vista mapa', async () => {
    for (const [resource, id] of [
      ['developer-properties', devProperty.id],
      ['properties', agentPropertyId],
    ] as const) {
      const near = await (await a.get(`/api/admin/${resource}`, { params: { lat: '40.4168', lng: '-3.7038', radiusKm: '3', sort: 'distance', perPage: '100' } })).json()
      const row = near.rows.find((r: any) => r.id === id)
      expect(row, `${resource} debería estar a menos de 3 km de Sol`).toBeTruthy()
      expect(row.distanceKm).toBeLessThan(3)
      const far = await (await a.get(`/api/admin/${resource}`, { params: { lat: '39.8628', lng: '-4.0273', radiusKm: '5' } })).json()
      expect(far.rows.map((r: any) => r.id)).not.toContain(id)
      const box = await (await a.get(`/api/admin/${resource}`, { params: { north: '40.45', south: '40.38', east: '-3.65', west: '-3.75', perPage: '100' } })).json()
      expect(box.rows.map((r: any) => r.id)).toContain(id)
      const map = await (await a.get(`/api/admin/${resource}`, { params: { view: 'map', north: '40.45', south: '40.38', east: '-3.65', west: '-3.75' } })).json()
      expect(map.points.map((p: any) => p.id)).toContain(id)
      // Mal formada → 422, nunca «todas».
      expect((await a.get(`/api/admin/${resource}`, { params: { lat: '40', lng: '-3', radiusKm: '9999' } })).status()).toBe(422)
    }
    // La otra agencia no ve estas propiedades en su mapa.
    const mapB = await (await b.get('/api/admin/developer-properties', { params: { view: 'map', lat: '40.4168', lng: '-3.7038', radiusKm: '1' } })).json()
    expect(mapB.points.map((p: any) => p.id)).not.toContain(devProperty.id)

    // Web pública: zona visible del mapa.
    const pub = await (await anon.get('/api/public/properties', { params: { view: 'map', perPage: '300', north: '40.45', south: '40.38', east: '-3.65', west: '-3.75' } })).json()
    expect(pub.rows.map((r: any) => r.id)).toContain(devProperty.id)
  })

  test('filtros de la FASE 27: comercial, oficina, operación en obra nueva y características', async () => {
    const team = await (await a.get('/api/admin/team', { params: { perPage: '1' } })).json()
    const commercialId = team.rows[0]?.id
    test.skip(!commercialId, 'La agencia de pruebas no tiene comerciales')
    expect((await a.put(`/api/admin/developer-properties/${devProperty.id}`, { data: { agentId: commercialId, hasPool: 1 } })).ok()).toBeTruthy()
    const byAgent = await (await a.get('/api/admin/developer-properties', { params: { agentId: String(commercialId), perPage: '100' } })).json()
    expect(byAgent.rows.map((r: any) => r.id)).toContain(devProperty.id)
    const withPool = await (await a.get('/api/admin/developer-properties', { params: { features: 'pool', transactionType: 'sale', perPage: '100' } })).json()
    expect(withPool.rows.map((r: any) => r.id)).toContain(devProperty.id)
    const rent = await (await a.get('/api/admin/developer-properties', { params: { transactionType: 'rent', perPage: '100' } })).json()
    expect(rent.rows.map((r: any) => r.id)).not.toContain(devProperty.id)

    // Domain Tools (FASE 31): el filtro por comercial ya no excluye obra nueva.
    const tool = await (await a.post('/api/admin/domain-tools', { data: { tool: 'search_properties', input: { commercialId, catalog: 'developer', limit: 20 } } })).json()
    expect(tool.ok).toBe(true)
    expect(tool.output.results.map((r: any) => r.id)).toContain(devProperty.id)
  })

  test('leads: la Tabla pagina con el total real y el CSV exporta todo el filtro', async () => {
    const tag = `Export N7b ${RUN}`
    const created: number[] = []
    for (let i = 0; i < 3; i++) {
      const lead = await (await a.post('/api/admin/leads', { data: { name: `${tag} ${i}`, email: `exp-${i}-${RUN}@example.com`, source: 'web', force: true } })).json()
      created.push(lead.id)
    }
    const page1 = await (await a.get('/api/admin/saas/leads', { params: { search: tag, page: '1', perPage: '2' } })).json()
    expect(page1).toMatchObject({ total: 3, page: 1, perPage: 2 })
    expect(page1.rows).toHaveLength(2)
    const page2 = await (await a.get('/api/admin/saas/leads', { params: { search: tag, page: '2', perPage: '2' } })).json()
    expect(page2.rows).toHaveLength(1)
    const csv = await (await a.get('/api/admin/saas/leads', { params: { search: tag, format: 'csv' } })).text()
    for (const id of created) expect(csv).toContain(`\n${id},`)
    expect(csv.split('\n')[0]).toContain('tags')
  })

  test('en el navegador: Campos personalizados en el menú de CRM y el mapa del listado de propiedades', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/campos-personalizados`)
    await expect(page.getByRole('heading', { name: 'Campos personalizados' })).toBeVisible()
    await page.getByTestId('custom-fields-tab-lead').click()
    await expect(page.getByTestId(`custom-field-row-${KEY}_perfil`).or(page.getByTestId('custom-fields-list-empty'))).toBeVisible()

    await page.goto(`${BASE_URL}/admin/developer-properties`)
    await page.getByTestId('property-map-toggle').click()
    await expect(page.getByTestId('property-list-map')).toBeVisible()
    await expect(page.getByTestId('map-search-area')).toBeVisible()
  })
})
