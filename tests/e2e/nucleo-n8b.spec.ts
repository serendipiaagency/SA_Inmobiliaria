import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Núcleo inmobiliario, bloque N8b: automatizaciones reales (disparador →
 * condiciones → acción, con registro de ejecuciones), base de conocimiento
 * de INMO con fuentes citables y perfiles («cerebros») que sólo recortan
 * herramientas. Todo acotado a la agencia.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const visible = (page: import('@playwright/test').Page, testId: string) => page.locator(`[data-testid="${testId}"]:visible`)

test.describe('N8b — automatizaciones reales e INMO Intelligence', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let automationId: number
  let knowledgeId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
  })

  test('automatización «lead creado → crear tarea»: sólo eventos posteriores, registro de ejecución y aislamiento', async () => {
    const catalog = await (await a.get('/api/admin/automations', { params: { view: 'catalog' } })).json()
    expect(catalog.triggers.map((t: any) => t.key)).toContain('lead.created')
    expect(catalog.actions.map((x: any) => x.key)).toContain('create_task')

    // Un lead anterior a la automatización no la dispara.
    const before = await a.post('/api/admin/leads', { data: { name: `Antes ${RUN}`, email: `antes-${RUN}@n8b.test`, source: 'walk_in' } })
    expect(before.ok(), await before.text()).toBeTruthy()
    const beforeId = (await before.json()).id

    // Acción no válida o sin título: 422, nada creado.
    expect((await a.post('/api/admin/automations', { data: { name: 'Mal', trigger: 'lead.created', action: 'create_task', config: {} } })).status()).toBe(422)
    expect((await a.post('/api/admin/automations', { data: { name: 'Mal', trigger: 'lead.inventado', action: 'create_task', config: { title: 'x' } } })).status()).toBe(422)

    const created = await a.post('/api/admin/automations', {
      data: { name: `Primer contacto ${RUN}`, trigger: 'lead.created', action: 'create_task', conditions: [{ field: 'lead.source', op: 'eq', value: 'walk_in' }], config: { title: 'Llamar a {{nombre}}', dueInHours: 2, assignee: 'none' } },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    automationId = (await created.json()).id
    cleanup.push(() => a.delete(`/api/admin/automations/${automationId}`))

    const lead = await a.post('/api/admin/leads', { data: { name: `Después ${RUN}`, email: `despues-${RUN}@n8b.test`, source: 'walk_in' } })
    expect(lead.ok(), await lead.text()).toBeTruthy()
    const leadId = (await lead.json()).id
    // Otro origen: la condición no se cumple y queda «No aplica».
    const other = await a.post('/api/admin/leads', { data: { name: `Otro origen ${RUN}`, email: `otro-${RUN}@n8b.test`, source: 'call' } })
    expect(other.ok(), await other.text()).toBeTruthy()

    const run = await a.put(`/api/admin/automations/${automationId}`, { data: { action: 'run' } })
    expect(run.ok(), await run.text()).toBeTruthy()

    const detail = await (await a.get(`/api/admin/automations/${automationId}`)).json()
    const ok = (detail.runs as any[]).filter((r) => r.status === 'ok')
    expect(ok.length).toBeGreaterThanOrEqual(1)
    expect((detail.runs as any[]).some((r) => r.status === 'skipped')).toBe(true)
    expect(detail.row.runsCount).toBeGreaterThanOrEqual(1)

    const tasks = JSON.stringify(await (await a.get('/api/admin/saas/tasks', { params: { leadId: String(leadId) } })).json())
    expect(tasks).toContain(`Llamar a Después ${RUN}`)
    const tasksBefore = JSON.stringify(await (await a.get('/api/admin/saas/tasks', { params: { leadId: String(beforeId) } })).json())
    expect(tasksBefore).not.toContain('Llamar a')

    // Procesar otra vez no repite: cada evento dispara una sola vez.
    await a.put(`/api/admin/automations/${automationId}`, { data: { action: 'run' } })
    const again = await (await a.get(`/api/admin/automations/${automationId}`)).json()
    expect((again.runs as any[]).filter((r) => r.status === 'ok').length).toBe(ok.length)

    // Desactivada no procesa; otra agencia ni la ve ni la ejecuta.
    expect((await a.put(`/api/admin/automations/${automationId}`, { data: { enabled: false } })).ok()).toBeTruthy()
    expect((await a.put(`/api/admin/automations/${automationId}`, { data: { action: 'run' } })).status()).toBe(422)
    expect((await b.get(`/api/admin/automations/${automationId}`)).status()).toBe(404)
    expect((await b.put(`/api/admin/automations/${automationId}`, { data: { action: 'run' } })).status()).toBe(404)
    const bList = await (await b.get('/api/admin/automations', { params: { perPage: '100' } })).json()
    expect((bList.rows as any[]).some((r) => r.id === automationId)).toBe(false)
  })

  test('base de conocimiento: INMO la encuentra con su fuente y otra agencia no', async () => {
    const word = `zarzaparrilla${RUN.replace(/\D/g, '')}`
    const created = await a.post('/api/admin/knowledge-documents', { data: { title: `Política de arras ${RUN}`, body: `Las arras penitenciales son del 10 %. Palabra clave: ${word}.`, tags: 'arras, política' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    knowledgeId = (await created.json()).id
    cleanup.push(() => a.delete(`/api/admin/knowledge-documents/${knowledgeId}`))

    const found = await (await a.post('/api/admin/domain-tools', { data: { tool: 'search_knowledge', input: { query: word } } })).json()
    const hit = (found.output.results as any[]).find((r) => r.sourceType === 'knowledge' && String(r.sourceId) === String(knowledgeId))
    expect(hit).toBeTruthy()
    expect(hit.ref).toMatch(/^F\d+$/)

    const foundB = await (await b.post('/api/admin/domain-tools', { data: { tool: 'search_knowledge', input: { query: word } } })).json()
    expect((foundB.output.results as any[]).some((r) => r.sourceType === 'knowledge')).toBe(false)
    expect((await b.get(`/api/admin/knowledge-documents/${knowledgeId}`)).status()).toBe(404)
  })

  test('perfiles de INMO: sólo se pueden recortar herramientas, nunca añadir', async () => {
    const brains = (await (await a.get('/api/admin/domain-tools', { params: { view: 'brains' } })).json()).brains as any[]
    expect(brains.length).toBeGreaterThan(0)
    const catalog = await (await a.get('/api/admin/domain-tools', { params: { view: 'catalog' } })).json()
    const allTools: string[] = (catalog.tools || catalog.rows || []).map((t: any) => t.name)
    const brain = brains.find((x) => !x.settingsId && allTools.some((t) => !x.baseTools.includes(t)))
    test.skip(!brain, 'todos los perfiles tienen todas las herramientas')
    const extra = allTools.find((t) => !brain.baseTools.includes(t))!
    const res = await a.post('/api/admin/inmo-brains', { data: { brainKey: brain.key, enabled: 1, toolsJson: [...brain.baseTools.slice(0, 1), extra] } })
    expect(res.status()).toBe(422)
  })

  test('las pantallas: Automatizaciones e INMO: conocimiento', async ({ page }) => {
    await page.goto('/admin/automatizaciones')
    await expect(visible(page, 'automations-list')).toBeVisible()
    await expect(visible(page, `automation-${automationId}`)).toBeVisible()

    await page.goto('/admin/inmo-ajustes')
    await visible(page, 'inmo-tab-knowledge').click()
    await expect(visible(page, `knowledge-doc-${knowledgeId}`)).toBeVisible()
    await visible(page, 'inmo-tab-brains').click()
    await expect(visible(page, 'inmo-brains')).toBeVisible()
  })
})
