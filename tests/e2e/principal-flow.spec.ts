import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * FASES 20-24 — flujo principal de extremo a extremo (sección 184 del
 * megaprompt): lead → deduplicación → routing → SLA → cualificación →
 * necesidad de compra → matching → tarea de seguimiento → cita → calendario
 * → resultado de visita → oferta (enviar/contraoferta/aceptar) → operación
 * → notaría/firma → cierre → estado del inmueble → timeline de actividad.
 * Repetido sobre una propiedad de obra nueva (web) y una de 2ª mano, cada
 * cual con su propio comercial e inmueble dedicados — mismo patrón que
 * offers.spec.ts/deals.spec.ts.
 *
 * `/api/public/contact` es el único punto de entrada real de `upsertLead()`
 * (dedup + routing automático) y comparte un límite muy ajustado (5 cada 10
 * min por IP, ver server/api/public/contact.post.ts) con
 * site-builder.spec.ts y transactional-email.spec.ts en la misma sesión de
 * `npm run test:e2e` — lección de FASE 19/23 (appointments.spec.ts,
 * offers.spec.ts) sobre no agotar presupuestos de rate limit compartidos.
 * Por eso la prueba de deduplicación por reenvío (mismo email dos veces) se
 * hace UNA sola vez, en el recorrido de obra nueva; el recorrido de 2ª mano
 * siembra su lead por la vía de API (sin límite de IP) y prueba el routing
 * por su vertiente manual (reasignación), ya que el automático quedó
 * probado en el primer recorrido.
 */
test.describe('Flujo principal FASES 20-24', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let developerPropertyId: number
  let agentPropertyId: number
  let commercialDevId: number
  let commercialAgentId: number
  let apiKey: string
  const createdDeveloperPropertyIds: number[] = []
  const createdAgentPropertyIds: number[] = []
  const createdTeamIds: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })

    const devOwnerRes = await a.post('/api/admin/developers', { data: { name: `Dev Principal E2E ${Date.now()}`, email: `dev-principal-${Date.now()}@mm.test`, status: 'active' } })
    const { id: developerId } = await devOwnerRes.json()
    const devPropRes = await a.post('/api/admin/developer-properties', {
      data: { developerId, name: `Residencial Principal E2E ${Date.now()}`, status: 'new', price: 420000, area: 90, bedrooms: 2, transactionType: 'sale', propertyType: 'Apartment' },
    })
    developerPropertyId = (await devPropRes.json()).id
    createdDeveloperPropertyIds.push(developerPropertyId)

    const agentPropRes = await a.post('/api/admin/properties', {
      data: { slug: `e2e-principal-${Date.now()}`, price: 260000, area: 75, bedrooms: 2, transactionType: 'sale', status: 'available', propertyType: 'Apartment' },
    })
    agentPropertyId = (await agentPropRes.json()).id
    createdAgentPropertyIds.push(agentPropertyId)

    const commDev = await a.post('/api/admin/team', { data: { name: `Principal Dev E2E ${Date.now()}`, email: `principal-dev-${Date.now()}@example.com`, position: 'Comercial', slug: `principal-dev-e2e-${Date.now()}` } })
    commercialDevId = (await commDev.json()).id
    createdTeamIds.push(commercialDevId)
    const commAgent = await a.post('/api/admin/team', { data: { name: `Principal Agent E2E ${Date.now()}`, email: `principal-agent-${Date.now()}@example.com`, position: 'Comercial', slug: `principal-agent-e2e-${Date.now()}` } })
    commercialAgentId = (await commAgent.json()).id
    createdTeamIds.push(commercialAgentId)

    const keyRes = await a.post('/api/admin/saas/apikeys', { data: { name: `Principal E2E ${Date.now()}`, environment: 'test', scopes: 'write' } })
    const keyBody = await keyRes.json()
    apiKey = keyBody.key || keyBody.plainKey || keyBody.apiKey
    expect(apiKey, 'la clave debe devolverse en claro al crearla').toBeTruthy()
  })

  test.afterAll(async () => {
    await Promise.all(createdDeveloperPropertyIds.map((id) => a.delete(`/api/admin/developer-properties/${id}`)))
    await Promise.all(createdAgentPropertyIds.map((id) => a.delete(`/api/admin/properties/${id}`)))
    await Promise.all(createdTeamIds.map((id) => a.delete(`/api/admin/team/${id}`)))
    await a?.dispose()
  })

  test('obra nueva: lead real (con deduplicación por reenvío y routing automático) hasta operación cerrada', async () => {
    const email = `principal-web-${Date.now()}@example.com`

    // --- Lead + deduplicación + routing (§12-15) ---------------------------
    const first = await a.post('/api/public/contact', { data: { name: 'Comprador Obra Nueva E2E', email, message: 'Busco piso de 2 habitaciones', type: 'contact' } })
    expect(first.ok(), await first.text()).toBeTruthy()

    const beforeDedup = (await (await a.get('/api/admin/saas/leads')).json()).rows.filter((l: any) => l.email === email)
    expect(beforeDedup, 'el primer envío debe crear exactamente un lead').toHaveLength(1)
    const leadId = beforeDedup[0].id
    const scoreBefore = beforeDedup[0].score

    // Mismo email otra vez: upsertLead() debe reconocerlo y reutilizar el mismo lead, no crear uno nuevo.
    const second = await a.post('/api/public/contact', { data: { name: 'Comprador Obra Nueva E2E', email, message: 'Sigo interesado, ¿hay novedades?', type: 'contact' } })
    expect(second.ok(), await second.text()).toBeTruthy()

    const afterDedup = (await (await a.get('/api/admin/saas/leads')).json()).rows.filter((l: any) => l.email === email)
    expect(afterDedup, 'el reenvío con el mismo email no debe crear un segundo lead').toHaveLength(1)
    expect(afterDedup[0].id).toBe(leadId)
    // FASE 32: reenviar el formulario no es por sí solo una señal del Lead
    // Score (antes sumaba un "bump" fijo cada vez) — ni lo infla ni lo reinicia.
    expect(afterDedup[0].score, 'el reenvío no debe inflar ni reiniciar la puntuación').toBe(scoreBefore)

    // Routing: se asigna explícitamente al comercial dedicado de esta prueba (el automático, ya disparado por upsertLead() arriba, depende de reglas globales de la organización que este spec no controla).
    const reassignRes = await a.post(`/api/admin/saas/leads/${leadId}/reassign`, { data: { commercialId: commercialDevId, reason: 'Asignación E2E' } })
    expect(reassignRes.ok(), await reassignRes.text()).toBeTruthy()
    const reassigned = await reassignRes.json()
    expect(reassigned.agentId).toBe(commercialDevId)

    // --- SLA (§16) — el motor está vivo, aunque esta prueba no fuerza ningún incumplimiento ---
    expect((await a.get('/api/admin/saas/leads-routing/sla-settings')).ok()).toBeTruthy()
    expect((await a.get('/api/admin/saas/leads-routing/sla-alerts')).ok()).toBeTruthy()

    // --- Cualificación (§13) --------------------------------------------
    const qualifyRes = await a.patch(`/api/admin/saas/leads/${leadId}`, { data: { stage: 'qualified' } })
    expect(qualifyRes.ok(), await qualifyRes.text()).toBeTruthy()
    expect((await qualifyRes.json()).stage).toBe('qualified')

    const leadRow = afterDedup[0]
    const contactId = leadRow.contactId
    // El propio listado no siempre expone contactId; si falta, se resuelve por email desde contactos.
    let resolvedContactId = contactId
    if (!resolvedContactId) {
      const contacts = await (await a.get('/api/admin/saas/contacts', { params: { search: email } })).json()
      resolvedContactId = Array.isArray(contacts) ? contacts[0]?.id : contacts.rows?.[0]?.id
    }
    expect(resolvedContactId, 'upsertLead() debe haber resuelto un Contact real').toBeTruthy()

    // --- Necesidad de compra + matching (§10-11) -------------------------
    const reqRes = await a.post('/api/admin/saas/buyer-requirements', {
      data: { contactId: resolvedContactId, operation: 'sale', propertyTypes: ['Apartment'], priceMin: 300000, priceMax: 500000, bedroomsMin: 1, assignedCommercialId: commercialDevId },
    })
    expect(reqRes.ok(), await reqRes.text()).toBeTruthy()
    const requirement = await reqRes.json()

    const matchesRes = await a.get(`/api/admin/saas/matching/requirement/${requirement.id}`)
    expect(matchesRes.ok()).toBeTruthy()
    const matches = await matchesRes.json()
    const devMatch = matches.results.find((m: any) => m.propertyKind === 'developer' && m.property.id === developerPropertyId)
    expect(devMatch, 'el inmueble de obra nueva sembrado debe salir como candidato').toBeTruthy()

    const selectRes = await a.post('/api/admin/saas/matching/matches', {
      data: { buyerRequirementId: requirement.id, propertyId: developerPropertyId, propertyKind: 'developer', status: 'selected' },
    })
    expect(selectRes.ok(), await selectRes.text()).toBeTruthy()

    // --- Tarea de seguimiento + cita (§17-18) real, visible en Calendar (§20) ---
    const dueAt = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 19).replace('T', ' ')
    const taskRes = await a.post('/api/admin/saas/tasks', { data: { type: 'other', title: 'Llamar tras el primer contacto', dueAt, assigneeId: commercialDevId, contactId: resolvedContactId, leadId } })
    expect(taskRes.ok(), await taskRes.text()).toBeTruthy()

    const visitDate = new Date(Date.now() + 5 * 86400000)
    const scheduledAt = `${visitDate.toISOString().slice(0, 10)} 11:00:00`
    const visitRes = await a.post('/api/admin/saas/visits', {
      data: { clientName: 'Comprador Obra Nueva E2E', clientEmail: email, agentId: commercialDevId, propertyId: developerPropertyId, propertyKind: 'developer', scheduledAt, leadId, type: 'property_viewing' },
    })
    expect(visitRes.ok(), await visitRes.text()).toBeTruthy()
    const visit = await visitRes.json()

    const from = new Date(Date.now()).toISOString().slice(0, 10)
    const to = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const calendarRes = await a.get('/api/admin/saas/calendar', { params: { from, to, agentId: String(commercialDevId) } })
    expect(calendarRes.ok(), await calendarRes.text()).toBeTruthy()
    const calendar = await calendarRes.json()
    expect(calendar.rows?.some((v: any) => v.id === visit.id) ?? JSON.stringify(calendar).includes(String(visit.id)), 'la cita debe verse en Calendar').toBeTruthy()

    // --- Resultado de visita + oferta en el mismo paso (§19, §23) --------
    await a.patch(`/api/admin/saas/visits/${visit.id}`, { data: { status: 'completed' } })
    const outcomeRes = await a.post(`/api/admin/saas/visits/${visit.id}/outcome`, {
      data: { outcome: 'interested', notes: 'Le encantó la orientación', createOffer: { amount: 415000 } },
    })
    expect(outcomeRes.ok(), await outcomeRes.text()).toBeTruthy()
    const outcome = await outcomeRes.json()
    expect(outcome.offerId, 'anotar "interesado" con importe debe crear una Offer real').toBeTruthy()

    // --- Negociación completa: enviar → contraoferta → aceptar (§23) -----
    await a.post(`/api/admin/saas/offers/${outcome.offerId}/submit`, { data: {} })
    const countered = await (await a.post(`/api/admin/saas/offers/${outcome.offerId}/counter`, { data: { amount: 408000 } })).json()
    expect(countered.currentAmount).toBe(408000)
    const accepted = await (await a.post(`/api/admin/saas/offers/${outcome.offerId}/accept`, { data: {} })).json()
    expect(accepted.status).toBe('accepted')

    // --- Operación: crear, avanzar hasta notaría/firma con cita real, cerrar (§24) ---
    const dealRes = await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: outcome.offerId } })
    expect(dealRes.ok(), await dealRes.text()).toBeTruthy()
    const deal = await dealRes.json()
    expect(deal.stage).toBe('accepted_offer')

    for (const stage of ['reservation', 'deposit_contract', 'financing', 'documentation']) {
      const moved = await (await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'stage', toStage: stage } })).json()
      expect(moved.stage).toBe(stage)
    }

    // Notaría/firma es una Appointment real, no un campo nuevo (§109/§126): tiene que aparecer también en Calendar.
    const notaryScheduledAt = `${new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10)} 12:00:00`
    const notaryVisitRes = await a.post('/api/admin/saas/visits', {
      data: { clientName: 'Comprador Obra Nueva E2E', clientEmail: email, agentId: commercialDevId, propertyId: developerPropertyId, propertyKind: 'developer', scheduledAt: notaryScheduledAt, leadId, type: 'notary', dealId: deal.id },
    })
    expect(notaryVisitRes.ok(), await notaryVisitRes.text()).toBeTruthy()

    const stageToSignature = await (await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'stage', toStage: 'signature' } })).json()
    expect(stageToSignature.stage).toBe('signature')

    const closedRes = await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'close' } })
    expect(closedRes.ok(), await closedRes.text()).toBeTruthy()
    const closed = await closedRes.json()
    expect(closed.status).toBe('closed')
    expect(closed.legacyDealId, 'el cierre debe crear el puente a la tabla legacy de comisiones').toBeTruthy()

    // --- Estado del inmueble (§111/§112): obra nueva no tiene estado de venta — no se toca nada ---
    const { row: devProperty } = await (await a.get(`/api/admin/developer-properties/${developerPropertyId}`)).json()
    expect(devProperty.status, 'developer_properties.status es sólo fase de construcción — cerrar la operación no debe inventarle un estado de venta').toBe('new')

    // --- Timeline de actividad (§21) --------------------------------------
    const activity = await (await a.get('/api/admin/saas/activity', { params: { leadId: String(leadId) } })).json()
    const eventTypes = activity.rows.map((e: any) => e.eventType)
    expect(eventTypes).toEqual(expect.arrayContaining(['LEAD_CREATED', 'OFFER_ACCEPTED', 'DEAL_CREATED', 'DEAL_CLOSED']))
  })

  test('2ª mano: lead sembrado por API, routing manual, hasta operación cerrada con inmueble marcado vendido', async () => {
    const email = `principal-2h-${Date.now()}@example.com`

    // --- Lead real (vía API, sin gastar el presupuesto de /api/public/contact) + routing manual ---
    // Nota: /api/v1/leads valida `propertyId` sólo contra el catálogo de obra
    // nueva (server/api/v1/leads.post.ts) — no acepta inmuebles de 2ª mano.
    // La necesidad de compra de más abajo es lo que conecta este lead con el
    // inmueble de 2ª mano sembrado, vía matching.
    const leadRes = await a.post('/api/v1/leads', {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { name: 'Comprador 2ª Mano E2E', email, source: 'api' },
    })
    expect(leadRes.ok(), await leadRes.text()).toBeTruthy()
    const { data: lead } = await leadRes.json()
    const leadId = lead.id
    // FASE 29 §118: la API v1 pasa por upsertLead(), como los formularios — el lead
    // ya trae su Contact resuelto por email; antes nacía sin él y había que crearlo aparte.
    const contactId = lead.contactId as number
    expect(contactId, 'el lead de la API v1 debe resolver su Contact, como cualquier otra entrada').toBeTruthy()

    const reassignRes = await a.post(`/api/admin/saas/leads/${leadId}/reassign`, { data: { commercialId: commercialAgentId, reason: 'Asignación E2E' } })
    expect(reassignRes.ok(), await reassignRes.text()).toBeTruthy()

    await a.patch(`/api/admin/saas/leads/${leadId}`, { data: { stage: 'qualified' } })

    // --- Necesidad + matching sobre el catálogo de 2ª mano ----------------
    const reqRes = await a.post('/api/admin/saas/buyer-requirements', {
      data: { contactId, operation: 'sale', propertyTypes: ['Apartment'], priceMin: 150000, priceMax: 320000, bedroomsMin: 1, assignedCommercialId: commercialAgentId },
    })
    const requirement = await reqRes.json()
    const matches = await (await a.get(`/api/admin/saas/matching/requirement/${requirement.id}`)).json()
    const agentMatch = matches.results.find((m: any) => m.propertyKind === 'agent' && m.property.id === agentPropertyId)
    expect(agentMatch, 'el inmueble de 2ª mano sembrado debe salir como candidato').toBeTruthy()
    await a.post('/api/admin/saas/matching/matches', { data: { buyerRequirementId: requirement.id, propertyId: agentPropertyId, propertyKind: 'agent', status: 'selected' } })

    // --- Tarea + cita + calendario -----------------------------------------
    await a.post('/api/admin/saas/tasks', { data: { type: 'other', title: 'Preparar visita', dueAt: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 19).replace('T', ' '), assigneeId: commercialAgentId, contactId, leadId } })
    const scheduledAt = `${new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10)} 10:00:00`
    const visit = await (
      await a.post('/api/admin/saas/visits', { data: { clientName: 'Comprador 2ª Mano E2E', clientEmail: email, agentId: commercialAgentId, propertyId: agentPropertyId, propertyKind: 'agent', scheduledAt, leadId, type: 'property_viewing' } })
    ).json()

    // --- Resultado de visita (§19) ------------------------------------------
    // Sin `createOffer` aquí (esa vía ya se prueba en el recorrido de obra
    // nueva): la oferta se crea aparte, con el comprador explícito — el mismo
    // Contact que resolvió el lead.
    await a.patch(`/api/admin/saas/visits/${visit.id}`, { data: { status: 'completed' } })
    const outcomeRes = await a.post(`/api/admin/saas/visits/${visit.id}/outcome`, { data: { outcome: 'interested' } })
    expect(outcomeRes.ok(), await outcomeRes.text()).toBeTruthy()

    // --- Oferta + negociación completa (§23) --------------------------------
    const offer = await (await a.post('/api/admin/saas/offers', { data: { propertyId: agentPropertyId, propertyKind: 'agent', buyerContactId: contactId, commercialId: commercialAgentId, amount: 255000 } })).json()
    await a.post(`/api/admin/saas/offers/${offer.id}/submit`, { data: {} })
    const accepted = await (await a.post(`/api/admin/saas/offers/${offer.id}/accept`, { data: {} })).json()
    expect(accepted.status).toBe('accepted')

    // --- Operación hasta cierre ---------------------------------------------
    const deal = await (await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: offer.id } })).json()
    for (const stage of ['reservation', 'deposit_contract', 'financing', 'documentation', 'notary', 'signature']) {
      await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'stage', toStage: stage } })
    }
    const closed = await (await a.post('/api/admin/saas/deal-operations', { data: { id: deal.id, action: 'close' } })).json()
    expect(closed.status).toBe('closed')

    // --- Estado del inmueble: 2ª mano en venta sí cambia a vendido ----------
    const { row: agentProperty } = await (await a.get(`/api/admin/properties/${agentPropertyId}`)).json()
    expect(agentProperty.status).toBe('sold')

    // Filtrado por contactId, no por leadId: esta oferta se creó con el
    // comprador explícito (§ arriba), no enlazada al lead de este recorrido.
    const activity = await (await a.get('/api/admin/saas/activity', { params: { contactId: String(contactId) } })).json()
    expect(activity.rows.map((e: any) => e.eventType)).toEqual(expect.arrayContaining(['DEAL_CLOSED']))
  })
})
