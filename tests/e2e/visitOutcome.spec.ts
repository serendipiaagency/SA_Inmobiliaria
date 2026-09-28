import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const AGENT_SLUG = 'perla-maria-melgarejo'

/**
 * FASE 19 — Visit Outcome, sobre HTTP real.
 *
 * El resultado de una visita es percepción del comercial, nunca un hecho:
 * sólo tiene sentido sobre una visita que de verdad ocurrió (status
 * 'completed'), y sólo vive en esa visita — nada de lo que se comprueba aquí
 * toca el catálogo ni las Necesidades del comprador (eso ya lo cubre el test
 * unitario dedicado, comparando tablas fila a fila).
 *
 * Las visitas que necesitan estos tests se siembran como tours de una sola
 * parada (POST /api/admin/saas/tours) en vez de por la reserva pública
 * (POST /api/public/agents/.../book): lo que se prueba aquí es el endpoint
 * de resultado, no el propio flujo de reserva —y ese sí está limitado a 8
 * peticiones por IP cada 10 minutos (server/utils/rateLimit.ts), un
 * presupuesto que tests/e2e/appointments.spec.ts ya usa casi entero dentro
 * de la misma sesión continua de `scripts/e2e.sh`.
 */
function randomFutureSlot(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 7 + Math.floor(Math.random() * 50))
  const dateStr = d.toISOString().slice(0, 10)
  const hour = 9 + Math.floor(Math.random() * 6)
  return `${dateStr} ${String(hour).padStart(2, '0')}:00:00`
}

test.describe('Resultado de visita', () => {
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
  })

  test.afterAll(async () => {
    await a?.dispose()
    await b?.dispose()
  })

  async function seedVisit(tag: string) {
    const res = await a.post('/api/admin/saas/tours', {
      data: {
        clientName: `E2E Outcome ${tag}`,
        clientEmail: `e2e-outcome-${tag}-${Date.now()}@example.com`,
        stops: [{ agentId, scheduledAt: randomFutureSlot() }],
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const { stopIds } = await res.json()
    return stopIds[0] as number
  }

  test('anota el resultado de una visita completada, y se ve en el listado admin', async () => {
    const visitId = await seedVisit('happy')
    const completed = await a.patch(`/api/admin/saas/visits/${visitId}`, { data: { status: 'completed' } })
    expect(completed.ok()).toBeTruthy()

    const outcomeRes = await a.post(`/api/admin/saas/visits/${visitId}/outcome`, { data: { outcome: 'interested', notes: 'Muy interesado, pide segunda visita' } })
    expect(outcomeRes.ok(), await outcomeRes.text()).toBeTruthy()

    const listRes = await a.get('/api/admin/saas/visits')
    const { rows } = await listRes.json()
    const visit = rows.find((v: any) => v.id === visitId)
    expect(visit.outcome).toBe('interested')
    expect(visit.outcomeNotes).toBe('Muy interesado, pide segunda visita')
  })

  test('rechaza anotar el resultado de una visita que todavía no ha ocurrido', async () => {
    const visitId = await seedVisit('scheduled')
    const res = await a.post(`/api/admin/saas/visits/${visitId}/outcome`, { data: { outcome: 'interested' } })
    expect(res.status()).toBe(422)
  })

  test('rechaza un resultado que no está en la lista cerrada', async () => {
    const visitId = await seedVisit('invalid')
    await a.patch(`/api/admin/saas/visits/${visitId}`, { data: { status: 'completed' } })
    const res = await a.post(`/api/admin/saas/visits/${visitId}/outcome`, { data: { outcome: 'le_encanto_muchisimo' } })
    expect(res.status()).toBe(422)
  })

  test('aislamiento entre tenants: no se puede anotar el resultado de una visita de otra agencia', async () => {
    const visitId = await seedVisit('tenant')
    await a.patch(`/api/admin/saas/visits/${visitId}`, { data: { status: 'completed' } })
    const res = await b.post(`/api/admin/saas/visits/${visitId}/outcome`, { data: { outcome: 'interested' } })
    expect(res.status()).toBe(404)
  })
})
