import { createHmac } from 'node:crypto'
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * FASE 34 §158 — E2E final del Real Estate OS: el ciclo comercial completo
 * de María, de contacto a operación cerrada, con cada paso por el servicio
 * real y los pasos que el encargo nombra como herramienta (search_properties,
 * find_matches, create_property_selection, send_property, create_task,
 * book_viewing, create_offer) por la Domain Tools API — la misma que usa
 * INMO. Se repite para Propiedades (web) y Propiedades 2ª mano (§124).
 *
 * Recorre también, en orden, la secuencia Core 8 de §123: Contact → Lead →
 * dedup → routing → SLA → primera respuesta humana → cualificación →
 * BuyerRequirement → búsqueda → Matching → PropertyMatch → envío → tarea de
 * seguimiento → cita → visita → resultado → Activity → próxima acción.
 *
 * El envío por WhatsApp va al simulador de la Graph API de
 * scripts/e2e-provider-mock.mjs (WHATSAPP_GRAPH_BASE_URL, sólo loopback).
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}${Math.floor(Math.random() * 1000)}`
const ZONE = `Chamberi${RUN}`
const APP_SECRET = 'e2e_final_app_secret'
const META_PHONE_NUMBER_ID = `7${String(Date.now()).slice(-11)}`

function metaSignature(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`
}
function inboundPayload(wamid: string, from: string, name: string, text: string) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '366634483210362',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '34911000003', phone_number_id: META_PHONE_NUMBER_ID },
              contacts: [{ profile: { name }, wa_id: from }],
              messages: [{ from, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  })
}

const CATALOGS = [
  { label: 'Propiedades (web)', resource: 'developer-properties', kind: 'developer', idx: 1 },
  { label: 'Propiedades 2ª mano', resource: 'properties', kind: 'agent', idx: 2 },
] as const

test.describe('E2E final del Real Estate OS (§158)', () => {
  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let apiKey: string
  let developerId: number
  let channelId: number
  const cleanup: (() => Promise<unknown>)[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })

    const key = await a.post('/api/admin/saas/apikeys', { data: { name: `E2E final ${RUN}`, environment: 'test', scopes: 'write' } })
    const keyBody = await key.json()
    apiKey = keyBody.key || keyBody.plainKey || keyBody.apiKey
    developerId = (await (await a.post('/api/admin/developers', { data: { name: `Promotora final ${RUN}`, email: `final-${RUN}@mm.test`, status: 'active' } })).json()).id

    const channel = await a.post('/api/admin/comms/channels', {
      data: {
        provider: 'meta_cloud',
        label: 'Meta E2E final',
        phone: '+34 911 000 003',
        externalPhoneId: META_PHONE_NUMBER_ID,
        businessAccountId: '366634483210362',
        credentials: { accessToken: 'EAAG-e2e-final-placeholder-token', appSecret: APP_SECRET, verifyToken: `verify-final-${RUN}` },
      },
    })
    expect(channel.ok(), await channel.text()).toBeTruthy()
    channelId = (await channel.json()).channel.id
    expect((await a.patch(`/api/admin/comms/channels/${channelId}`, { data: { isDefault: true } })).ok()).toBeTruthy()
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    if (channelId) await a.delete(`/api/admin/comms/channels/${channelId}`).catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose(), anon?.dispose()])
  })

  const tool = async (name: string, input: Record<string, unknown>, opts: { confirmed?: boolean; idempotencyKey?: string } = {}) => {
    const res = await a.post('/api/admin/domain-tools', { data: { tool: name, input, ...opts } })
    const body = await res.json()
    expect(body.ok, `${name}: ${JSON.stringify(body.error)}`).toBe(true)
    return body
  }

  for (const cat of CATALOGS) {
    test(`ciclo comercial completo de María — ${cat.label}`, async () => {
      // --- Inventario: una propiedad que cumple la necesidad de María ------------
      const team = await a.post('/api/admin/team', { data: { name: `Comercial final ${cat.kind} ${RUN}`, email: `com-final-${cat.kind}-${RUN}@example.com`, position: 'Comercial', slug: `com-final-${cat.kind}-${RUN}` } })
      const commercialId = (await team.json()).id as number
      cleanup.push(() => a.delete(`/api/admin/team/${commercialId}`))

      const base = { city: 'Madrid', district: ZONE, price: 600000, bedrooms: 2, hasTerrace: 1, propertyType: 'Apartment', transactionType: 'sale' }
      const propRes =
        cat.kind === 'developer'
          ? await a.post('/api/admin/developer-properties', {
              data: { ...base, developerId, name: `Ático Chamberí final ${RUN}`, status: 'ready', country: 'España', area: 95, description: 'E2E final', coverImage: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2' },
            })
          : await a.post('/api/admin/properties', { data: { ...base, slug: `final-${RUN}`, street: `Calle Final ${RUN}`, status: 'available', agentId: commercialId } })
      expect(propRes.ok(), await propRes.text()).toBeTruthy()
      const propertyId = (await propRes.json()).id as number
      cleanup.push(() => a.delete(`/api/admin/${cat.resource}/${propertyId}`))
      if (cat.kind === 'developer') expect((await a.put(`/api/admin/developer-properties/${propertyId}`, { data: { publishedAt: new Date().toISOString() } })).ok()).toBeTruthy()

      // --- 1. Contact María ---------------------------------------------------------
      const email = `maria-final-${cat.kind}-${RUN}@example.com`
      const waId = `346${String(Date.now()).slice(-7)}${cat.idx}`
      const contactRes = await a.post('/api/admin/saas/contacts', { data: { name: `María Final ${cat.kind}`, email, phone: `+${waId}` } })
      expect(contactRes.ok(), await contactRes.text()).toBeTruthy()
      const contactId = (await contactRes.json()).id as number

      // --- 2-3. entra el Lead de María; la deduplicación encuentra su Contact -------
      const leadRes = await a.post('/api/v1/leads', { headers: { Authorization: `Bearer ${apiKey}` }, data: { name: `María Final ${cat.kind}`, email, phone: `+${waId}` } })
      expect(leadRes.ok(), await leadRes.text()).toBeTruthy()
      const { data: lead } = await leadRes.json()
      expect(lead.contactId, 'el lead debe resolverse contra el Contact ya existente').toBe(contactId)
      const leadId = lead.id as number

      // --- 4. Routing asigna comercial ----------------------------------------------
      const reassigned = await (await a.post(`/api/admin/saas/leads/${leadId}/reassign`, { data: { commercialId, reason: 'E2E final' } })).json()
      expect(reassigned.agentId).toBe(commercialId)

      // --- 5. SLA: el reloj corre — todavía sin primera respuesta humana -------------
      expect((await a.get('/api/admin/saas/leads-routing/sla-settings')).ok()).toBeTruthy()
      const leadRow = async () => ((await (await a.get('/api/admin/saas/leads', { params: { ids: String(leadId) } })).json()).rows as any[])[0]
      expect((await leadRow()).firstResponseAt).toBeFalsy()

      // --- 6-8. el comercial responde → firstResponseAt → QUALIFYING ---------------
      expect((await a.patch(`/api/admin/saas/leads/${leadId}`, { data: { stage: 'contacted', reason: 'Primera llamada hecha' } })).ok()).toBeTruthy()
      expect((await leadRow()).firstResponseAt, 'un cambio de fase humano es la primera respuesta').toBeTruthy()
      expect((await (await a.patch(`/api/admin/saas/leads/${leadId}`, { data: { stage: 'qualifying', reason: 'Recogiendo lo que busca' } })).json()).stage).toBe('qualifying')

      // --- 9. BuyerRequirement: compra, zona, ≤ 650.000, ≥ 2 dormitorios, terraza OBLIGATORIA
      const reqRes = await a.post('/api/admin/saas/buyer-requirements', {
        data: {
          contactId,
          title: `María ${cat.kind} ${RUN}`,
          operation: 'sale',
          desiredZones: [{ label: ZONE }],
          priceMax: 650000,
          bedroomsMin: 2,
          features: { terrace: true },
          importances: { terrace: 'required' },
          desiredDate: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10),
          assignedCommercialId: commercialId,
        },
      })
      expect(reqRes.ok(), await reqRes.text()).toBeTruthy()
      const requirement = await reqRes.json()
      expect((await a.post(`/api/admin/saas/buyer-requirements/${requirement.id}/validate-budget`, { data: { validated: true } })).ok()).toBeTruthy()

      // --- 10-11. QUALIFIED y Lead Score explicado ----------------------------------
      expect((await (await a.patch(`/api/admin/saas/leads/${leadId}`, { data: { stage: 'qualified', reason: 'Presupuesto y zona confirmados' } })).json()).stage).toBe('qualified')
      const score = await (await a.get('/api/admin/saas/leads', { params: { scoreFor: String(leadId) } })).json()
      const applied = score.breakdown.filter((x: any) => x.applied).map((x: any) => x.criterion)
      expect(applied).toEqual(expect.arrayContaining(['budget_validated', 'purchase_horizon']))
      expect(score.score).toBeGreaterThanOrEqual(35)

      // --- 12. search_properties: candidatos reales por criterios estructurados -----
      const search = await tool('search_properties', { catalog: cat.kind, zones: [ZONE], priceMax: 650000, bedroomsMin: 2, features: ['terrace'] })
      expect(search.output.results.map((p: any) => p.id)).toContain(propertyId)

      // --- 13. find_matches: compatibilidad del motor de Matching -------------------
      const matches = await tool('find_matches', { buyerRequirementId: requirement.id, limit: 20 })
      const candidate = matches.output.results.find((m: any) => m.property.kind === cat.kind && m.property.id === propertyId)
      expect(candidate, 'la propiedad debe ser compatible').toBeTruthy()
      expect(candidate.score).toBeGreaterThan(0)
      expect(candidate.hardFailures).toEqual([])

      // --- 14-15. el comercial la selecciona: PropertyMatch persistido ---------------
      expect((await a.post('/api/admin/saas/matching/matches', { data: { buyerRequirementId: requirement.id, propertyId, propertyKind: cat.kind, status: 'selected' } })).ok()).toBeTruthy()

      // --- 16. create_property_selection -------------------------------------------
      const selection = await tool('create_property_selection', { contactId, leadId, buyerRequirementId: requirement.id, title: `Para María ${RUN}`, items: [{ propertyId, propertyKind: cat.kind, note: 'Terraza orientada al sur' }] }, { idempotencyKey: `sel-${cat.kind}-${RUN}` })
      expect(selection.output.items).toHaveLength(1)

      // --- 17-19. send_property por Comunicaciones (María escribió antes: ventana abierta)
      const inbound = inboundPayload(`wamid.final.in.${RUN}.${cat.idx}`, waId, `María Final ${cat.kind}`, 'Hola, ¿tenéis algo con terraza?')
      expect((await anon.post('/api/comms/webhooks/meta', { headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(inbound) }, data: inbound })).ok()).toBeTruthy()
      const unconfirmed = await a.post('/api/admin/domain-tools', { data: { tool: 'send_property', input: { leadId, propertyId, propertyKind: cat.kind, buyerRequirementId: requirement.id } } })
      expect(unconfirmed.status()).toBe(409)
      const sent = await tool('send_property', { leadId, propertyId, propertyKind: cat.kind, buyerRequirementId: requirement.id }, { confirmed: true, idempotencyKey: `send-${cat.kind}-${RUN}` })
      expect(sent.output.status).toBe('sent')
      // Repetir la misma petición no manda otro WhatsApp.
      const again = await tool('send_property', { leadId, propertyId, propertyKind: cat.kind, buyerRequirementId: requirement.id }, { confirmed: true, idempotencyKey: `send-${cat.kind}-${RUN}` })
      expect(again.replayed).toBe(true)
      expect(again.output.messageId).toBe(sent.output.messageId)
      const matchStatus = async () =>
        (await (await a.get(`/api/admin/saas/matching/requirement/${requirement.id}`, { params: { limit: '200' } })).json()).results.find((m: any) => m.propertyKind === cat.kind && m.property.id === propertyId)
          .persisted?.status
      expect(await matchStatus()).toBe('sent')

      // --- 20-21. create_task de seguimiento → próxima acción del lead --------------
      const due = `${new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)} 10:00`
      await tool('create_task', { title: 'Llamar a María tras el envío', type: 'call', leadId, contactId, assigneeId: commercialId, dueAt: due }, { idempotencyKey: `task-${cat.kind}-${RUN}` })
      expect((await leadRow()).nextActionAt).toBe(`${due}:00`)

      // --- 22-24. María pide visita → book_viewing → Calendar -------------------------
      const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
      const booked = await tool('book_viewing', { leadId, commercialId, propertyId, propertyKind: cat.kind, scheduledAt: `${day} 17:00` }, { confirmed: true, idempotencyKey: `book-${cat.kind}-${RUN}` })
      const visitId = booked.output.appointmentId as number
      const calendar = await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day, agentId: String(commercialId) } })).json()
      expect(JSON.stringify(calendar)).toContain(`"id":${visitId}`)

      // --- 25-27. se realiza la visita, resultado, y el PropertyMatch lo refleja ------
      expect((await a.patch(`/api/admin/saas/visits/${visitId}`, { data: { status: 'completed' } })).ok()).toBeTruthy()
      expect((await a.post(`/api/admin/saas/visits/${visitId}/outcome`, { data: { outcome: 'interested', notes: 'Le encantó la terraza' } })).ok()).toBeTruthy()
      expect(await matchStatus()).toBe('viewing')

      // --- 28-33. create_offer → contraoferta → nueva oferta → aceptada ---------------
      const offer = (await tool('create_offer', { propertyId, propertyKind: cat.kind, buyerContactId: contactId, leadId, buyerRequirementId: requirement.id, amount: 580000 }, { confirmed: true, idempotencyKey: `offer-${cat.kind}-${RUN}` })).output
      expect(offer.status).toBe('draft')
      expect(await matchStatus()).toBe('offered')
      expect((await a.post(`/api/admin/saas/offers/${offer.offerId}/submit`, { data: {} })).ok()).toBeTruthy()
      const countered = await (await a.post(`/api/admin/saas/offers/${offer.offerId}/counter`, { data: { amount: 595000 } })).json()
      expect(countered.currentAmount).toBe(595000)
      const accepted = await (await a.post(`/api/admin/saas/offers/${offer.offerId}/accept`, { data: {} })).json()
      expect(accepted.status).toBe('accepted')

      // --- 34-38. Deal: tareas de documentación, notaría, avance y cierre -------------
      const deal = await (await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: offer.offerId } })).json()
      expect(deal.stage).toBe('accepted_offer')
      expect((await a.post('/api/admin/saas/tasks', { data: { type: 'document', title: 'Nota simple y certificado energético', dealId: deal.id, leadId, assigneeId: commercialId } })).ok()).toBeTruthy()
      for (const stage of ['reservation', 'deposit_contract', 'financing', 'documentation']) {
        expect((await (await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'stage', toStage: stage } })).json()).stage).toBe(stage)
      }
      const notaryDay = new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10)
      const notary = await a.post('/api/admin/saas/visits', {
        data: { clientName: `María Final ${cat.kind}`, clientEmail: email, agentId: commercialId, propertyId, propertyKind: cat.kind, scheduledAt: `${notaryDay} 12:00:00`, leadId, type: 'notary', dealId: deal.id },
      })
      expect(notary.ok(), await notary.text()).toBeTruthy()
      expect((await (await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'stage', toStage: 'signature' } })).json()).stage).toBe('signature')
      const closed = await (await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'close' } })).json()
      expect(closed.status).toBe('closed')

      // --- 39. estado de la propiedad según sus reglas ---------------------------------
      const { row: property } = await (await a.get(`/api/admin/${cat.resource}/${propertyId}`)).json()
      if (cat.kind === 'agent') expect(property.status).toBe('sold')
      else expect(property.status, 'obra nueva no tiene estado de venta: cerrar no inventa uno').toBe('ready')

      // --- 40. Activity: el ciclo completo en el timeline del lead -----------------------
      const activity = await (await a.get('/api/admin/saas/activity', { params: { leadId: String(leadId) } })).json()
      expect(activity.rows.map((e: any) => e.eventType)).toEqual(
        expect.arrayContaining(['LEAD_CREATED', 'PROPERTY_SENT', 'TASK_CREATED', 'APPOINTMENT_CREATED', 'VISIT_OUTCOME_RECORDED', 'OFFER_ACCEPTED', 'DEAL_CREATED', 'DEAL_CLOSED']),
      )

      // --- 41. el Dashboard refleja el ciclo para ese comercial ---------------------------
      const dash = await (await a.get('/api/admin/saas/overview', { params: { view: 'commercial', commercialId: String(commercialId) } })).json()
      expect(dash.kpis.newLeads.value).toBe(1)
      expect(dash.kpis.qualifiedLeads.value).toBe(1)
      expect(dash.kpis.offers.value).toBe(1)
      expect(dash.kpis.dealsClosed.value).toBe(1)
      expect(dash.funnel.stages.find((s: any) => s.key === 'deals').value).toBe(1)

      // Y nada de esto es visible desde otra agencia.
      expect((await b.get(`/api/admin/saas/contacts/${contactId}`)).status()).toBe(404)
      const foreign = await b.post('/api/admin/domain-tools', { data: { tool: 'find_matches', input: { buyerRequirementId: requirement.id } } })
      expect(foreign.status()).toBe(404)
    })
  }
})
