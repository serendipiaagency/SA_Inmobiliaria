import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B, ANON_STATE } from './global-setup'

/**
 * Cierre C2 de la auditoría del núcleo inmobiliario, sobre HTTP real y el panel:
 *
 * - FASE 18: añadir y quitar paradas de un tour ya creado (POST
 *   /api/admin/saas/tours con `action: 'add_stop' | 'remove_stop'`): «al
 *   final con el margen» o a una hora concreta, los dos catálogos, mismas
 *   validaciones que el alta (ajena 404, papelera 422, solape 422/409), quitar
 *   = la cita queda cancelada con motivo, nunca la última parada activa.
 * - FASE 11: la vista propia de una selección (/admin/contactos/selecciones/:id,
 *   motor genérico /api/admin/property-selections/:id): foto, precio y estado,
 *   reordenar, quitar, añadir, y enviarla como conjunto por el Centro de
 *   Comunicaciones — sin canal real lo dice, nunca simula el envío.
 *
 * Y nada cruza de agencia. Comercial propio y días de un contador que sólo
 * avanza (como nucleo-n5.spec.ts): nunca choca con las citas de otros specs.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

let dayCounter = 0
/** Un día futuro distinto en cada llamada: 'YYYY-MM-DD'. */
function nextDay(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 220 + dayCounter++)
  return d.toISOString().slice(0, 10)
}

test.describe('Cierre C2 — paradas de un tour ya creado y vista propia de una selección', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let agentId: number
  let contactId: number
  let agentPropertyId: number
  let developerPropertyId: number
  let devName: string
  let foreignPropertyId: number
  let selectionId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    // Dentro de este describe, newContext() sin storageState heredaría la sesión de A.
    anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: ANON_STATE })

    const agent = await a.post('/api/admin/team', { data: { name: `Comercial C2 ${RUN}`, email: `c2-comercial-${RUN}@example.com`, position: 'Comercial', slug: `c2-comercial-${RUN}` } })
    expect(agent.ok(), await agent.text()).toBeTruthy()
    agentId = (await agent.json()).id
    cleanup.push(() => a.delete(`/api/admin/team/${agentId}`))

    const contact = await a.post('/api/admin/saas/contacts', { data: { name: `Compradora C2 ${RUN}`, email: `c2-compradora-${RUN}@example.com`, phone: `+3462${RUN.slice(-7)}`, force: true } })
    expect(contact.ok(), await contact.text()).toBeTruthy()
    contactId = (await contact.json()).id

    const ap = await a.post('/api/admin/properties', { data: { slug: `c2-${RUN}`, reference: `C2-${RUN}`, city: `C2-${RUN}`, price: 315000, bedrooms: 3, status: 'available' } })
    expect(ap.ok(), await ap.text()).toBeTruthy()
    agentPropertyId = (await ap.json()).id
    cleanup.push(() => a.delete(`/api/admin/properties/${agentPropertyId}?hard=1`))

    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora C2 ${RUN}`, email: `c2-dev-${RUN}@mm.test`, status: 'active' } })
    devName = `Obra nueva C2 ${RUN}`
    const devProp = await a.post('/api/admin/developer-properties', { data: { developerId: (await dev.json()).id, name: devName, status: 'new', price: 480000 } })
    expect(devProp.ok(), await devProp.text()).toBeTruthy()
    developerPropertyId = (await devProp.json()).id
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${developerPropertyId}?hard=1`))

    const foreign = await b.post('/api/admin/properties', { data: { slug: `c2-ajena-${RUN}`, city: `C2-ajena-${RUN}`, price: 100000, status: 'available' } })
    expect(foreign.ok(), await foreign.text()).toBeTruthy()
    foreignPropertyId = (await foreign.json()).id
    cleanup.push(() => b.delete(`/api/admin/properties/${foreignPropertyId}?hard=1`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
    await anon?.dispose()
  })

  async function createTour(day: string) {
    const created = await a.post('/api/admin/saas/tours', {
      data: {
        contactId,
        notes: `Tour C2 ${RUN}`,
        stops: [
          { propertyId: developerPropertyId, propertyKind: 'developer', agentId, scheduledAt: `${day} 10:00:00`, durationMinutes: 45 },
          { propertyId: agentPropertyId, propertyKind: 'agent', agentId, scheduledAt: `${day} 11:00:00`, durationMinutes: 60 },
        ],
      },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    return (await created.json()) as { id: number; stopIds: number[] }
  }
  const tourById = async (id: number) => ((await (await a.get('/api/admin/saas/tours')).json()).rows as any[]).find((t) => t.id === id)

  test('tour: añadir paradas (al final con el margen y a una hora concreta) con las validaciones del alta, y quitar con motivo', async () => {
    const day = nextDay()
    const { id: tourId, stopIds } = await createTour(day)

    // Al final: 11:00 + 60 min = 12:00, más 20 min de desplazamiento; sin duración, la franja del comercial.
    const atEnd = await a.post('/api/admin/saas/tours', { data: { action: 'add_stop', tourId, gapMinutes: 20, stop: { propertyId: agentPropertyId, propertyKind: 'agent', agentId, durationMinutes: 30 } } })
    expect(atEnd.ok(), await atEnd.text()).toBeTruthy()
    const added = await atEnd.json()
    expect(added).toMatchObject({ id: tourId, scheduledAt: `${day} 12:20:00`, endsAt: `${day} 12:50:00`, tourStopOrder: 2 })

    // A una hora concreta, del otro catálogo.
    const at = await a.post('/api/admin/saas/tours', { data: { action: 'add_stop', tourId, stop: { propertyId: developerPropertyId, propertyKind: 'developer', agentId, scheduledAt: `${day} 16:00:00`, durationMinutes: 45 } } })
    expect(at.ok(), await at.text()).toBeTruthy()
    const addedAt = await at.json()

    let tour = await tourById(tourId)
    expect(tour.stops).toHaveLength(4)
    const stop = tour.stops.find((s: any) => s.id === added.stopId)
    expect(stop).toMatchObject({ propertyKind: 'agent', propertyId: agentPropertyId, contactId, status: 'scheduled', durationMinutes: 30 })
    expect(tour.notes).toBe(`Tour C2 ${RUN}`)

    // Mismas validaciones que el alta.
    const add = (stop: Record<string, any>, extra: Record<string, any> = {}) => a.post('/api/admin/saas/tours', { data: { action: 'add_stop', tourId, stop: { agentId, ...stop }, ...extra } })
    expect((await add({ propertyId: foreignPropertyId, propertyKind: 'agent', scheduledAt: `${day} 18:00:00` })).status()).toBe(404)
    expect((await add({ scheduledAt: `${day} 10:15:00` })).status()).toBe(422) // se solapa con la parada 1 del propio tour
    expect((await add({}, { gapMinutes: 999 })).status()).toBe(422)
    const trashed = await a.post('/api/admin/properties', { data: { slug: `c2-papelera-${RUN}`, city: `C2-papelera-${RUN}`, price: 1, status: 'available' } })
    const trashedId = (await trashed.json()).id
    cleanup.push(() => a.delete(`/api/admin/properties/${trashedId}?hard=1`))
    expect((await a.delete(`/api/admin/properties/${trashedId}`)).ok()).toBeTruthy()
    expect((await add({ propertyId: trashedId, propertyKind: 'agent', scheduledAt: `${day} 18:00:00` })).status()).toBe(422)
    // Otra agencia: el tour no existe para ella.
    expect((await b.post('/api/admin/saas/tours', { data: { action: 'add_stop', tourId, stop: { agentId, scheduledAt: `${day} 19:00:00` } } })).status()).toBe(404)

    // Quitar: motivo obligatorio; la cita queda cancelada con su motivo y sigue en el tour.
    expect((await a.post('/api/admin/saas/tours', { data: { action: 'remove_stop', tourId, stopId: addedAt.stopId } })).status()).toBe(422)
    expect((await b.post('/api/admin/saas/tours', { data: { action: 'remove_stop', tourId, stopId: addedAt.stopId, reason: 'intruso' } })).status()).toBe(404)
    const removed = await a.post('/api/admin/saas/tours', { data: { action: 'remove_stop', tourId, stopId: addedAt.stopId, reason: `Ya no le encaja ${RUN}` } })
    expect(removed.ok(), await removed.text()).toBeTruthy()
    const { row } = await (await a.get('/api/admin/saas/visits', { params: { id: String(addedAt.stopId) } })).json()
    expect(row).toMatchObject({ status: 'cancelled', cancellationReason: `Ya no le encaja ${RUN}`, tourId })

    // Un tour no se queda sin paradas activas.
    for (const id of [stopIds[0], stopIds[1]]) expect((await a.post('/api/admin/saas/tours', { data: { action: 'remove_stop', tourId, stopId: id, reason: 'Recorte' } })).ok()).toBeTruthy()
    const last = await a.post('/api/admin/saas/tours', { data: { action: 'remove_stop', tourId, stopId: added.stopId, reason: 'La última' } })
    expect(last.status()).toBe(422)
    tour = await tourById(tourId)
    expect(tour.stops.filter((s: any) => s.status !== 'cancelled').map((s: any) => s.id)).toEqual([added.stopId])
  })

  test('tour en el panel: «+ Parada» al final de la ruta y «Quitar» con motivo', async ({ page }) => {
    const { id: tourId, stopIds } = await createTour(nextDay())

    await page.goto('/admin/visitas')
    await page.getByRole('button', { name: 'Tours', exact: true }).click()
    await page.getByTestId(`tour-${tourId}-add-stop`).click()
    const modal = page.getByTestId('tour-add-stop')
    await expect(modal).toBeVisible()
    // La última parada acaba a las 12:00; con el desplazamiento por defecto (15 min), la nueva empieza a las 12:15.
    await expect(modal.getByTestId('tour-add-stop-preview')).toContainText('12:15')
    await modal.getByTestId('tour-add-stop-agent').selectOption(String(agentId))
    await modal.getByTestId('tour-add-stop-duration').selectOption('30')
    await modal.getByTestId('tour-add-stop-save').click()
    await expect(modal).toBeHidden()

    let tour = await tourById(tourId)
    expect(tour.stops).toHaveLength(3)
    expect(tour.stops[2].scheduledAt.slice(11, 16)).toBe('12:15')
    await expect(page.getByTestId(`tour-stop-${tour.stops[2].id}`)).toBeVisible()

    await page.getByTestId(`tour-stop-${stopIds[0]}-remove`).click()
    const remove = page.getByTestId('tour-remove-stop')
    await expect(remove).toBeVisible()
    await remove.getByTestId('appointment-cancel-reason').fill(`Quitada desde el panel ${RUN}`)
    await remove.getByTestId('appointment-cancel-confirm').click()
    await expect(remove).toBeHidden()
    tour = await tourById(tourId)
    expect(tour.stops.find((s: any) => s.id === stopIds[0])).toMatchObject({ status: 'cancelled', cancellationReason: `Quitada desde el panel ${RUN}` })
  })

  test('selección por API: detalle con foto, precio y estado; reordenar, quitar y añadir; otra agencia 404; alta genérica 405', async () => {
    const req = await a.post('/api/admin/saas/buyer-requirements', { data: { contactId, title: `Busca C2 ${RUN}`, operation: 'sale' } })
    expect(req.ok(), await req.text()).toBeTruthy()
    const requirementId = (await req.json()).id
    const sel = await a.post('/api/admin/saas/matching/matches', {
      data: { action: 'selection', buyerRequirementId: requirementId, title: `Selección C2 ${RUN}`, items: [{ propertyId: agentPropertyId, propertyKind: 'agent' }, { propertyId: developerPropertyId, propertyKind: 'developer', note: 'La de la piscina' }] },
    })
    expect(sel.ok(), await sel.text()).toBeTruthy()
    selectionId = (await sel.json()).selection.id

    const detail = await a.get(`/api/admin/property-selections/${selectionId}`)
    expect(detail.ok(), await detail.text()).toBeTruthy()
    const { row } = await detail.json()
    expect(row).toMatchObject({ title: `Selección C2 ${RUN}`, contact: { id: contactId }, requirement: { id: requirementId } })
    expect(row.items.map((i: any) => [i.propertyKind, i.propertyId])).toEqual([
      ['agent', agentPropertyId],
      ['developer', developerPropertyId],
    ])
    expect(row.items[0]).toMatchObject({ price: 315000, status: 'available', statusLabel: 'Disponible', trashed: false })
    expect(row.items[1]).toMatchObject({ name: devName, price: 480000, statusLabel: 'Obra nueva', note: 'La de la piscina' })
    const [i1, i2] = row.items.map((i: any) => i.id)

    const put = (data: Record<string, any>, ctx = a) => ctx.put(`/api/admin/property-selections/${selectionId}`, { data })
    const reordered = await put({ action: 'reorder', itemIds: [i2, i1] })
    expect(reordered.ok(), await reordered.text()).toBeTruthy()
    expect((await reordered.json()).selection.items.map((i: any) => i.id)).toEqual([i2, i1])
    expect((await put({ action: 'reorder', itemIds: [i1] })).status()).toBe(422)

    const extra = await a.post('/api/admin/properties', { data: { slug: `c2-extra-${RUN}`, city: `C2-extra-${RUN}`, price: 250000, status: 'available' } })
    const extraId = (await extra.json()).id
    cleanup.push(() => a.delete(`/api/admin/properties/${extraId}?hard=1`))
    const added = await put({ action: 'add', items: [{ propertyId: extraId, propertyKind: 'agent' }] })
    expect(added.ok(), await added.text()).toBeTruthy()
    expect((await added.json()).added).toHaveLength(1)
    expect((await put({ action: 'add', items: [{ propertyId: foreignPropertyId, propertyKind: 'agent' }] })).status()).toBe(404)

    const removed = await put({ action: 'remove', itemId: i1 })
    expect(removed.ok(), await removed.text()).toBeTruthy()
    expect((await removed.json()).selection.items.map((i: any) => i.propertyId)).toEqual([developerPropertyId, extraId])
    expect((await put({ action: 'nada' })).status()).toBe(422)

    // Otra agencia no la ve ni la toca; sin sesión, nada; el alta genérica no existe.
    expect((await b.get(`/api/admin/property-selections/${selectionId}`)).status()).toBe(404)
    expect((await put({ action: 'reorder', itemIds: [i2] }, b)).status()).toBe(404)
    expect((await b.delete(`/api/admin/property-selections/${selectionId}`)).status()).toBe(404)
    expect((await anon.get(`/api/admin/property-selections/${selectionId}`)).status()).toBe(401)
    expect((await a.post('/api/admin/property-selections', { data: { contactId, title: 'Atajo' } })).status()).toBe(405)
  })

  test('selección en el panel: se abre desde la ficha, se reordena, se amplía y se envía sin simular nada', async ({ page }) => {
    await page.goto(`/admin/contactos/${contactId}?tab=necesidades`)
    await page.getByTestId(`contact-selection-open-${selectionId}`).click()
    await expect(page).toHaveURL(new RegExp(`/admin/contactos/selecciones/${selectionId}$`))
    await expect(page.getByTestId('selection-title')).toHaveText(`Selección C2 ${RUN}`)
    const items = page.getByTestId('selection-item')
    await expect(items).toHaveCount(2)
    const firstId = await items.nth(0).getAttribute('data-item-id')
    const secondId = await items.nth(1).getAttribute('data-item-id')
    await expect(page.getByTestId(`selection-item-${firstId}-price`)).toContainText('480.000')

    // Bajar la primera: el orden se guarda en el servidor.
    await page.getByTestId(`selection-item-${firstId}-down`).click()
    await expect(items.nth(0)).toHaveAttribute('data-item-id', String(secondId))

    // Añadir con el buscador de inmuebles (los dos catálogos).
    await page.getByTestId('selection-add-property-input').fill(`C2-${RUN}`)
    await page.getByRole('button', { name: new RegExp(`C2-${RUN}`) }).first().click()
    await page.getByTestId('selection-add').click()
    await expect(items).toHaveCount(3)

    // Enviar: abre la conversación y manda ficha a ficha. Sin número conectado lo dice; con él, cada fila dice lo que pasó de verdad.
    await page.getByTestId('selection-send').click()
    const modal = page.getByTestId('selection-send-modal')
    await expect(modal).toBeVisible()
    await expect(modal.getByTestId('selection-send-list').locator('li')).toHaveCount(3)
    await modal.getByTestId('selection-send-confirm').click()
    await expect(modal.getByTestId('selection-send-not-configured').or(modal.getByTestId('selection-send-summary'))).toBeVisible()
    if (await modal.getByTestId('selection-send-not-configured').isVisible()) {
      // Sin canal no hay bandeja: se ofrece WhatsApp con su número y nada se da por enviado.
      await expect(modal.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute('href', /wa\.me/)
      await expect(modal.getByTestId('selection-send-summary')).toHaveCount(0)
    } else {
      // Con canal, cada fila dice lo que pasó de verdad (una persona que nunca escribió sólo admite plantillas: el proveedor no lo acepta y se dice).
      const summary = await modal.getByTestId('selection-send-summary').textContent()
      expect(summary).toMatch(/Enviadas \d+ de 3/)
    }
  })
})
