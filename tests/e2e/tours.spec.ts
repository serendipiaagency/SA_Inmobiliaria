import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const AGENT_SLUG = 'perla-maria-melgarejo'

/**
 * FASE 18 — Tours (visitas multi-inmueble), sobre HTTP real.
 *
 * Un tour es sólo la cabecera; cada parada es una visita real, con su propio
 * estado y enlace de gestión (FASE 17). Lo que se comprueba aquí es lo que
 * no se ve mirando el código: que un tour se crea de una vez con todas sus
 * paradas, que dos paradas que chocan para el mismo comercial se rechazan
 * antes de crear nada, y que los tours de una agencia nunca aparecen en otra.
 */
function randomFutureSlot(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 7 + Math.floor(Math.random() * 50))
  const dateStr = d.toISOString().slice(0, 10)
  const hour = 9 + Math.floor(Math.random() * 6)
  return `${dateStr} ${String(hour).padStart(2, '0')}:00:00`
}

/** Shifts a 'YYYY-MM-DD HH:MM:SS' string by `minutes` (may be negative) — same computation the server itself uses. */
function shift(dateTime: string, minutes: number): string {
  return new Date(new Date(`${dateTime.replace(' ', 'T')}Z`).getTime() + minutes * 60_000).toISOString().replace('T', ' ').slice(0, 19)
}

test.describe('Tours — visitas multi-inmueble', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let agentId: number

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })

    const agentsRes = await a.get('/api/admin/saas/agents')
    const { rows } = await agentsRes.json()
    const agent = rows.find((r: any) => r.slug === AGENT_SLUG)
    expect(agent).toBeTruthy()
    agentId = agent.id

    const put = await a.put(`/api/admin/saas/agents/${agentId}/availability`, {
      data: { slotDurationMinutes: 30, rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '18:00' })) },
    })
    expect(put.ok()).toBeTruthy()
  })

  test.afterAll(async () => {
    await a?.dispose()
    await b?.dispose()
  })

  test('crea un tour con varias paradas de una vez, cada una como cita real e independiente', async () => {
    const stop1 = randomFutureSlot()
    const stop2 = shift(stop1, 120) // 2h después, sin solape

    const res = await a.post('/api/admin/saas/tours', {
      data: {
        clientName: `Tour E2E ${Date.now()}`,
        clientEmail: `tour-e2e-${Date.now()}@example.com`,
        stops: [
          { agentId, scheduledAt: stop1 },
          { agentId, scheduledAt: stop2 },
        ],
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const { id, stopIds } = await res.json()
    expect(stopIds).toHaveLength(2)

    const listRes = await a.get('/api/admin/saas/tours')
    const { rows } = await listRes.json()
    const tour = rows.find((t: any) => t.id === id)
    expect(tour).toBeTruthy()
    expect(tour.stops).toHaveLength(2)
    expect(tour.stops.map((s: any) => s.scheduledAt)).toEqual([stop1, stop2])
    expect(tour.stops.every((s: any) => s.status === 'scheduled' && s.confirmationStatus === 'pending')).toBe(true)

    // Cancelar una parada no toca la otra — no hay estado de tour, sólo el de cada parada.
    const cancelRes = await a.patch(`/api/admin/saas/visits/${tour.stops[0].id}`, { data: { status: 'cancelled' } })
    expect(cancelRes.ok()).toBeTruthy()
    const afterRes = await a.get('/api/admin/saas/tours')
    const afterTour = (await afterRes.json()).rows.find((t: any) => t.id === id)
    expect(afterTour.stops[0].status).toBe('cancelled')
    expect(afterTour.stops[1].status).toBe('scheduled')
  })

  test('rechaza dos paradas que se solapan para el mismo comercial, sin crear el tour', async () => {
    const stop1 = randomFutureSlot()
    const stop2 = shift(stop1, 10) // 10 min después, dentro de la misma franja de 30 min

    const res = await a.post('/api/admin/saas/tours', {
      data: {
        clientName: `Tour Choque ${Date.now()}`,
        clientEmail: `tour-choque-${Date.now()}@example.com`,
        stops: [
          { agentId, scheduledAt: stop1 },
          { agentId, scheduledAt: stop2 },
        ],
      },
    })
    expect(res.status()).toBe(422)
  })

  test('aislamiento entre tenants: los tours de una agencia nunca aparecen en otra', async () => {
    const res = await a.post('/api/admin/saas/tours', {
      data: { clientName: `Tour Aislado ${Date.now()}`, clientEmail: `tour-aislado-${Date.now()}@example.com`, stops: [{ agentId, scheduledAt: randomFutureSlot() }] },
    })
    expect(res.ok()).toBeTruthy()
    const { id } = await res.json()

    const listB = await b.get('/api/admin/saas/tours')
    const { rows } = await listB.json()
    expect(rows.some((t: any) => t.id === id)).toBe(false)
  })
})
