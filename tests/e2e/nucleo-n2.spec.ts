import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Núcleo inmobiliario, bloque N2 (FASES 8-9): Contact editable con roles
 * múltiples, PropertyContact (propietarios con %), notas y la ficha 360 del
 * contacto con todas sus pestañas.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const visible = (page: import('@playwright/test').Page, testId: string) => page.locator(`[data-testid="${testId}"]:visible`)

test.describe('N2 — Contactos CRM 360, propietarios y notas', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let propertyId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    const p = await a.post('/api/admin/properties', { data: { slug: `n2-prop-${RUN}`, propertyType: 'Apartment', price: 250000, city: 'E2E-N2' } })
    expect(p.ok(), await p.text()).toBeTruthy()
    propertyId = (await p.json()).id
    cleanup.push(() => a.delete(`/api/admin/properties/${propertyId}`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
  })

  test('contacto: alta con roles, edición de la cabecera, duplicado 409 y aislamiento', async () => {
    const created = await a.post('/api/admin/contacts', { data: { name: `Lucía ${RUN}`, phone: `+3460${RUN.slice(-7)}`, roles: ['buyer', 'investor'] } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const id = (await created.json()).id
    const other = await a.post('/api/admin/contacts', { data: { name: `Otro ${RUN}`, email: `otro-${RUN}@mm.test` } })
    const otherId = (await other.json()).id

    const edit = await a.put(`/api/admin/contacts/${id}`, { data: { country: 'Francia', language: 'fr', source: 'portal', nextActionType: 'call', nextActionAt: '2030-01-15 10:00', roles: ['buyer', 'seller'] } })
    expect(edit.ok(), await edit.text()).toBeTruthy()
    const row = (await (await a.get(`/api/admin/contacts/${id}`)).json()).row
    expect(row).toMatchObject({ country: 'Francia', language: 'fr', source: 'portal', nextActionType: 'call', nextActionAt: '2030-01-15 10:00' })
    expect(row.roles).toEqual(['buyer', 'seller'])

    // El email de OTRA persona de la agencia: 409 con el candidato; con force, se guarda.
    const dup = await a.put(`/api/admin/contacts/${id}`, { data: { email: `OTRO-${RUN}@mm.test` } })
    expect(dup.status()).toBe(409)
    expect((await dup.json()).data.duplicates[0].contactId).toBe(otherId)

    // Otra agencia no lo ve ni lo edita.
    expect((await b.get(`/api/admin/contacts/${id}`)).status()).toBe(404)
    expect((await b.put(`/api/admin/contacts/${id}`, { data: { country: 'X' } })).status()).toBe(404)

    // Filtro por rol en el listado de Contactos.
    const sellers = await (await a.get('/api/admin/saas/contacts', { params: { search: `Lucía ${RUN}`, role: 'seller' } })).json()
    expect(sellers.map((c: any) => c.id)).toContain(id)
    const owners = await (await a.get('/api/admin/saas/contacts', { params: { search: `Lucía ${RUN}`, role: 'owner' } })).json()
    expect(owners.map((c: any) => c.id)).not.toContain(id)
  })

  test('propietarios de una propiedad: % que no pasa del 100, rol automático y ficha 360', async () => {
    const ana = (await (await a.post('/api/admin/contacts', { data: { name: `Ana Propietaria ${RUN}`, email: `ana-${RUN}@mm.test` } })).json()).id
    const luis = (await (await a.post('/api/admin/contacts', { data: { name: `Luis Copropietario ${RUN}`, email: `luis-${RUN}@mm.test` } })).json()).id

    const o1 = await a.post('/api/admin/property-contacts', { data: { propertyKind: 'agent', propertyId, contactId: ana, role: 'owner', ownershipPct: 70 } })
    expect(o1.ok(), await o1.text()).toBeTruthy()
    expect((await a.post('/api/admin/property-contacts', { data: { propertyKind: 'agent', propertyId, contactId: luis, role: 'co_owner', ownershipPct: 40 } })).status()).toBe(422)
    expect((await a.post('/api/admin/property-contacts', { data: { propertyKind: 'agent', propertyId, contactId: luis, role: 'co_owner', ownershipPct: 30 } })).ok()).toBeTruthy()

    const list = await (await a.get('/api/admin/property-contacts', { params: { propertyKind: 'agent', propertyId } })).json()
    expect(list.rows.map((r: any) => r.contact?.name).sort()).toEqual([`Ana Propietaria ${RUN}`, `Luis Copropietario ${RUN}`])

    // Vincular como propietario le da el rol «Propietario».
    expect((await (await a.get(`/api/admin/contacts/${ana}`)).json()).row.roles).toContain('owner')
    // Y la propiedad aparece en su ficha 360.
    const ficha = await (await a.get(`/api/admin/saas/contacts/${ana}`)).json()
    expect(ficha.properties[0]).toMatchObject({ propertyKind: 'agent', role: 'owner', ownershipPct: 70 })

    // Otra agencia no puede vincular a esa propiedad.
    const bContact = (await (await b.post('/api/admin/contacts', { data: { name: `Intruso ${RUN}`, email: `intruso-${RUN}@mm.test` } })).json()).id
    expect((await b.post('/api/admin/property-contacts', { data: { propertyKind: 'agent', propertyId, contactId: bContact, role: 'owner' } })).status()).toBe(404)
  })

  test('notas: se añaden a un contacto, se filtran por entidad y otra agencia no puede escribir en él', async () => {
    const c = (await (await a.post('/api/admin/contacts', { data: { name: `Notas ${RUN}`, email: `notas-${RUN}@mm.test` } })).json()).id
    const n = await a.post('/api/admin/notes', { data: { entityType: 'contact', entityId: c, body: 'Prefiere visitas por la tarde' } })
    expect(n.ok(), await n.text()).toBeTruthy()
    const rows = (await (await a.get('/api/admin/notes', { params: { entityType: 'contact', entityId: c } })).json()).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ body: 'Prefiere visitas por la tarde', contactId: c })
    expect(rows[0].authorName).toBeTruthy()

    expect((await b.post('/api/admin/notes', { data: { entityType: 'contact', entityId: c, body: 'x' } })).status()).toBe(404)
    expect((await (await b.get('/api/admin/notes', { params: { entityType: 'contact', entityId: c } })).json()).rows).toHaveLength(0)
  })

  test('ficha del contacto en el navegador: cabecera, editar, pestañas y notas', async ({ page }) => {
    const id = (await (await a.post('/api/admin/contacts', { data: { name: `Carmen ${RUN}`, phone: `+3461${RUN.slice(-7)}` } })).json()).id

    await page.goto(`/admin/contactos/${id}`)
    await expect(page.getByTestId('contact-header')).toBeVisible()
    await expect(page.getByTestId('contact-name')).toHaveText(`Carmen ${RUN}`)

    await page.getByTestId('contact-edit').click()
    await page.getByTestId('contact-edit-country').fill('Portugal')
    await page.getByTestId('contact-edit-language').selectOption('pt')
    await page.locator('[data-testid="contact-edit-roles"] [data-role="owner"]').click()
    await page.getByTestId('contact-edit-save').click()
    await expect(page.getByTestId('contact-edit-modal')).toHaveCount(0)
    await expect(page.getByTestId('contact-country')).toHaveText('Portugal')
    await expect(page.getByTestId('contact-roles')).toContainText('Propietario')

    // Todas las pestañas del CRM 360 están.
    for (const key of ['resumen', 'necesidades', 'propiedades', 'leads', 'visitas', 'ofertas', 'emails', 'whatsapp', 'llamadas', 'tareas', 'documentos', 'notas', 'actividad']) {
      await expect(page.getByTestId(`contact-tab-${key}`)).toBeVisible()
    }

    await page.getByTestId('contact-tab-notas').click()
    await page.getByTestId('note-draft').fill('Llamar después de las 18:00')
    await page.getByTestId('note-add').click()
    await expect(page.getByTestId('note-item').first()).toContainText('Llamar después de las 18:00')

    await page.getByTestId('contact-tab-tareas').click()
    await page.getByTestId('contact-task-title').fill(`Enviar dossier ${RUN}`)
    await page.getByTestId('contact-task-add').click()
    await expect(page.getByTestId('contact-task-row').first()).toContainText(`Enviar dossier ${RUN}`)
  })

  test('paso «Propietarios» del editor: añadir un propietario con su %', async ({ page }) => {
    const name = `Propietario Editor ${RUN}`
    await a.post('/api/admin/contacts', { data: { name, email: `prop-editor-${RUN}@mm.test` } })

    await page.goto(`/admin/properties/${propertyId}`)
    await visible(page, 'property-editor-step-owners').click()
    await page.getByTestId('property-contact-search').fill(`Propietario Editor ${RUN}`)
    await page.getByRole('button', { name: new RegExp(name) }).first().click()
    await page.getByTestId('property-contact-role').selectOption('owner')
    await page.getByTestId('property-contact-new-pct').fill('0')
    await page.getByTestId('property-contact-add').click()
    await expect(page.getByTestId('property-contact-row').filter({ hasText: name })).toBeVisible()
  })
})
