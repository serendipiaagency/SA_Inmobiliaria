import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * FASE 21 — Activity Timeline, sobre HTTP real.
 *
 * No usa el endpoint público de reserva ni el de contacto (ambos con rate
 * limit compartido con otros specs — lección de FASE 19/20): las citas se
 * crean con el endpoint admin de FASE 20 (POST /api/admin/saas/visits, sin
 * límite), y BuyerRequirement/Match no tienen límite propio.
 */
test.describe('Activity Timeline (FASE 21)', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let agentId: number
  let developerPropertyId: number
  const createdDeveloperPropertyIds: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })

    const agentsRes = await a.get('/api/admin/saas/agents')
    agentId = (await agentsRes.json()).rows[0].id

    const devOwnerRes = await a.post('/api/admin/developers', { data: { name: `Dev Activity E2E ${Date.now()}`, email: `dev-activity-${Date.now()}@mm.test`, status: 'active' } })
    const { id: developerId } = await devOwnerRes.json()
    const devPropRes = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Propiedad Activity E2E ${Date.now()}`, status: 'new', price: 250000, transactionType: 'sale' } })
    developerPropertyId = (await devPropRes.json()).id
    createdDeveloperPropertyIds.push(developerPropertyId)
  })

  test.afterAll(async () => {
    await Promise.all(createdDeveloperPropertyIds.map((id) => a.delete(`/api/admin/developer-properties/${id}`)))
    await a?.dispose()
    await b?.dispose()
  })

  async function seedContact(ctx: APIRequestContext, tag: string) {
    const res = await ctx.post('/api/admin/saas/contacts', { data: { name: `E2E Activity ${tag}`, email: `e2e-activity-${tag}-${Date.now()}@example.com` } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).id as number
  }

  test('GET /activity exige un filtro de entidad', async () => {
    const res = await a.get('/api/admin/saas/activity')
    expect(res.status()).toBe(422)
  })

  test('crear una necesidad y decidir sobre un match registra BUYER_REQUIREMENT_CREATED y MATCH_SELECTED/DISCARDED', async () => {
    const contactId = await seedContact(a, 'match')
    const reqRes = await a.post('/api/admin/saas/buyer-requirements', { data: { contactId, operation: 'sale' } })
    expect(reqRes.ok(), await reqRes.text()).toBeTruthy()
    const requirement = await reqRes.json()

    const selectRes = await a.post('/api/admin/saas/matching/matches', {
      data: { buyerRequirementId: requirement.id, propertyId: developerPropertyId, propertyKind: 'developer', status: 'selected' },
    })
    expect(selectRes.ok(), await selectRes.text()).toBeTruthy()

    const { rows } = await (await a.get('/api/admin/saas/activity', { params: { contactId: String(contactId) } })).json()
    const types = rows.map((r: any) => r.eventType)
    expect(types).toContain('BUYER_REQUIREMENT_CREATED')
    expect(types).toContain('MATCH_SELECTED')
  })

  test('crear y cancelar una cita registra APPOINTMENT_CREATED y APPOINTMENT_CANCELLED', async () => {
    const start = new Date()
    start.setUTCDate(start.getUTCDate() + 30 + Math.floor(Math.random() * 20))
    const scheduledAt = `${start.toISOString().slice(0, 10)} 10:00:00`

    const visitRes = await a.post('/api/admin/saas/visits', {
      data: { clientName: 'E2E Activity Appointment', clientEmail: `e2e-activity-appt-${Date.now()}@example.com`, agentId, scheduledAt },
    })
    expect(visitRes.ok(), await visitRes.text()).toBeTruthy()
    const visit = await visitRes.json()

    // Cancelar exige motivo (núcleo N5, FASE 17).
    const cancelRes = await a.patch(`/api/admin/saas/visits/${visit.id}`, { data: { status: 'cancelled', cancellationReason: 'Prueba E2E de actividad' } })
    expect(cancelRes.ok()).toBeTruthy()

    const { rows } = await (await a.get('/api/admin/saas/activity', { params: { appointmentId: String(visit.id) } })).json()
    expect(rows.map((r: any) => r.eventType).sort()).toEqual(['APPOINTMENT_CANCELLED', 'APPOINTMENT_CREATED'])
  })

  test('aislamiento entre tenants: la actividad de un contacto de otra agencia no se puede leer', async () => {
    const contactId = await seedContact(a, 'tenant')
    await a.post('/api/admin/saas/buyer-requirements', { data: { contactId, operation: 'rent' } })

    const res = await b.get('/api/admin/saas/activity', { params: { contactId: String(contactId) } })
    // 200 con lista vacía (el filtro ya va acotado por la organización del token) — nunca la actividad de otra agencia.
    expect(res.ok()).toBeTruthy()
    const { rows } = await res.json()
    expect(rows).toHaveLength(0)
  })
})
