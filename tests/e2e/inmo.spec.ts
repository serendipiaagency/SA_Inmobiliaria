import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * FASES 30-31 — INMO y la Domain Tools API sobre HTTP real. El «modelo» es
 * la Messages API guionizada de scripts/e2e-provider-mock.mjs (AI_BASE_URL
 * sólo-loopback): lo que se prueba es lo nuestro — que la búsqueda pasa por
 * search_properties con criterios estructurados, que un refinamiento
 * mantiene el contexto, que agendar espera a «Confirmar», que cada paso deja
 * procedencia y traza, y que nada cruza de agencia.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}${Math.floor(Math.random() * 1000)}`
const ZONE = `Inmozona${RUN}`

test.describe('INMO + Domain Tools API (FASES 30-31)', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let apiKey: string
  let commercialId: number
  let projectId: number
  let foreignPropertyId: number
  const createdAgentProperties: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })

    const mk = async (ctx: APIRequestContext, data: Record<string, unknown>) => {
      const res = await ctx.post('/api/admin/properties', { data: { slug: `e2e-inmo-${RUN}-${Math.random().toString(36).slice(2)}`, status: 'available', city: 'Madrid', district: ZONE, ...data } })
      expect(res.ok(), await res.text()).toBeTruthy()
      return (await res.json()).id as number
    }
    createdAgentProperties.push(await mk(a, { street: 'Calle Terraza E2E', price: 600000, hasTerrace: 1 }))
    createdAgentProperties.push(await mk(a, { street: 'Calle Sin Terraza E2E', price: 550000, hasTerrace: 0 }))
    createdAgentProperties.push(await mk(a, { street: 'Calle Cara E2E', price: 900000, hasTerrace: 1 }))
    foreignPropertyId = await mk(b, { street: 'Calle Agencia B E2E', price: 500000, hasTerrace: 1 })

    const key = await a.post('/api/admin/saas/apikeys', { data: { name: `INMO E2E ${RUN}`, environment: 'test', scopes: 'write' } })
    const keyBody = await key.json()
    apiKey = keyBody.key || keyBody.plainKey || keyBody.apiKey
    const team = await a.post('/api/admin/team', { data: { name: `INMO E2E ${RUN}`, email: `inmo-${RUN}@example.com`, position: 'Comercial', slug: `inmo-e2e-${RUN}` } })
    commercialId = (await team.json()).id
    const dev = await (await a.post('/api/admin/developers', { data: { name: `Dev INMO ${RUN}`, email: `dev-inmo-${RUN}@mm.test`, status: 'active' } })).json()
    projectId = (await (await a.post('/api/admin/developer-properties', { data: { developerId: dev.id, name: `Proyecto INMO ${RUN}`, status: 'new', price: 400000 } })).json()).id
  })

  test.afterAll(async () => {
    for (const id of createdAgentProperties) await a.delete(`/api/admin/properties/${id}`)
    if (foreignPropertyId) await b.delete(`/api/admin/properties/${foreignPropertyId}`)
    await Promise.all([a?.dispose(), b?.dispose()])
  })

  test('buscar → refinar → agendar con confirmación, con procedencia y traza', async ({ page }) => {
    await page.goto('/admin/inmo')
    await expect(page.getByRole('heading', { name: 'INMO' })).toBeVisible()

    // --- Búsqueda estructurada (§5-§7): zona + precio máximo ------------------
    await page.getByTestId('inmo-input').fill(`Busca pisos en ${ZONE} por menos de 650.000 €`)
    await page.getByTestId('inmo-send').click()
    const first = page.getByTestId('inmo-reply').last()
    await expect(first).toContainText('Encontré 2')
    await expect(first).toContainText('Calle Terraza E2E')
    await expect(first).toContainText('Calle Sin Terraza E2E')
    await expect(first).not.toContainText('Calle Cara E2E')
    await expect(first).not.toContainText('Agencia B')
    await expect(first.getByTestId('inmo-source-search_properties')).toContainText('2 resultados')

    // --- Refinamiento con contexto (§15) --------------------------------------
    await page.getByTestId('inmo-input').fill('Solo con terraza.')
    await page.getByTestId('inmo-send').click()
    const second = page.getByTestId('inmo-reply').last()
    await expect(second).toContainText('Encontré 1: Calle Terraza E2E')

    // --- Agendar: pendiente hasta confirmar (§20) ----------------------------
    const leadRes = await a.post('/api/v1/leads', { headers: { Authorization: `Bearer ${apiKey}` }, data: { name: `Comprador INMO ${RUN}`, email: `inmo-lead-${RUN}@example.com` } })
    expect(leadRes.ok(), await leadRes.text()).toBeTruthy()
    const { data: lead } = await leadRes.json()
    const when = '2026-12-03 11:00'
    const visitsFor = async () => ((await (await a.get('/api/admin/saas/visits')).json()).rows as any[]).filter((v) => v.leadId === lead.id)

    await page.getByTestId('inmo-input').fill(`Agenda visita lead ${lead.id} comercial ${commercialId} propiedad ${projectId} el ${when}`)
    await page.getByTestId('inmo-send').click()
    const pendingCard = page.getByTestId('inmo-pending')
    await expect(pendingCard).toBeVisible()
    await expect(pendingCard).toContainText('agendar visita')
    await expect(pendingCard).toContainText(`${when}:00`)
    await expect(page.getByTestId('inmo-input')).toBeDisabled()
    expect(await visitsFor()).toHaveLength(0)

    await page.getByTestId('inmo-confirm').click()
    await expect(page.getByTestId('inmo-reply').last()).toContainText('Visita agendada (cita')
    await expect(pendingCard).toHaveCount(0)
    const visits = await visitsFor()
    expect(visits).toHaveLength(1)
    expect(visits[0].scheduledAt).toBe(`${when}:00`)
    expect(visits[0].agentId).toBe(commercialId)
    await expect(page.getByTestId('inmo-entities')).toContainText(`Cita #${visits[0].id}`)

    // --- Traza (§47/§51): cada herramienta, con origen INMO ------------------
    const trace = await (await a.get('/api/admin/domain-tools', { params: { perPage: '100' } })).json()
    const rows: any[] = trace.rows
    const mine = rows.filter((r) => r.source === 'inmo')
    expect(mine.some((r) => r.tool === 'search_properties' && r.status === 'ok')).toBe(true)
    expect(mine.some((r) => r.tool === 'book_viewing' && r.status === 'ok' && r.targetId === visits[0].id)).toBe(true)
    // La otra agencia no ve nada de esto.
    const traceB = await (await b.get('/api/admin/domain-tools', { params: { perPage: '100' } })).json()
    expect(traceB.rows.some((r: any) => r.targetId === visits[0].id && r.tool === 'book_viewing')).toBe(false)
  })

  test('Domain Tools API directa: catálogo según permisos, errores tipados, confirmación y aislamiento', async () => {
    const catalog = await (await a.get('/api/admin/domain-tools', { params: { view: 'catalog' } })).json()
    const names = catalog.tools.map((t: any) => t.name)
    expect(names).toEqual(expect.arrayContaining(['search_properties', 'get_property', 'create_lead', 'find_matches', 'book_viewing', 'send_property', 'create_offer', 'find_contacts']))
    expect(catalog.tools.find((t: any) => t.name === 'book_viewing').requiresConfirmation).toBe(true)

    // Propiedad de otra agencia → 404 NOT_FOUND, sin datos.
    const foreign = await a.post('/api/admin/domain-tools', { data: { tool: 'get_property', input: { propertyId: foreignPropertyId, propertyKind: 'agent' } } })
    expect(foreign.status()).toBe(404)
    const fb = await foreign.json()
    expect(fb.error.code).toBe('NOT_FOUND')
    expect(JSON.stringify(fb)).not.toContain('Agencia B')

    // Vista pública de una propia: DTO compacto.
    const own = await (await a.post('/api/admin/domain-tools', { data: { tool: 'get_property', input: { propertyId: createdAgentProperties[0], propertyKind: 'agent', view: 'public' } } })).json()
    expect(own.ok).toBe(true)
    expect(own.output).toMatchObject({ id: createdAgentProperties[0], kind: 'agent', features: ['terrace'], view: 'public' })
    expect(own.output.organizationId).toBeUndefined()

    // Escritura con efectos sin confirmar → 409 CONFIRMATION_REQUIRED.
    const unconfirmed = await a.post('/api/admin/domain-tools', { data: { tool: 'cancel_viewing', input: { appointmentId: 1 } } })
    expect(unconfirmed.status()).toBe(409)
    expect((await unconfirmed.json()).error.code).toBe('CONFIRMATION_REQUIRED')

    // Validación tipada.
    const invalid = await a.post('/api/admin/domain-tools', { data: { tool: 'search_properties', input: { features: ['jacuzzi'] } } })
    expect(invalid.status()).toBe(422)
    expect((await invalid.json()).error.code).toBe('VALIDATION_ERROR')

    // La traza no se puede borrar.
    const trace = await (await a.get('/api/admin/domain-tools')).json()
    const anyRow = trace.rows[0]
    if (anyRow) expect((await a.delete(`/api/admin/domain-tools/${anyRow.id}`)).status()).toBe(405)
  })
})
