import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Núcleo inmobiliario, bloque N5 (FASES 17-20), sobre HTTP real: citas con
 * todos sus tipos y campos y su edición (cancelar exige motivo), filtros
 * del calendario por oficina (entidad), tipo y cliente, tours con hora y
 * duración por parada en los dos catálogos (reordenar y recalcular),
 * resultado de visita estructurado con oferta real desde una parada de 2ª
 * mano, e iCal con la hora convertida con su zona — y nada cruza de agencia.
 *
 * Comercial y oficina propios, y huecos de un contador que sólo avanza (el
 * mismo motivo que tests/e2e/calendar.spec.ts): nunca chocan con las citas
 * aleatorias de otros specs ni entre sí.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

let dayCounter = 0
/** Un día futuro distinto en cada llamada: 'YYYY-MM-DD'. */
function nextDay(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 120 + dayCounter++)
  return d.toISOString().slice(0, 10)
}

test.describe('N5 — citas, tours, resultado de visita y calendario', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let officeId: number
  let agentId: number
  let contactId: number
  let agentPropertyId: number
  let developerPropertyId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })

    const office = await a.post('/api/admin/offices', { data: { name: `Oficina Canarias N5 ${RUN}`, timezone: 'Atlantic/Canary' } })
    expect(office.ok(), await office.text()).toBeTruthy()
    officeId = (await office.json()).id
    cleanup.push(() => a.delete(`/api/admin/offices/${officeId}?hard=1`))

    const agent = await a.post('/api/admin/team', { data: { name: `Comercial N5 ${RUN}`, email: `n5-comercial-${RUN}@example.com`, position: 'Comercial', slug: `n5-comercial-${RUN}`, officeId } })
    expect(agent.ok(), await agent.text()).toBeTruthy()
    agentId = (await agent.json()).id
    cleanup.push(() => a.delete(`/api/admin/team/${agentId}`))

    const contact = await a.post('/api/admin/saas/contacts', { data: { name: `Comprador N5 ${RUN}`, email: `n5-comprador-${RUN}@example.com`, force: true } })
    expect(contact.ok(), await contact.text()).toBeTruthy()
    contactId = (await contact.json()).id

    const ap = await a.post('/api/admin/properties', { data: { slug: `n5-${RUN}`, city: `N5-${RUN}`, price: 210000, status: 'available' } })
    expect(ap.ok(), await ap.text()).toBeTruthy()
    agentPropertyId = (await ap.json()).id
    cleanup.push(() => a.delete(`/api/admin/properties/${agentPropertyId}?hard=1`))

    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora N5 ${RUN}`, email: `n5-dev-${RUN}@mm.test`, status: 'active' } })
    const devProp = await a.post('/api/admin/developer-properties', { data: { developerId: (await dev.json()).id, name: `Obra nueva N5 ${RUN}`, status: 'new', price: 350000 } })
    expect(devProp.ok(), await devProp.text()).toBeTruthy()
    developerPropertyId = (await devProp.json()).id
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${developerPropertyId}?hard=1`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
  })

  test('cita con todos los campos: alta, ficha, edición, confirmación interna y cancelación con motivo; otra agencia ni la ve ni la toca', async () => {
    const day = nextDay()
    const created = await a.post('/api/admin/saas/visits', {
      data: {
        type: 'valuation',
        agentId,
        contactId,
        propertyId: agentPropertyId,
        propertyKind: 'agent',
        scheduledAt: `${day} 10:00:00`,
        endsAt: `${day} 11:15:00`,
        meetingPoint: 'Portal del edificio',
        notes: 'Llevar comparables',
        internalNotes: 'Pide 230.000 €',
        confirmationStatus: 'confirmed_internal',
      },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    const id = (await created.json()).id

    const { row } = await (await a.get('/api/admin/saas/visits', { params: { id: String(id) } })).json()
    expect(row).toMatchObject({
      type: 'valuation',
      contactId,
      officeId, // heredada del comercial
      officeName: `Oficina Canarias N5 ${RUN}`,
      timezone: 'Atlantic/Canary', // heredada de la oficina
      durationMinutes: 75,
      meetingPoint: 'Portal del edificio',
      internalNotes: 'Pide 230.000 €',
      confirmationStatus: 'confirmed_internal',
      propertyKind: 'agent',
    })

    // Tipo fuera de catálogo, zona inventada o confirmación del cliente en su nombre: 422.
    expect((await a.post('/api/admin/saas/visits', { data: { type: 'merienda', agentId, contactId, scheduledAt: `${day} 16:00:00` } })).status()).toBe(422)
    expect((await a.patch(`/api/admin/saas/visits/${id}`, { data: { timezone: 'Marte/Olympus' } })).status()).toBe(422)
    expect((await a.patch(`/api/admin/saas/visits/${id}`, { data: { confirmationStatus: 'confirmed' } })).status()).toBe(422)

    // Editar: tipo, fin libre e inmueble del otro catálogo.
    const edited = await a.patch(`/api/admin/saas/visits/${id}`, { data: { type: 'signing', endsAt: `${day} 11:40:00`, propertyId: developerPropertyId, propertyKind: 'developer' } })
    expect(edited.ok(), await edited.text()).toBeTruthy()
    const after = (await (await a.get('/api/admin/saas/visits', { params: { id: String(id) } })).json()).row
    expect(after).toMatchObject({ type: 'signing', durationMinutes: 100, propertyId: developerPropertyId, propertyKind: 'developer' })

    // Cancelar sin motivo no; con motivo sí, y se ve en la ficha.
    expect((await a.patch(`/api/admin/saas/visits/${id}`, { data: { status: 'cancelled' } })).status()).toBe(422)
    expect((await a.patch(`/api/admin/saas/visits/${id}`, { data: { status: 'cancelled', cancellationReason: 'El propietario lo ha pensado mejor' } })).ok()).toBeTruthy()
    const cancelled = (await (await a.get('/api/admin/saas/visits', { params: { id: String(id) } })).json()).row
    expect(cancelled).toMatchObject({ status: 'cancelled', cancellationReason: 'El propietario lo ha pensado mejor' })

    // Otra agencia: ni la lee, ni la edita; y la agencia A no puede usar un contacto de B.
    expect((await b.get('/api/admin/saas/visits', { params: { id: String(id) } })).status()).toBe(404)
    expect((await b.patch(`/api/admin/saas/visits/${id}`, { data: { notes: 'intruso' } })).status()).toBe(404)
    const contactB = await b.post('/api/admin/saas/contacts', { data: { name: `Ajeno N5 ${RUN}`, email: `n5-ajeno-${RUN}@example.com`, force: true } })
    const contactBId = (await contactB.json()).id
    expect((await a.post('/api/admin/saas/visits', { data: { agentId, contactId: contactBId, scheduledAt: `${nextDay()} 10:00:00` } })).status()).toBe(404)
    expect((await a.post('/api/admin/saas/visits', { data: { agentId, contactId, officeId: 999999999, scheduledAt: `${nextDay()} 10:00:00` } })).status()).toBe(404)
  })

  test('calendario: filtra por oficina (entidad), por los tipos nuevos y por cliente', async () => {
    const day = nextDay()
    const res = await a.post('/api/admin/saas/visits', { data: { type: 'open_house', clientName: `Open house N5 ${RUN}`, agentId, propertyId: developerPropertyId, propertyKind: 'developer', scheduledAt: `${day} 17:00:00`, durationMinutes: 120 } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const openHouse = (await res.json()).id
    const withClient = (await (await a.post('/api/admin/saas/visits', { data: { type: 'meeting', agentId, contactId, scheduledAt: `${day} 10:00:00` } })).json()).id

    const q = async (params: Record<string, string>) => ((await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day, ...params } })).json()).rows as any[]).map((r) => r.id)
    expect(await q({ officeId: String(officeId) })).toEqual(expect.arrayContaining([openHouse, withClient]))
    expect(await q({ officeId: '999999999' })).not.toContain(openHouse)
    expect(await q({ type: 'open_house' })).toContain(openHouse)
    expect(await q({ type: 'open_house' })).not.toContain(withClient)
    expect(await q({ contactId: String(contactId) })).toEqual([withClient])

    // La agencia B no ve nada, ni filtrando por la oficina de A.
    const rowsB = ((await (await b.get('/api/admin/saas/calendar', { params: { from: day, to: day, officeId: String(officeId) } })).json()).rows as any[]).map((r) => r.id)
    expect(rowsB).not.toContain(openHouse)
  })

  test('tour: paradas de 45 y 60 min en los dos catálogos, reordenar y recalcular, y oferta real desde el resultado de la parada de 2ª mano', async () => {
    const day = nextDay()
    const created = await a.post('/api/admin/saas/tours', {
      data: {
        contactId,
        notes: `Tour N5 ${RUN}`,
        stops: [
          { propertyId: developerPropertyId, propertyKind: 'developer', agentId, scheduledAt: `${day} 10:00:00`, durationMinutes: 45 },
          { propertyId: agentPropertyId, propertyKind: 'agent', agentId, scheduledAt: `${day} 10:45:00`, durationMinutes: 60 },
        ],
      },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    const { id: tourId, stopIds } = await created.json()

    let tour = ((await (await a.get('/api/admin/saas/tours')).json()).rows as any[]).find((t) => t.id === tourId)
    expect(tour).toMatchObject({ contactId, notes: `Tour N5 ${RUN}` })
    expect(tour.stops.map((s: any) => [s.propertyKind, s.scheduledAt, s.endsAt, s.durationMinutes])).toEqual([
      ['developer', `${day} 10:00:00`, `${day} 10:45:00`, 45],
      ['agent', `${day} 10:45:00`, `${day} 11:45:00`, 60],
    ])

    // Reordenar (la de 2ª mano primero) y recalcular con 15 min de desplazamiento.
    const reordered = await a.post('/api/admin/saas/tours', { data: { action: 'reorder', tourId, stopIds: [stopIds[1], stopIds[0]], recalculate: true, gapMinutes: 15 } })
    expect(reordered.ok(), await reordered.text()).toBeTruthy()
    tour = ((await (await a.get('/api/admin/saas/tours')).json()).rows as any[]).find((t) => t.id === tourId)
    expect(tour.stops.map((s: any) => [s.id, s.scheduledAt, s.endsAt])).toEqual([
      [stopIds[1], `${day} 10:00:00`, `${day} 11:00:00`],
      [stopIds[0], `${day} 11:15:00`, `${day} 12:00:00`],
    ])
    expect((await b.post('/api/admin/saas/tours', { data: { action: 'reorder', tourId, stopIds } })).status()).toBe(404)

    // Resultado estructurado + oferta desde la parada de 2ª mano.
    expect((await a.patch(`/api/admin/saas/visits/${stopIds[1]}`, { data: { status: 'completed' } })).ok()).toBeTruthy()
    const outcome = await a.post(`/api/admin/saas/visits/${stopIds[1]}/outcome`, {
      data: { outcome: 'interested', interestLevel: 5, liked: 'La terraza', disliked: 'El ascensor', pricePerception: 'fair', locationRating: 4, conditionRating: 3, layoutRating: 5, createOffer: { amount: 205000, conditions: 'Sujeta a tasación' } },
    })
    expect(outcome.ok(), await outcome.text()).toBeTruthy()
    const { offerId } = await outcome.json()
    expect(offerId).toBeTruthy()

    tour = ((await (await a.get('/api/admin/saas/tours')).json()).rows as any[]).find((t) => t.id === tourId)
    const stop = tour.stops.find((s: any) => s.id === stopIds[1])
    expect(stop).toMatchObject({ interestLevel: 5, outcomeLiked: 'La terraza', outcomeDisliked: 'El ascensor', pricePerception: 'fair', wantsToOffer: 1 })
    expect(stop.offers.map((o: any) => o.id)).toContain(offerId)

    // Y en la Lista.
    const listed = ((await (await a.get('/api/admin/saas/visits')).json()).rows as any[]).find((v) => v.id === stopIds[1])
    expect(listed.offers.map((o: any) => o.id)).toContain(offerId)
    expect(listed.locationRating).toBe(4)
  })

  test('iCal: la hora sale convertida con la zona de la oficina (Canarias), no la hora local marcada como UTC', async () => {
    const day = nextDay()
    const res = await a.post('/api/admin/saas/visits', { data: { type: 'call', clientName: 'Llamada iCal', clientPhone: '+34600000000', agentId, scheduledAt: `${day} 10:00:00`, durationMinutes: 30 } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id

    const availability = await (await a.get(`/api/admin/saas/agents/${agentId}/availability`)).json()
    const token = availability.agent.icalToken
    expect(token).toBeTruthy()
    const ics = (await (await fetch(`${BASE_URL}/calendar/${token}.ics`)).text()).replace(/\r\n /g, '')
    const block = ics.slice(ics.indexOf(`UID:visit-${id}@`))
    const start = /DTSTART:(\d{8}T\d{6}Z)/.exec(block)?.[1]
    // Canarias es UTC+0 en invierno y UTC+1 en verano: nunca puede ser «10:00Z» en verano ni otra cosa que 09:00Z/10:00Z.
    const canaryOffsetHours = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Atlantic/Canary', timeZoneName: 'shortOffset' }).formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || 0)
    expect(start).toBe(`${day.replace(/-/g, '')}T${String(10 - canaryOffsetHours).padStart(2, '0')}0000Z`)
    expect(ics).toContain('X-WR-TIMEZONE:')
  })

  test('el panel: la Lista abre la ficha, el Calendario tiene filtros de oficina, tipo y cliente y el estado honesto de Google/Outlook', async ({ page }) => {
    await page.goto('/admin/visitas')
    await expect(page.getByTestId('visitas-new-appointment')).toBeVisible()
    await page.getByRole('button', { name: 'Calendario', exact: true }).click()
    await expect(page.getByTestId('calendar-filter-office')).toBeVisible()
    await expect(page.getByTestId('calendar-filter-type').locator('option', { hasText: 'Tasación' })).toHaveCount(1)
    await expect(page.getByTestId('calendar-filter-contact-input')).toBeVisible()
    await expect(page.getByTestId('external-calendar-google')).toContainText('No conectado')
    await expect(page.getByTestId('external-calendar-outlook')).toContainText('No conectado')

    await page.getByTestId('visitas-new-appointment').click()
    await expect(page.getByTestId('appointment-form')).toBeVisible()
    await expect(page.getByTestId('appointment-form-type').locator('option', { hasText: 'Open house' })).toHaveCount(1)
    await expect(page.getByTestId('appointment-form-internal-notes')).toBeVisible()
  })
})
