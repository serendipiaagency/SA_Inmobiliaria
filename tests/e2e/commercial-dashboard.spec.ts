import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * FASE 33 — Dashboard comercial sobre HTTP real: los KPIs salen de datos
 * reales (aquí, leads creados por la API con una campaña propia de esta
 * ejecución), cada uno con su definición, el filtro combinado se aplica
 * igual a todo, el detalle abre Leads con el mismo scope, y nada cruza de
 * agencia. Los números exactos del encargo (§137/§138) están en
 * test/unit/commercialDashboard.test.ts.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const today = new Date().toISOString().slice(0, 10)

test.describe('Dashboard comercial (FASE 33)', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let apiKey: string

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    const key = await a.post('/api/admin/saas/apikeys', { data: { name: `Dashboard E2E ${RUN}`, environment: 'test', scopes: 'write' } })
    const body = await key.json()
    apiKey = body.key || body.plainKey || body.apiKey
  })

  test.afterAll(async () => {
    await Promise.all([a?.dispose(), b?.dispose()])
  })

  test('KPIs reales con su definición, filtro de campaña en todo, detalle filtrado en Leads y aislamiento', async ({ page }) => {
    // Tres leads reales por la API v1 (pasan por upsertLead, como cualquier
    // entrada; su origen es «api»), uno de ellos cualificado.
    const ids: number[] = []
    for (let i = 0; i < 3; i++) {
      const res = await a.post('/api/v1/leads', { headers: { Authorization: `Bearer ${apiKey}` }, data: { name: `Dashboard ${RUN} ${i}`, email: `dash-${RUN}-${i}@example.com` } })
      expect(res.ok(), await res.text()).toBeTruthy()
      ids.push((await res.json()).data.id)
    }
    expect((await a.patch(`/api/admin/saas/leads/${ids[0]}`, { data: { stage: 'qualified' } })).ok()).toBeTruthy()

    const res = await a.get('/api/admin/saas/overview', { params: { view: 'commercial', from: today, to: today, source: 'api' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const d = await res.json()
    expect(d.scope).toMatchObject({ from: today, to: today, source: 'api' })
    expect(d.kpis.newLeads.value).toBeGreaterThanOrEqual(3)
    expect(d.kpis.qualifiedLeads.value).toBeGreaterThanOrEqual(1)
    expect(d.funnel.stages[0].value).toBe(d.kpis.newLeads.value)
    for (const k of Object.values(d.kpis) as any[]) expect(k.definition, 'cada KPI explica qué cuenta').toBeTruthy()
    expect(d.comparison, 'sin pedir comparación no hay comparación').toBeNull()

    // Una campaña que no existe deja todo a cero — el filtro se aplica a todos los KPIs.
    const none = await (await a.get('/api/admin/saas/overview', { params: { view: 'commercial', from: today, to: today, campaign: `no-existe-${RUN}` } })).json()
    expect(none.kpis.newLeads.value).toBe(0)
    expect(none.funnel.stages.every((s: any) => s.value === 0)).toBe(true)

    // Periodo inválido → 422, no un dashboard vacío engañoso.
    expect((await a.get('/api/admin/saas/overview', { params: { view: 'commercial', from: '2026-12-01', to: '2026-01-01' } })).status()).toBe(422)

    // --- En el panel: tarjetas con definición y detalle filtrado --------------
    await page.goto('/admin/rendimiento')
    await expect(page.getByTestId('kpi-new-leads')).toContainText('Leads creados en el periodo')
    await expect(page.getByTestId('dash-funnel')).toContainText('Cohorte')
    await page.getByTestId('dash-source').selectOption('api')
    await page.getByTestId('dash-preset').selectOption('today')
    await page.getByTestId('kpi-new-leads').click()
    await expect(page).toHaveURL(/\/admin\/leads\?.*createdFrom=/)
    await expect(page.getByTestId('leads-drill-chip')).toBeVisible()
    await expect(page.getByText(`Dashboard ${RUN} 0`).first()).toBeVisible()

    // --- Aislamiento -----------------------------------------------------------
    const other = await (await b.get('/api/admin/saas/overview', { params: { view: 'commercial', from: today, to: today, source: 'api' } })).json()
    const otherLeads = await (await b.get('/api/admin/saas/leads', { params: { createdFrom: today, createdTo: today, source: 'api' } })).json()
    expect(otherLeads.rows.some((r: any) => ids.includes(r.id))).toBe(false)
    expect(other.kpis.newLeads.value).toBe(otherLeads.rows.length)
  })
})
