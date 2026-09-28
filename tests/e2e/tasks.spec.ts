import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * FASE 22 — Task + Next Action, sobre HTTP real.
 *
 * Comercial propio (igual que calendar.spec.ts/activity.spec.ts, lección de
 * FASE 19-21): evita compartir agenda con otros specs que reservan citas en
 * el mismo pool de fechas aleatorias.
 */
test.describe('Tareas + Próxima acción (FASE 22)', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let agentId: number

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })

    const agentRes = await a.post('/api/admin/team', {
      data: { name: `E2E Tasks Comercial ${Date.now()}`, email: `e2e-tasks-comercial-${Date.now()}@example.com`, position: 'Comercial', slug: `e2e-tasks-comercial-${Date.now()}` },
    })
    expect(agentRes.ok(), await agentRes.text()).toBeTruthy()
    agentId = (await agentRes.json()).id
  })

  test.afterAll(async () => {
    await a?.dispose()
    await b?.dispose()
  })

  test('crear, listar y completar una tarea suelta', async () => {
    const createRes = await a.post('/api/admin/saas/tasks', { data: { type: 'call', title: 'Llamar para confirmar', assigneeId: agentId, priority: 'high' } })
    expect(createRes.ok(), await createRes.text()).toBeTruthy()
    const task = await createRes.json()
    expect(task.status).toBe('open')

    const listRes = await a.get('/api/admin/saas/tasks', { params: { assigneeId: String(agentId) } })
    const { rows } = await listRes.json()
    expect(rows.some((r: any) => r.id === task.id)).toBe(true)

    const completeRes = await a.patch(`/api/admin/saas/tasks/${task.id}`, { data: { status: 'completed' } })
    expect(completeRes.ok(), await completeRes.text()).toBeTruthy()
    const completed = await completeRes.json()
    expect(completed.status).toBe('completed')
    expect(completed.completedAt).toBeTruthy()
  })

  test('crear una tarea sin título o con un tipo inválido se rechaza con 422', async () => {
    const noTitle = await a.post('/api/admin/saas/tasks', { data: { type: 'call', title: '' } })
    expect(noTitle.status()).toBe(422)
    const badType = await a.post('/api/admin/saas/tasks', { data: { type: 'not_a_type', title: 'X' } })
    expect(badType.status()).toBe(422)
  })

  test('una tarea ligada a un contacto aparece al filtrar por ese contacto, y en su ficha 360º (related)', async () => {
    const contactRes = await a.post('/api/admin/saas/contacts', { data: { name: 'E2E Tasks Contact', email: `e2e-tasks-contact-${Date.now()}@example.com` } })
    const contact = await contactRes.json()

    const taskRes = await a.post('/api/admin/saas/tasks', { data: { type: 'follow_up', title: 'Seguimiento contacto', contactId: contact.id, dueAt: '2027-01-15 10:00:00' } })
    expect(taskRes.ok(), await taskRes.text()).toBeTruthy()

    const { rows } = await (await a.get('/api/admin/saas/tasks', { params: { contactId: String(contact.id) } })).json()
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Seguimiento contacto')
  })

  test('anotar el resultado de una visita con seguimiento crea una Task real', async () => {
    const start = new Date()
    start.setUTCDate(start.getUTCDate() + 30 + Math.floor(Math.random() * 20))
    const scheduledAt = `${start.toISOString().slice(0, 10)} 09:00:00`
    const visitRes = await a.post('/api/admin/saas/visits', { data: { clientName: 'E2E Tasks Outcome', clientEmail: `e2e-tasks-outcome-${Date.now()}@example.com`, agentId, scheduledAt } })
    const visit = await visitRes.json()

    await a.patch(`/api/admin/saas/visits/${visit.id}`, { data: { status: 'completed' } })
    const followDue = new Date(start.getTime() + 7 * 86_400_000).toISOString().slice(0, 10) + ' 10:00:00'
    const outcomeRes = await a.post(`/api/admin/saas/visits/${visit.id}/outcome`, { data: { outcome: 'wants_to_think', followUp: { dueAt: followDue } } })
    expect(outcomeRes.ok(), await outcomeRes.text()).toBeTruthy()

    const { rows } = await (await a.get('/api/admin/saas/tasks', { params: { appointmentId: String(visit.id) } })).json()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ type: 'follow_up', dueAt: followDue })
  })

  test('aislamiento entre tenants: las tareas de una agencia no aparecen en el listado de otra', async () => {
    const createRes = await a.post('/api/admin/saas/tasks', { data: { type: 'other', title: 'Sólo de esta agencia' } })
    const task = await createRes.json()

    const { rows } = await (await b.get('/api/admin/saas/tasks')).json()
    expect(rows.some((r: any) => r.id === task.id)).toBe(false)
  })
})
