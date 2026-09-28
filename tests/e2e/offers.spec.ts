import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * FASE 23 — Offer, sobre HTTP real.
 *
 * Comercial e inmueble propios de este spec (mismo patrón que
 * calendar.spec.ts/activity.spec.ts/tasks.spec.ts): evita compartir agenda
 * o depender del orden en que otros specs siembran datos.
 */
test.describe('Ofertas (FASE 23)', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let developerPropertyId: number
  const createdDeveloperPropertyIds: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })

    const devOwnerRes = await a.post('/api/admin/developers', { data: { name: `Dev Offers E2E ${Date.now()}`, email: `dev-offers-${Date.now()}@mm.test`, status: 'active' } })
    const { id: developerId } = await devOwnerRes.json()
    const devPropRes = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Propiedad Offers E2E ${Date.now()}`, status: 'new', price: 500000, transactionType: 'sale' } })
    developerPropertyId = (await devPropRes.json()).id
    createdDeveloperPropertyIds.push(developerPropertyId)
  })

  test.afterAll(async () => {
    await Promise.all(createdDeveloperPropertyIds.map((id) => a.delete(`/api/admin/developer-properties/${id}`)))
    await a?.dispose()
    await b?.dispose()
  })

  async function seedContact(ctx: APIRequestContext, tag: string) {
    const res = await ctx.post('/api/admin/saas/contacts', { data: { name: `E2E Offer ${tag}`, email: `e2e-offer-${tag}-${Date.now()}@example.com` } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).id as number
  }

  test('crear una oferta en borrador, y GET la devuelve con su histórico de revisiones', async () => {
    const buyerContactId = await seedContact(a, 'create')
    const createRes = await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, amount: 550000 } })
    expect(createRes.ok(), await createRes.text()).toBeTruthy()
    const offer = await createRes.json()
    expect(offer.status).toBe('draft')

    const getRes = await a.get(`/api/admin/saas/offers/${offer.id}`)
    const detail = await getRes.json()
    expect(detail.offer.id).toBe(offer.id)
    expect(detail.revisions).toHaveLength(1)
    expect(detail.revisions[0].type).toBe('created')
  })

  test('sin importe, sin inmueble o sin comprador se rechaza con 422', async () => {
    const buyerContactId = await seedContact(a, 'invalid')
    expect((await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, amount: 0 } })).status()).toBe(422)
    expect((await a.post('/api/admin/saas/offers', { data: { propertyKind: 'developer', buyerContactId, amount: 100 } })).status()).toBe(422)
    expect((await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', amount: 100 } })).status()).toBe(422)
  })

  test('ciclo completo: crear → enviar → contraoferta → aceptar, con el importe final correcto', async () => {
    const buyerContactId = await seedContact(a, 'cycle')
    const offer = await (await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, amount: 500000 } })).json()

    const submitted = await (await a.post(`/api/admin/saas/offers/${offer.id}/submit`, { data: {} })).json()
    expect(submitted.status).toBe('submitted')

    const countered = await (await a.post(`/api/admin/saas/offers/${offer.id}/counter`, { data: { amount: 530000, actorType: 'seller' } })).json()
    expect(countered.status).toBe('countered')
    expect(countered.currentAmount).toBe(530000)

    const accepted = await (await a.post(`/api/admin/saas/offers/${offer.id}/accept`, { data: {} })).json()
    expect(accepted.status).toBe('accepted')
    expect(accepted.currentAmount).toBe(530000)

    const { revisions } = await (await a.get(`/api/admin/saas/offers/${offer.id}`)).json()
    expect(revisions.map((r: any) => r.type)).toEqual(['created', 'submitted', 'countered', 'accepted'])
  })

  test('aceptar con un revisionId ya obsoleto se rechaza con 409 (concurrencia, §85)', async () => {
    const buyerContactId = await seedContact(a, 'concurrency')
    const offer = await (await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, amount: 400000 } })).json()
    const submitted = await (await a.post(`/api/admin/saas/offers/${offer.id}/submit`, { data: {} })).json()
    const staleRevisionId = submitted.currentRevisionId

    await a.post(`/api/admin/saas/offers/${offer.id}/counter`, { data: { amount: 420000 } })

    const res = await a.post(`/api/admin/saas/offers/${offer.id}/accept`, { data: { revisionId: staleRevisionId } })
    expect(res.status()).toBe(409)
  })

  test('rechazar y retirar', async () => {
    const buyerContactId = await seedContact(a, 'reject-withdraw')
    const offerA = await (await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, amount: 300000 } })).json()
    await a.post(`/api/admin/saas/offers/${offerA.id}/submit`, { data: {} })
    const rejected = await (await a.post(`/api/admin/saas/offers/${offerA.id}/reject`, { data: {} })).json()
    expect(rejected.status).toBe('rejected')

    const offerB = await (await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, amount: 250000 } })).json()
    const withdrawn = await (await a.post(`/api/admin/saas/offers/${offerB.id}/withdraw`, { data: {} })).json()
    expect(withdrawn.status).toBe('withdrawn')
  })

  test('una transición inválida (aceptar un borrador) se rechaza con 422', async () => {
    const buyerContactId = await seedContact(a, 'invalid-transition')
    const offer = await (await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, amount: 200000 } })).json()
    const res = await a.post(`/api/admin/saas/offers/${offer.id}/accept`, { data: {} })
    expect(res.status()).toBe(422)
  })

  test('aislamiento entre tenants: una oferta de una agencia no se puede leer ni listar desde otra', async () => {
    const buyerContactId = await seedContact(a, 'tenant')
    const offer = await (await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, amount: 100000 } })).json()

    expect((await b.get(`/api/admin/saas/offers/${offer.id}`)).status()).toBe(404)
    const { rows } = await (await b.get('/api/admin/saas/offers')).json()
    expect(rows.some((r: any) => r.id === offer.id)).toBe(false)
  })

  test('anotar el resultado de una visita sin contacto vinculado y pedir "Crear oferta" se rechaza con un mensaje claro', async () => {
    // El flujo feliz (visita con lead→contacto resuelto → Offer real) está
    // cubierto por el test unitario dedicado (test/unit/offers.test.ts):
    // producirlo aquí exigiría el endpoint público de reserva, que ya va muy
    // ajustado de presupuesto de rate limit dentro de la misma sesión de
    // `scripts/e2e.sh` (lección de FASE 19, ver appointments.spec.ts). Lo que
    // sí prueba HTTP de verdad, sin gastar ese presupuesto, es que el
    // endpoint valida correctamente cuando no hay comprador identificable.
    const agentRes = await a.post('/api/admin/team', { data: { name: `E2E Offer Comercial ${Date.now()}`, email: `e2e-offer-comercial-${Date.now()}@example.com`, position: 'Comercial', slug: `e2e-offer-comercial-${Date.now()}` } })
    const agentId = (await agentRes.json()).id

    const start = new Date()
    start.setUTCDate(start.getUTCDate() + 30 + Math.floor(Math.random() * 20))
    const scheduledAt = `${start.toISOString().slice(0, 10)} 09:00:00`
    const visitRes = await a.post('/api/admin/saas/visits', {
      data: { clientName: 'E2E Offer Outcome', clientEmail: `e2e-offer-outcome-${Date.now()}@example.com`, agentId, propertyId: developerPropertyId, propertyKind: 'developer', scheduledAt },
    })
    const visit = await visitRes.json()
    await a.patch(`/api/admin/saas/visits/${visit.id}`, { data: { status: 'completed' } })

    const before = (await (await a.get('/api/admin/saas/offers', { params: { propertyId: String(developerPropertyId), propertyKind: 'developer' } })).json()).rows.length

    const outcomeRes = await a.post(`/api/admin/saas/visits/${visit.id}/outcome`, { data: { outcome: 'interested', createOffer: { amount: 480000 } } })
    expect(outcomeRes.status()).toBe(422)
    expect(await outcomeRes.text()).toContain('comprador identificado')

    const after = (await (await a.get('/api/admin/saas/offers', { params: { propertyId: String(developerPropertyId), propertyKind: 'developer' } })).json()).rows.length
    expect(after).toBe(before)
  })
})
