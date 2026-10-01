import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * FASE 32 — Lead Score explicable sobre HTTP real: la puntuación sale de
 * señales reales que el equipo registra (presupuesto validado, fecha
 * deseada, financiación, una visita), se explica criterio a criterio, cambia
 * con las reglas de la agencia sólo cuando se recalcula, y no cruza
 * agencias. El cálculo en sí (84/74 del encargo, caducidad, historial) está
 * en test/unit/leadScore.test.ts.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('Lead Score explicable (FASE 32)', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let apiKey: string
  let commercialId: number

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    const key = await a.post('/api/admin/saas/apikeys', { data: { name: `Score E2E ${RUN}`, environment: 'test', scopes: 'write' } })
    const keyBody = await key.json()
    apiKey = keyBody.key || keyBody.plainKey || keyBody.apiKey
    const team = await a.post('/api/admin/team', { data: { name: `Score E2E ${RUN}`, email: `score-${RUN}@example.com`, position: 'Comercial', slug: `score-e2e-${RUN}` } })
    commercialId = (await team.json()).id
  })

  test.afterAll(async () => {
    // Las reglas de la agencia A vuelven a las de por defecto: el resto de la suite comparte esta organización.
    await a.put('/api/admin/saas/leads-routing/sla-settings', { data: { scoreRules: [{ criterion: 'viewing_requested', points: 20 }] } })
    if (commercialId) await a.delete(`/api/admin/team/${commercialId}`)
    await Promise.all([a?.dispose(), b?.dispose()])
  })

  test('señales reales → puntuación explicada → reglas de la agencia → recálculo en bloque, y nada cruza de agencia', async ({ page }) => {
    // --- Alta: sin ninguna señal todavía, 0 con su desglose ------------------
    const email = `score-${RUN}@example.com`
    const leadRes = await a.post('/api/v1/leads', { headers: { Authorization: `Bearer ${apiKey}` }, data: { name: `Comprador Score ${RUN}`, email } })
    expect(leadRes.ok(), await leadRes.text()).toBeTruthy()
    const { data: lead } = await leadRes.json()
    let detail = await (await a.get('/api/admin/saas/leads', { params: { scoreFor: String(lead.id) } })).json()
    expect(detail.score).toBe(0)
    expect(detail.computedAt).toBeTruthy()
    expect(detail.breakdown.every((x: any) => x.applied === false)).toBe(true)

    // --- Señales reales: necesidad con fecha y financiación, presupuesto validado
    const desiredDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const reqRes = await a.post('/api/admin/saas/buyer-requirements', {
      data: { contactId: lead.contactId, title: `Necesidad score ${RUN}`, operation: 'sale', desiredDate, mortgageStatus: 'approved' },
    })
    expect(reqRes.ok(), await reqRes.text()).toBeTruthy()
    const requirement = await reqRes.json()
    expect((await a.post(`/api/admin/saas/buyer-requirements/${requirement.id}/validate-budget`, { data: { validated: true } })).ok()).toBeTruthy()

    // …y una visita a inmueble pedida.
    const scheduledAt = `${new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10)} 12:00:00`
    const visitRes = await a.post('/api/admin/saas/visits', {
      data: { clientName: `Comprador Score ${RUN}`, clientEmail: email, agentId: commercialId, scheduledAt, leadId: lead.id, type: 'property_viewing' },
    })
    expect(visitRes.ok(), await visitRes.text()).toBeTruthy()

    detail = await (await a.get('/api/admin/saas/leads', { params: { scoreFor: String(lead.id) } })).json()
    const applied = detail.breakdown.filter((x: any) => x.applied).map((x: any) => x.criterion).sort()
    expect(applied).toEqual(['budget_validated', 'financing_validated', 'purchase_horizon', 'viewing_requested'])
    expect(detail.score).toBe(20 + 10 + 15 + 20)
    expect(detail.history.length).toBeGreaterThanOrEqual(2)
    expect(detail.breakdown.find((x: any) => x.criterion === 'purchase_horizon').detail).toContain(desiredDate)

    // Orden y filtro por score.
    const top = await (await a.get('/api/admin/saas/leads', { params: { sort: 'score', scoreMin: '60' } })).json()
    expect(top.rows.some((r: any) => r.id === lead.id)).toBe(true)
    expect(top.rows.every((r: any) => r.score >= 60)).toBe(true)

    // --- «¿Por qué?» en el panel --------------------------------------------
    await page.goto('/admin/leads')
    await page.getByRole('button', { name: 'Tabla' }).click()
    await page.getByTestId(`lead-score-${lead.id}`).click()
    const panel = page.getByTestId('lead-score-detail')
    await expect(panel).toContainText('¿Por qué 65/100?')
    await expect(page.getByTestId('lead-score-breakdown')).toContainText('Presupuesto validado')
    await expect(page.getByTestId('lead-score-breakdown')).toContainText('Visita solicitada')

    // --- Reglas de la agencia: guardar no recalcula; recalcular sí ------------
    const saved = await a.put('/api/admin/saas/leads-routing/sla-settings', { data: { scoreRules: [{ criterion: 'viewing_requested', points: 30 }] } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    expect((await saved.json()).rules.find((r: any) => r.criterion === 'viewing_requested').points).toBe(30)
    expect((await (await a.get('/api/admin/saas/leads', { params: { scoreFor: String(lead.id) } })).json()).score).toBe(65)

    const job = await a.post('/api/admin/lead-bulk-jobs', { data: { action: 'recalculate_score', params: {}, ids: [lead.id] } })
    expect(job.ok(), await job.text()).toBeTruthy()
    const jobId = (await job.json()).job.id
    for (let i = 0; i < 10; i++) {
      const step = await (await a.put(`/api/admin/lead-bulk-jobs/${jobId}`, { data: {} })).json()
      if (step.done) break
    }
    detail = await (await a.get('/api/admin/saas/leads', { params: { scoreFor: String(lead.id) } })).json()
    expect(detail.score).toBe(75)
    expect(detail.history[0]).toMatchObject({ score: 75, reason: 'rules' })

    // Una regla inválida se rechaza en el servidor.
    expect((await a.put('/api/admin/saas/leads-routing/sla-settings', { data: { scoreRules: [{ criterion: 'magia', points: 10 }] } })).status()).toBe(422)

    // --- Aislamiento ------------------------------------------------------------
    expect((await b.get('/api/admin/saas/leads', { params: { scoreFor: String(lead.id) } })).status()).toBe(404)
    expect((await b.patch(`/api/admin/saas/leads/${lead.id}`, { data: { score: 'recalculate' } })).status()).toBe(404)
    const bRules = await (await b.get('/api/admin/saas/leads-routing/sla-settings', { params: { scope: 'score' } })).json()
    expect(bRules.rules.find((r: any) => r.criterion === 'viewing_requested').points).toBe(20)
  })
})
