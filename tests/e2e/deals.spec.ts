import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * FASE 24 — Deal Operation, sobre HTTP real.
 *
 * Todo bajo una única ruta, `/api/admin/saas/deal-operations` — GET con
 * `?id=` para la ficha, POST con `action` en el body para transicionar
 * (ver el comentario en `server/api/admin/saas/deal-operations.get.ts` y
 * docs/deals.md sobre por qué: el margen de `npm run typecheck` frente al
 * TS2589 de Nitro estaba agotado a una sola clave de ruta nueva). Ruta
 * deliberadamente distinta de `saas/deals*`, que es la tabla legacy de
 * cierres para comisiones. Comercial e inmuebles propios de este spec,
 * mismo patrón que offers.spec.ts/tasks.spec.ts.
 */
test.describe('Deal Operations (FASE 24)', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let developerPropertyId: number
  let agentPropertyId: number
  const createdDeveloperPropertyIds: number[] = []
  const createdAgentPropertyIds: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })

    const devOwnerRes = await a.post('/api/admin/developers', { data: { name: `Dev Deals E2E ${Date.now()}`, email: `dev-deals-${Date.now()}@mm.test`, status: 'active' } })
    const { id: developerId } = await devOwnerRes.json()
    const devPropRes = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Propiedad Deals E2E ${Date.now()}`, status: 'new', price: 500000, transactionType: 'sale' } })
    developerPropertyId = (await devPropRes.json()).id
    createdDeveloperPropertyIds.push(developerPropertyId)

    const agentPropRes = await a.post('/api/admin/properties', { data: { slug: `e2e-deal-${Date.now()}`, price: 300000, transactionType: 'sale', status: 'available' } })
    agentPropertyId = (await agentPropRes.json()).id
    createdAgentPropertyIds.push(agentPropertyId)
  })

  test.afterAll(async () => {
    await Promise.all(createdDeveloperPropertyIds.map((id) => a.delete(`/api/admin/developer-properties/${id}`)))
    await Promise.all(createdAgentPropertyIds.map((id) => a.delete(`/api/admin/properties/${id}`)))
    await a?.dispose()
    await b?.dispose()
  })

  async function seedContact(ctx: APIRequestContext, tag: string) {
    const res = await ctx.post('/api/admin/saas/contacts', { data: { name: `E2E Deal ${tag}`, email: `e2e-deal-${tag}-${Date.now()}@example.com` } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).id as number
  }

  async function seedAcceptedOffer(ctx: APIRequestContext, propertyId: number, propertyKind: 'agent' | 'developer', buyerContactId: number, amount: number) {
    const offer = await (await ctx.post('/api/admin/saas/offers', { data: { propertyId, propertyKind, buyerContactId, amount } })).json()
    await ctx.post(`/api/admin/saas/offers/${offer.id}/submit`, { data: {} })
    const accepted = await (await ctx.post(`/api/admin/saas/offers/${offer.id}/accept`, { data: {} })).json()
    expect(accepted.status).toBe('accepted')
    return accepted
  }

  test('crear la operación exige una oferta aceptada, y sólo permite una por oferta (409)', async () => {
    const buyerContactId = await seedContact(a, 'create')
    const draft = await (await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, amount: 400000 } })).json()

    const rejectedRes = await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: draft.id } })
    expect(rejectedRes.status()).toBe(422)

    const accepted = await seedAcceptedOffer(a, developerPropertyId, 'developer', buyerContactId, 400000)
    const createRes = await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: accepted.id } })
    expect(createRes.ok(), await createRes.text()).toBeTruthy()
    const deal = await createRes.json()
    expect(deal.stage).toBe('accepted_offer')
    expect(deal.status).toBe('active')
    expect(deal.agreedAmount).toBe(400000)

    const dupRes = await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: accepted.id } })
    expect(dupRes.status()).toBe(409)
  })

  test('la ficha de la operación muestra el nombre del comprador y sus comunicaciones (FASE 29 §142)', async ({ page }) => {
    const buyerContactId = await seedContact(a, 'ficha')
    const accepted = await seedAcceptedOffer(a, developerPropertyId, 'developer', buyerContactId, 330000)
    const deal = await (await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: accepted.id } })).json()

    await page.goto(`/admin/deal-operations/${deal.id}`)
    // Antes la página leía `buyer.name` de una respuesta que es { contact, ... }: el nombre nunca salía.
    await expect(page.getByRole('link', { name: 'E2E Deal ficha' }).first()).toBeVisible()
    await expect(page.getByTestId('deal-communications')).toBeVisible()
    await expect(page.getByTestId('deal-communications')).toContainText('Sólo salientes')
  })

  test('GET la ficha devuelve histórico, próxima acción y permite mover de etapa, pero nunca a "closed"', async () => {
    const buyerContactId = await seedContact(a, 'stage')
    const accepted = await seedAcceptedOffer(a, developerPropertyId, 'developer', buyerContactId, 350000)
    const deal = await (await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: accepted.id } })).json()

    const detail = await (await a.get('/api/admin/saas/deal-operations', { params: { id: String(deal.id) } })).json()
    expect(detail.deal.id).toBe(deal.id)
    expect(detail.stageHistory).toHaveLength(1)
    expect(detail.nextAction).toBeNull()

    const moved = await (await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'stage', toStage: 'reservation' } })).json()
    expect(moved.stage).toBe('reservation')

    const blockedRes = await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'stage', toStage: 'closed' } })
    expect(blockedRes.status()).toBe(422)
  })

  test('cerrar la operación marca el inmueble de 2ª mano en venta como vendido, y crea el puente a la tabla legacy `deals`', async () => {
    const buyerContactId = await seedContact(a, 'close')
    const accepted = await seedAcceptedOffer(a, agentPropertyId, 'agent', buyerContactId, 280000)
    const deal = await (await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: accepted.id } })).json()

    const closeRes = await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'close' } })
    expect(closeRes.ok(), await closeRes.text()).toBeTruthy()
    const closed = await closeRes.json()
    expect(closed.status).toBe('closed')
    expect(closed.stage).toBe('closed')
    expect(closed.legacyDealId).toBeTruthy()

    const { row: property } = await (await a.get(`/api/admin/properties/${agentPropertyId}`)).json()
    expect(property.status).toBe('sold')

    // El puente al cierre (docs/deals.md): el apunte legacy creado por closeDeal() aparece en su propio listado.
    const { rows: legacyRows } = await (await a.get('/api/admin/saas/deals')).json()
    expect(legacyRows.some((r: any) => r.id === closed.legacyDealId)).toBe(true)

    // Cerrada, ya no admite otra transición de etapa.
    const afterCloseRes = await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'stage', toStage: 'reservation' } })
    expect(afterCloseRes.status()).toBe(422)
  })

  test('cancelar exige un motivo, y no borra el histórico', async () => {
    const buyerContactId = await seedContact(a, 'cancel')
    const accepted = await seedAcceptedOffer(a, developerPropertyId, 'developer', buyerContactId, 320000)
    const deal = await (await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: accepted.id } })).json()

    const noReasonRes = await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'cancel' } })
    expect(noReasonRes.status()).toBe(422)

    const cancelRes = await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'cancel', reason: 'El comprador se retiró' } })
    expect(cancelRes.ok(), await cancelRes.text()).toBeTruthy()
    const cancelled = await cancelRes.json()
    expect(cancelled.status).toBe('cancelled')

    const detail = await (await a.get('/api/admin/saas/deal-operations', { params: { id: String(deal.id) } })).json()
    expect(detail.stageHistory.length).toBeGreaterThan(0)
  })

  test('lista con filtros por inmueble, comprador y estado', async () => {
    const buyerContactId = await seedContact(a, 'list')
    const accepted = await seedAcceptedOffer(a, developerPropertyId, 'developer', buyerContactId, 310000)
    const deal = await (await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: accepted.id } })).json()

    const byProperty = await (await a.get('/api/admin/saas/deal-operations', { params: { propertyId: String(developerPropertyId), propertyKind: 'developer' } })).json()
    expect(byProperty.rows.some((d: any) => d.id === deal.id)).toBe(true)

    const byBuyer = await (await a.get('/api/admin/saas/deal-operations', { params: { buyerContactId: String(buyerContactId) } })).json()
    expect(byBuyer.rows.map((d: any) => d.id)).toEqual([deal.id])

    const byStatus = await (await a.get('/api/admin/saas/deal-operations', { params: { status: 'active' } })).json()
    expect(byStatus.rows.some((d: any) => d.id === deal.id)).toBe(true)
  })

  test('aislamiento entre tenants: una operación de una agencia no se puede leer ni listar desde otra', async () => {
    const buyerContactId = await seedContact(a, 'tenant')
    const accepted = await seedAcceptedOffer(a, developerPropertyId, 'developer', buyerContactId, 290000)
    const deal = await (await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: accepted.id } })).json()

    expect((await b.get('/api/admin/saas/deal-operations', { params: { id: String(deal.id) } })).status()).toBe(404)
    const { rows } = await (await b.get('/api/admin/saas/deal-operations')).json()
    expect(rows.some((r: any) => r.id === deal.id)).toBe(false)
  })
})
