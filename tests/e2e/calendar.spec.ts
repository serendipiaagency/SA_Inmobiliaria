import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * FASE 20 — Calendar, sobre HTTP real.
 *
 * Calendar no es una segunda agenda: lee `visits` a través de
 * GET /api/admin/saas/calendar (rango + filtros), y crea/mueve/redimensiona
 * citas a través de los mismos endpoints que ya usaba /admin/visitas
 * (POST /api/admin/saas/visits, PATCH .../visits/:id) — nada de esto pasa
 * por el endpoint público de reserva, así que no consume su rate limit
 * (lección de FASE 19: tests/e2e/visitOutcome.spec.ts).
 *
 * Comercial propio en vez de reutilizar el de appointments/tours/visitOutcome:
 * esos tres specs ya reservan citas aleatorias para 'perla-maria-melgarejo'
 * dentro de la misma ventana de ~50 días, y las que crea este spec eran
 * suficientes para que, alguna vez, dos random-slots coincidieran de verdad
 * (409 real, no un flake) — la misma clase de colisión que el rate limit de
 * FASE 19, pero de agenda en vez de peticiones.
 *
 * Dentro de este mismo spec el comercial dedicado tampoco se libra: varias
 * pruebas de este archivo le crean citas, y dos slots aleatorios de un mismo
 * comercial pueden coincidir por pura probabilidad (se vio en la práctica).
 * Por eso cada llamada devuelve un hueco de un contador que sólo avanza —
 * nunca puede repetir día, así que nunca puede chocar consigo mismo.
 */
let slotCounter = 0
function randomFutureSlot(): string {
  const offset = slotCounter++
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 7 + offset)
  const dateStr = d.toISOString().slice(0, 10)
  const hour = 9 + (offset % 6)
  return `${dateStr} ${String(hour).padStart(2, '0')}:00:00`
}

test.describe('Calendar (FASE 20)', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let agentId: number
  let developerPropertyId: number
  let agentPropertyId: number
  const createdVisitIds: number[] = []
  const createdAgentPropertyIds: number[] = []
  const createdDeveloperPropertyIds: number[] = []
  const createdTeamIds: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })

    const agentRes = await a.post('/api/admin/team', {
      data: { name: `E2E Calendar Comercial ${Date.now()}`, email: `e2e-cal-comercial-${Date.now()}@example.com`, position: 'Comercial', officeName: 'Oficina Calendar E2E', slug: `e2e-cal-comercial-${Date.now()}` },
    })
    expect(agentRes.ok(), await agentRes.text()).toBeTruthy()
    agentId = (await agentRes.json()).id
    createdTeamIds.push(agentId)

    // Una propiedad de cada catálogo — no hay garantía de que ya exista
    // ninguna de las dos en una D1 recién migrada (otros specs las crean,
    // pero no antes que éste en orden alfabético).
    const devOwnerRes = await a.post('/api/admin/developers', { data: { name: `Dev Calendar E2E ${Date.now()}`, email: `dev-cal-${Date.now()}@mm.test`, status: 'active' } })
    const { id: developerId } = await devOwnerRes.json()
    const devPropRes = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Propiedad Calendar E2E ${Date.now()}`, status: 'new', price: 300000 } })
    expect(devPropRes.ok(), await devPropRes.text()).toBeTruthy()
    developerPropertyId = (await devPropRes.json()).id
    createdDeveloperPropertyIds.push(developerPropertyId)

    const apRes = await a.post('/api/admin/properties', { data: { slug: `e2e-cal-${Date.now()}`, city: 'E2E-Calendar', price: 200000, status: 'available' } })
    const apBody = await apRes.json()
    agentPropertyId = apBody.id
    createdAgentPropertyIds.push(agentPropertyId)
  })

  test.afterAll(async () => {
    await Promise.all(createdAgentPropertyIds.map((id) => a.delete(`/api/admin/properties/${id}`)))
    await Promise.all(createdDeveloperPropertyIds.map((id) => a.delete(`/api/admin/developer-properties/${id}`)))
    await Promise.all(createdTeamIds.map((id) => a.delete(`/api/admin/team/${id}`)))
    await a?.dispose()
    await b?.dispose()
  })

  async function createAppointment(overrides: Record<string, any> = {}) {
    const res = await a.post('/api/admin/saas/visits', {
      data: { clientName: `E2E Calendar ${Date.now()}`, clientEmail: `e2e-cal-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, agentId, scheduledAt: randomFutureSlot(), ...overrides },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const body = await res.json()
    createdVisitIds.push(body.id)
    return body
  }

  test('crea una cita suelta desde el panel (no un tour) y devuelve la cita completa', async () => {
    const visit = await createAppointment({ propertyId: developerPropertyId, propertyKind: 'developer' })
    expect(visit.status).toBe('scheduled')
    expect(visit.tourId).toBeNull()
    expect(visit.propertyId).toBe(developerPropertyId)
  })

  test('admite un inmueble de 2ª mano — la reserva pública nunca lo soportó', async () => {
    const visit = await createAppointment({ propertyId: agentPropertyId, propertyKind: 'agent' })
    expect(visit.propertyKind).toBe('agent')
    expect(visit.propertyId).toBe(agentPropertyId)
  })

  test('rechaza crear dos citas del mismo comercial en el mismo hueco (409)', async () => {
    const start = randomFutureSlot()
    await createAppointment({ scheduledAt: start })
    const res = await a.post('/api/admin/saas/visits', { data: { clientName: 'Choque', clientEmail: 'choque-cal@example.com', agentId, scheduledAt: start } })
    expect(res.status()).toBe(409)
  })

  test('GET /calendar devuelve sólo las citas dentro del rango pedido, y respeta el filtro de comercial', async () => {
    const visit = await createAppointment()
    const day = visit.scheduledAt.slice(0, 10)

    const inRange = await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day, agentId: String(agentId) } })).json()
    expect(inRange.rows.some((r: any) => r.id === visit.id)).toBe(true)

    const otherDay = new Date(new Date(`${day}T00:00:00Z`).getTime() + 300 * 86400000).toISOString().slice(0, 10)
    const outOfRange = await (await a.get('/api/admin/saas/calendar', { params: { from: otherDay, to: otherDay } })).json()
    expect(outOfRange.rows.some((r: any) => r.id === visit.id)).toBe(false)

    const wrongAgent = await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day, agentId: '999999' } })).json()
    expect(wrongAgent.rows.some((r: any) => r.id === visit.id)).toBe(false)
  })

  test('GET /calendar respeta el filtro de tipo, estado e inmueble', async () => {
    const visit = await createAppointment({ type: 'call', propertyId: developerPropertyId, propertyKind: 'developer' })
    const day = visit.scheduledAt.slice(0, 10)

    const byType = await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day, type: 'call' } })).json()
    expect(byType.rows.some((r: any) => r.id === visit.id)).toBe(true)
    const wrongType = await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day, type: 'other' } })).json()
    expect(wrongType.rows.some((r: any) => r.id === visit.id)).toBe(false)

    const byStatus = await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day, status: 'scheduled' } })).json()
    expect(byStatus.rows.some((r: any) => r.id === visit.id)).toBe(true)

    const byProperty = await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day, propertyId: String(developerPropertyId), propertyKind: 'developer' } })).json()
    expect(byProperty.rows.some((r: any) => r.id === visit.id)).toBe(true)

    const byOffice = await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day, office: 'Oficina Calendar E2E' } })).json()
    expect(byOffice.rows.some((r: any) => r.id === visit.id)).toBe(true)
    const wrongOffice = await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day, office: 'Otra oficina' } })).json()
    expect(wrongOffice.rows.some((r: any) => r.id === visit.id)).toBe(false)
  })

  test('mover una cita (drag&drop) valida conflictos con el mismo servicio que "Reprogramar"', async () => {
    const visit = await createAppointment()
    const newStart = randomFutureSlot()
    const res = await a.patch(`/api/admin/saas/visits/${visit.id}`, { data: { scheduledAt: newStart } })
    expect(res.ok()).toBeTruthy()
    const day = newStart.slice(0, 10)
    const rows = (await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day } })).json()).rows
    expect(rows.find((r: any) => r.id === visit.id)?.scheduledAt).toBe(newStart)
  })

  test('resize cambia la duración vía durationMinutes, con la misma validación de conflictos', async () => {
    const visit = await createAppointment()
    const res = await a.patch(`/api/admin/saas/visits/${visit.id}`, { data: { durationMinutes: 90 } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const day = visit.scheduledAt.slice(0, 10)
    const rows = (await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day } })).json()).rows
    const updated = rows.find((r: any) => r.id === visit.id)
    expect(updated.endsAt.slice(11, 16)).not.toBe(visit.endsAt?.slice(11, 16))

    const bad = await a.patch(`/api/admin/saas/visits/${visit.id}`, { data: { durationMinutes: 3 } })
    expect(bad.status()).toBe(422)
  })

  test('aislamiento entre tenants: las citas de una agencia no aparecen en el calendario de otra', async () => {
    const visit = await createAppointment()
    const day = visit.scheduledAt.slice(0, 10)
    const rowsB = (await (await b.get('/api/admin/saas/calendar', { params: { from: day, to: day } })).json()).rows
    expect(rowsB.some((r: any) => r.id === visit.id)).toBe(false)
  })

  test('la búsqueda de inmueble cubre los dos catálogos (web y 2ª mano) en un único resultado', async () => {
    const res = await a.get('/api/admin/saas/properties/search', { params: { q: 'E2E-Calendar' } })
    const { rows } = await res.json()
    expect(rows.some((r: any) => r.id === agentPropertyId && r.kind === 'agent')).toBe(true)
  })

  test('la pestaña Calendario del panel carga con sus cuatro sub-vistas y el filtro de propiedad', async ({ page }) => {
    await page.goto('/admin/visitas')
    await page.getByRole('button', { name: 'Calendario', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Día', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Semana', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mes', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agenda', exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Buscar…').first()).toBeVisible()
  })
})
