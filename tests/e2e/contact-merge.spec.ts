import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Unificar contactos duplicados: todo lo que colgaba del duplicado
 * (propietario de una propiedad, roles, notas, tareas, ofertas…) pasa al que
 * se conserva, el duplicado se archiva y su cronología se ve en el
 * superviviente. Contra la D1 local de verdad (subconsultas y json_each).
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('Unificar contactos duplicados', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let propertyId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    const p = await a.post('/api/admin/properties', { data: { slug: `merge-prop-${RUN}`, propertyType: 'Apartment', price: 300000, city: 'E2E-Merge' } })
    expect(p.ok(), await p.text()).toBeTruthy()
    propertyId = (await p.json()).id
    cleanup.push(() => a.delete(`/api/admin/properties/${propertyId}`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
  })

  async function newContact(name: string, extra: Record<string, unknown> = {}) {
    const res = await a.post('/api/admin/contacts', { data: { name, email: `${name.toLowerCase().replace(/\W+/g, '-')}-${RUN}@mm.test`, force: true, ...extra } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).id as number
  }

  test('API: cada vínculo pasa al superviviente, el % de propietario se suma y la otra agencia no puede tocarlo', async () => {
    const master = await newContact(`Maestro ${RUN}`)
    const dup = await newContact(`Duplicado ${RUN}`, { language: 'en', roles: ['buyer'] })

    expect((await a.post('/api/admin/property-contacts', { data: { propertyKind: 'agent', propertyId, contactId: master, role: 'owner', ownershipPct: 40 } })).ok()).toBeTruthy()
    expect((await a.post('/api/admin/property-contacts', { data: { propertyKind: 'agent', propertyId, contactId: dup, role: 'owner', ownershipPct: 30 } })).ok()).toBeTruthy()
    expect((await a.post('/api/admin/notes', { data: { entityType: 'contact', entityId: dup, body: `Nota del duplicado ${RUN}` } })).ok()).toBeTruthy()
    const task = await a.post('/api/admin/saas/tasks', { data: { type: 'call', title: `Llamar ${RUN}`, contactId: dup, dueAt: '2031-01-10 10:00:00' } })
    expect(task.ok(), await task.text()).toBeTruthy()
    const offer = await a.post('/api/admin/saas/offers', { data: { propertyId, propertyKind: 'agent', buyerContactId: dup, amount: 280000 } })
    expect(offer.ok(), await offer.text()).toBeTruthy()
    const offerId = (await offer.json()).id

    // La otra agencia no puede ni previsualizar ni fusionar contactos de esta.
    expect((await b.get('/api/admin/saas/contacts/merge-preview', { params: { masterId: master, duplicateId: dup } })).status()).toBe(422)
    expect((await b.post('/api/admin/saas/contacts/merge', { data: { masterId: master, duplicateId: dup } })).status()).toBe(422)

    const preview = await (await a.get('/api/admin/saas/contacts/merge-preview', { params: { masterId: master, duplicateId: dup } })).json()
    expect(preview.blockers).toEqual([])
    expect(preview.relations).toMatchObject({ propertyContacts: 1, roles: 2, notes: 1, tasks: 1, offers: 1 })

    const merged = await a.post('/api/admin/saas/contacts/merge', { data: { masterId: master, duplicateId: dup } })
    expect(merged.ok(), await merged.text()).toBeTruthy()
    expect((await merged.json()).language).toBe('en')

    // Una sola línea de propietario, la del superviviente, con el 70 %.
    const owners = (await (await a.get('/api/admin/property-contacts', { params: { propertyKind: 'agent', propertyId } })).json()).rows
    expect(owners.map((r: any) => [r.contactId, r.role, r.ownershipPct])).toEqual([[master, 'owner', 70]])
    // Roles: owner (de la propiedad) y buyer (del duplicado), sin repetir.
    expect(((await (await a.get(`/api/admin/contacts/${master}`)).json()).row.roles as string[]).sort()).toEqual(['buyer', 'owner'])
    // Nota, tarea y oferta: en el superviviente.
    const notes = (await (await a.get('/api/admin/notes', { params: { entityType: 'contact', entityId: master } })).json()).rows
    expect(notes.map((n: any) => n.body)).toContain(`Nota del duplicado ${RUN}`)
    const tasks = await (await a.get('/api/admin/saas/tasks', { params: { contactId: String(master) } })).json()
    expect(JSON.stringify(tasks)).toContain(`Llamar ${RUN}`)
    const ficha = await (await a.get(`/api/admin/saas/contacts/${master}`)).json()
    expect(JSON.stringify(ficha)).toContain(`"id":${offerId}`)

    // El duplicado ya no está activo; su cronología (la oferta creada) se ve en el superviviente.
    expect((await a.get(`/api/admin/contacts/${dup}`)).status()).toBe(404)
    const activity = await (await a.get('/api/admin/saas/activity', { params: { contactId: String(master) } })).json()
    const types = (activity.rows as any[]).map((r) => r.eventType)
    expect(types).toContain('CONTACT_MERGED')
    expect(types).toContain('OFFER_CREATED')
  })

  test('API: comprador y vendedor de la misma oferta no se pueden unificar (422 y nada se mueve)', async () => {
    const buyer = await newContact(`Comprador ${RUN}`)
    const seller = await newContact(`Vendedor ${RUN}`)
    const offer = await a.post('/api/admin/saas/offers', { data: { propertyId, propertyKind: 'agent', buyerContactId: buyer, sellerContactIds: [seller], amount: 260000 } })
    expect(offer.ok(), await offer.text()).toBeTruthy()

    const preview = await (await a.get('/api/admin/saas/contacts/merge-preview', { params: { masterId: buyer, duplicateId: seller } })).json()
    expect(preview.blockers.join(' ')).toContain('comprador y vendedor')
    const res = await a.post('/api/admin/saas/contacts/merge', { data: { masterId: buyer, duplicateId: seller } })
    expect(res.status()).toBe(422)
    expect((await a.get(`/api/admin/contacts/${seller}`)).ok()).toBeTruthy()
  })

  test('navegador: «Revisar y fusionar» enseña lo que se moverá y deja una sola ficha', async ({ page }) => {
    const phone = `+3462${RUN.replace(/\D/g, '').slice(-7)}`
    const master = await newContact(`Paula ${RUN}`, { phone })
    const dup = await newContact(`Paula B ${RUN}`, { phone })
    expect((await a.post('/api/admin/notes', { data: { entityType: 'contact', entityId: dup, body: 'Prefiere WhatsApp' } })).ok()).toBeTruthy()

    await page.goto(`/admin/contactos/${master}`)
    await page.getByTestId('contact-tab-ficha').click()
    await page.getByTestId('dup-check').click()
    await page.getByTestId(`dup-merge-${dup}`).click()
    await expect(page.getByTestId('merge-relations')).toContainText('1 nota')
    await expect(page.getByTestId('merge-blockers')).toHaveCount(0)
    await page.getByTestId('merge-confirm').click()
    await expect(page.getByTestId('merge-relations')).toHaveCount(0)
    await expect(page.getByTestId('dup-check')).toBeVisible()

    expect((await a.get(`/api/admin/contacts/${dup}`)).status()).toBe(404)
    const notes = (await (await a.get('/api/admin/notes', { params: { entityType: 'contact', entityId: master } })).json()).rows
    expect(notes.map((n: any) => n.body)).toContain('Prefiere WhatsApp')
  })
})
