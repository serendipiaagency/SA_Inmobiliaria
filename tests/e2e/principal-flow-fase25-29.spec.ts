import { createHmac } from 'node:crypto'
import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * E2E PRINCIPAL de FASES 25-29 (§193): una sola cadena, sin atajos entre
 * pasos, que recorre lo que una agencia hace de verdad con un inmueble —
 *
 *    1. abrir Property                 14. actualizar precio (en bloque)
 *    2. PropertySchemaRegistry          15. comprobar PriceHistory
 *    3. sólo campos relevantes          16. BuyerRequirement compatible
 *    4. editar inline                   17. Matching
 *    5. autosave                        18. seleccionar Property
 *    6. validar draft                   19. abrir Communications
 *    7. completar campos de publicar    20. Contact/Lead del hilo
 *    8. publicar                        21. enviar Property
 *    9. buscar Property                 22. Message creado
 *   10. guardar filtro                  23. PropertyMatch → SENT
 *   11. guardar vista                   24. Activity PROPERTY_SENT
 *   12. compartir vista                 25. CRM 360 muestra la comunicación
 *   13. Bulk Action
 *
 * — y la repite con los dos catálogos: «Propiedades (web)»
 * (developer-properties) y «Propiedades 2ª mano» (properties).
 *
 * El envío por WhatsApp es real hasta el proveedor: el Worker llama a la
 * Graph API, sólo que `scripts/e2e.sh` la sustituye por un simulador local
 * (scripts/e2e-provider-mock.mjs) — así se puede comprobar el cuerpo EXACTO
 * que habría recibido Meta (§125: ningún dato interno sale en el mensaje).
 *
 * Lo que no existe no se finge: 2ª mano no tiene consumidor público
 * (auditoría FASE 26), así que su paso 8 comprueba que «publicar» se
 * rechaza con honestidad en vez de inventar una publicación.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const MOCK_URL = process.env.E2E_PROVIDER_MOCK_URL || 'http://127.0.0.1:8799'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const APP_SECRET = 'e2e_principal_app_secret'
const META_PHONE_NUMBER_ID = `8${String(Date.now()).slice(-11)}`
/** Marcador de un campo interno: nunca puede aparecer en lo que se envía al proveedor. */
const INTERNAL_MARKER = `INTERNO-${RUN}`

const visible = (page: Page, testId: string) => page.locator(`[data-testid="${testId}"]:visible`)
const step = (page: Page, key: string) => visible(page, `property-editor-step-${key}`)

function metaSignature(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`
}
function inboundPayload(wamid: string, from: string, name: string, text: string) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '366634483210361',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '34911000002', phone_number_id: META_PHONE_NUMBER_ID },
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
  { label: 'Propiedades (web)', resource: 'developer-properties', kind: 'developer', entityType: 'developer', idx: 1 },
  { label: 'Propiedades 2ª mano', resource: 'properties', kind: 'agent', entityType: 'agent', idx: 2 },
] as const

test.describe('E2E principal FASES 25-29', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let apiKey: string
  let developerId: number
  let channelId: number
  const createdDeveloperProperties: number[] = []
  const createdProperties: number[] = []
  const createdSavedViews: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })

    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora 25-29 ${RUN}`, email: `p2529-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    developerId = (await dev.json()).id

    const key = await a.post('/api/admin/saas/apikeys', { data: { name: `E2E 25-29 ${RUN}`, environment: 'test', scopes: 'write' } })
    expect(key.ok(), await key.text()).toBeTruthy()
    const keyBody = await key.json()
    apiKey = keyBody.key || keyBody.plainKey || keyBody.apiKey

    // Un número de WhatsApp conectado (credenciales de marcador), y el
    // predeterminado de la organización: es el que usa «Enviar propiedad».
    const channel = await a.post('/api/admin/comms/channels', {
      data: {
        provider: 'meta_cloud',
        label: 'Meta E2E 25-29',
        phone: '+34 911 000 002',
        externalPhoneId: META_PHONE_NUMBER_ID,
        businessAccountId: '366634483210361',
        credentials: { accessToken: 'EAAG-e2e-principal-placeholder-token', appSecret: APP_SECRET, verifyToken: `verify-${RUN}` },
      },
    })
    expect(channel.ok(), await channel.text()).toBeTruthy()
    channelId = (await channel.json()).channel.id
    expect((await a.patch(`/api/admin/comms/channels/${channelId}`, { data: { isDefault: true } })).ok()).toBeTruthy()
  })

  test.afterAll(async () => {
    await Promise.all(createdSavedViews.map((id) => a.delete(`/api/admin/property-saved-views/${id}`).catch(() => null)))
    await Promise.all(createdDeveloperProperties.map((id) => a.delete(`/api/admin/developer-properties/${id}`).catch(() => null)))
    await Promise.all(createdProperties.map((id) => a.delete(`/api/admin/properties/${id}`).catch(() => null)))
    if (channelId) await a.delete(`/api/admin/comms/channels/${channelId}`).catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose(), anon?.dispose()])
  })

  async function runJob(jobId: number) {
    let job: any
    for (let i = 0; i < 50; i++) {
      const res = await a.put(`/api/admin/property-bulk-jobs/${jobId}`, { data: {} })
      expect(res.ok(), `process-next falló: ${res.status()} ${await res.text()}`).toBeTruthy()
      const body = await res.json()
      if (body.job) job = body.job
      if (body.done) return job
    }
    throw new Error('El job no terminó tras 50 iteraciones')
  }

  for (const cat of CATALOGS) {
    test(`${cat.label}: editor → schema → autosave → publicar → buscar → vistas → bulk → precio → matching → WhatsApp → CRM 360`, async ({ page }) => {
      test.setTimeout(180_000)
      const cityTag = `E2E-2529-${cat.kind}-${RUN}`
      const initialPrice = 300000 + cat.idx * 1000 + (Date.now() % 997)
      const newPrice = initialPrice - 12500

      // --- Semilla: una ficha incompleta (borrador) ---------------------------
      const seed =
        cat.kind === 'developer'
          ? {
              developerId,
              name: `Residencial 25-29 ${RUN}`,
              status: 'new',
              transactionType: 'sale',
              propertyType: 'Apartment',
              price: initialPrice,
              bedrooms: 2,
              city: cityTag,
              externalReference: INTERNAL_MARKER,
            }
          : {
              slug: `e2e-2529-${RUN}`,
              street: `Calle Principal 25-29 ${RUN}`,
              status: 'available',
              transactionType: 'sale',
              propertyType: 'Apartment',
              price: initialPrice,
              bedrooms: 2,
              area: 80,
              city: cityTag,
              externalReference: INTERNAL_MARKER,
              agencyReference: INTERNAL_MARKER,
            }
      const created = await a.post(`/api/admin/${cat.resource}`, { data: seed })
      expect(created.ok(), await created.text()).toBeTruthy()
      const propertyId = (await created.json()).id as number
      ;(cat.kind === 'developer' ? createdDeveloperProperties : createdProperties).push(propertyId)

      // --- 1. abrir Property ---------------------------------------------------
      await page.goto(`/admin/${cat.resource}/${propertyId}`)
      await expect(visible(page, 'property-editor-hint')).toHaveText('Los cambios se guardan automáticamente.')

      // --- 2-3. PropertySchemaRegistry elige el schema; sólo campos relevantes ---
      const { __propertySchemas: registry } = await (await a.get('/api/admin/resources')).json()
      if (cat.kind === 'developer') {
        const newDevelopment = registry.schemas.find((s: any) => s.key === 'newDevelopment')
        expect(newDevelopment.catalogs).toEqual(['developer'])
        expect(Object.keys(newDevelopment.fields)).toContain('handoverDate')
        // Campo propio de obra nueva: está en este editor (y no en el de 2ª mano, abajo).
        await expect(page.locator('[data-field="handoverDate"]')).toHaveCount(1)
      } else {
        expect(registry.agentTypeMap.Apartment).toBe('residential')
        expect(registry.agentTypeMap.Land).toBe('land')
        await expect(page.locator('[data-field="handoverDate"]')).toHaveCount(0)
        // Residencial: habitaciones sí, parcela no aplica…
        await expect(page.locator('[data-field="bedrooms"]')).toHaveCount(1)
        // …y al cambiar el tipo a Suelo, el registro cambia de schema y el
        // editor oculta lo que ya no aplica y muestra lo que sí.
        await step(page, 'info').click()
        await page.locator('[data-field="propertyType"] select').selectOption('Land')
        await expect(page.locator('[data-field="bedrooms"]')).toHaveCount(0)
        await expect(page.locator('[data-field="plotArea"]')).toHaveCount(1)
        await page.locator('[data-field="propertyType"] select').selectOption('Apartment')
        await expect(page.locator('[data-field="bedrooms"]')).toHaveCount(1)
      }

      // --- 4-5. editar inline + autosave (nadie pulsa Guardar) -------------------
      // Web: un campo de ubicación. 2ª mano: el precio — un cambio real de
      // precio hecho a mano también tiene que dejar su PriceHistory (§94).
      const inlineValue = `Zona 25-29 ${cat.kind}`
      const inlinePrice = initialPrice + 777
      await step(page, 'location').click()
      await page.locator('[data-field="district"] input').fill(inlineValue)
      if (cat.kind === 'agent') {
        await step(page, 'price').click()
        await page.locator('[data-field="price"] input').fill(String(inlinePrice))
      }
      // Escrito pero sin guardar todavía (debounce); luego se guarda solo.
      await expect(page.getByTestId('property-editor-save-state')).toHaveText('Cambios sin guardar')
      await expect(page.getByTestId('property-editor-save-state')).toHaveText('Guardado', { timeout: 6000 })
      const autosaved = await (await a.get(`/api/admin/${cat.resource}/${propertyId}`)).json()
      const afterAutosave = autosaved.row
      expect(afterAutosave.district).toBe(inlineValue)
      expect(afterAutosave.propertyType ?? afterAutosave.propertyTypeMain ?? 'Apartment').toBe('Apartment')
      if (cat.kind === 'agent') {
        expect(afterAutosave.price).toBe(inlinePrice)
        expect(autosaved.priceHistory.map((h: any) => h.price)).toEqual([inlinePrice])
      } else {
        expect(autosaved.priceHistory).toEqual([])
      }

      // --- 6-8. validar draft, completar, publicar ------------------------------
      if (cat.kind === 'developer') {
        // Un borrador incompleto se guarda (§21), pero no se publica: el
        // servidor dice exactamente qué falta.
        // Va con un precio nuevo dentro: un PUT rechazado no deja ninguna
        // fila de histórico con un precio que nunca se guardó.
        const rejected = await a.put(`/api/admin/developer-properties/${propertyId}`, { data: { publishedAt: new Date().toISOString(), price: initialPrice + 1 } })
        expect(rejected.status()).toBe(422)
        const reason = (await rejected.json()).statusMessage || (await rejected.text())
        for (const field of ['country', 'area', 'description', 'coverImage']) expect(reason).toContain(field)
        const stillDraft = await (await a.get(`/api/admin/developer-properties/${propertyId}`)).json()
        expect(stillDraft.row.publishedAt).toBeFalsy()
        expect(stillDraft.row.price).toBe(initialPrice)
        expect(stillDraft.priceHistory).toEqual([])

        const completed = await a.put(`/api/admin/developer-properties/${propertyId}`, {
          data: { country: 'España', area: 92, description: 'Lista para publicar (E2E 25-29)', coverImage: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2' },
        })
        expect(completed.ok(), await completed.text()).toBeTruthy()

        const published = await a.put(`/api/admin/developer-properties/${propertyId}`, { data: { publishedAt: new Date().toISOString() } })
        expect(published.ok(), await published.text()).toBeTruthy()
        expect((await (await a.get(`/api/admin/developer-properties/${propertyId}`)).json()).row.publishedAt).toBeTruthy()
      } else {
        // 2ª mano: la ficha incompleta se guarda (§21) y queda «disponible»
        // para la agencia, pero no existe ningún consumidor público al que
        // publicarla — «publicar» se rechaza fila a fila, no se finge.
        const job = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: 'agent', action: 'publish', params: {}, ids: [propertyId] } })
        expect(job.ok(), await job.text()).toBeTruthy()
        const jobBody = await job.json()
        expect((await runJob(jobBody.id ?? jobBody.job.id)).status).toBe('failed')
        expect(afterAutosave.status).toBe('available')
      }

      // --- 9. buscar Property ---------------------------------------------------
      const search = await (await a.get(`/api/admin/${cat.resource}`, { params: { city: cityTag } })).json()
      expect(search.rows.map((r: any) => r.id)).toEqual([propertyId])

      // --- 10. guardar filtro ---------------------------------------------------
      const queryJson = JSON.stringify({ city: cityTag })
      const filterRes = await a.post('/api/admin/property-saved-views', { data: { resource: cat.resource, kind: 'filter', name: `Filtro 25-29 ${cat.kind} ${RUN}`, visibility: 'private', queryJson } })
      expect(filterRes.ok(), await filterRes.text()).toBeTruthy()
      const filterId = (await filterRes.json()).id as number
      createdSavedViews.push(filterId)
      const savedFilter = (await (await a.get('/api/admin/property-saved-views', { params: { resource: cat.resource } })).json()).rows.find((r: any) => r.id === filterId)
      const rerun = await (await a.get(`/api/admin/${cat.resource}`, { params: JSON.parse(savedFilter.queryJson) })).json()
      expect(rerun.rows.some((r: any) => r.id === propertyId), 'el filtro guardado, reaplicado, debe volver a encontrar la ficha').toBe(true)

      // --- 11-12. guardar vista y compartirla -----------------------------------
      const viewRes = await a.post('/api/admin/property-saved-views', {
        data: { resource: cat.resource, kind: 'view', name: `Vista 25-29 ${cat.kind} ${RUN}`, visibility: 'private', queryJson, columnsJson: JSON.stringify(['price', 'status', 'city']) },
      })
      expect(viewRes.ok(), await viewRes.text()).toBeTruthy()
      const viewId = (await viewRes.json()).id as number
      createdSavedViews.push(viewId)
      expect((await a.put(`/api/admin/property-saved-views/${viewId}`, { data: { visibility: 'shared' } })).ok()).toBeTruthy()
      const sharedView = (await (await a.get('/api/admin/property-saved-views', { params: { resource: cat.resource } })).json()).rows.find((r: any) => r.id === viewId)
      expect(sharedView).toMatchObject({ kind: 'view', visibility: 'shared', columnsJson: JSON.stringify(['price', 'status', 'city']) })
      // Compartida dentro de la organización — nunca fuera de ella (el
      // detalle entre dos usuarios de la misma agencia: property-saved-views.spec.ts).
      expect((await b.get(`/api/admin/property-saved-views/${viewId}`)).status()).toBe(404)

      // --- 13. Bulk Action sobre «todos los filtrados» del filtro guardado ------
      const tagJob = await a.post('/api/admin/property-bulk-jobs', {
        data: { entityType: cat.entityType, action: 'add_tag', params: { tagName: `Campaña 25-29 ${RUN}` }, selectAllFiltered: true, filters: JSON.parse(savedFilter.queryJson) },
      })
      expect(tagJob.ok(), await tagJob.text()).toBeTruthy()
      const tagBody = await tagJob.json()
      const tagJobRow = tagBody.job ?? tagBody
      expect(tagJobRow.totalCount).toBe(1)
      expect((await runJob(tagJobRow.id)).status).toBe('completed')

      // --- 14. actualizar precio (en bloque) ------------------------------------
      const priceJob = await a.post('/api/admin/property-bulk-jobs', { data: { entityType: cat.entityType, action: 'update_price', params: { price: newPrice }, ids: [propertyId] } })
      expect(priceJob.ok(), await priceJob.text()).toBeTruthy()
      const priceBody = await priceJob.json()
      expect((await runJob(priceBody.id ?? priceBody.job.id)).status).toBe('completed')

      // --- 15. PriceHistory: en la API de la ficha y en el editor ---------------
      const afterPrice = await (await a.get(`/api/admin/${cat.resource}/${propertyId}`)).json()
      expect(afterPrice.row.price).toBe(newPrice)
      // Más reciente primero: la del bloque y, en 2ª mano, la de la edición a mano.
      expect(afterPrice.priceHistory.map((h: any) => h.price)).toEqual(cat.kind === 'agent' ? [newPrice, inlinePrice] : [newPrice])
      await page.goto(`/admin/${cat.resource}/${propertyId}`)
      await expect(page.getByTestId('property-price-history')).toBeVisible()
      expect(await page.getByTestId('property-price-history-row').count()).toBe(afterPrice.priceHistory.length)
      // Otra agencia no ve la ficha ni, por tanto, su histórico.
      expect((await b.get(`/api/admin/${cat.resource}/${propertyId}`)).status()).toBe(404)

      // --- 16. un comprador real con una necesidad compatible -------------------
      const buyerName = `Comprador 25-29 ${cat.kind} ${RUN}`
      const buyerEmail = `comprador-2529-${cat.kind}-${RUN}@example.com`
      const waId = `346${String(Date.now()).slice(-7)}${cat.idx}`
      const leadRes = await a.post('/api/v1/leads', { headers: { Authorization: `Bearer ${apiKey}` }, data: { name: buyerName, email: buyerEmail, phone: `+${waId}` } })
      expect(leadRes.ok(), await leadRes.text()).toBeTruthy()
      const { data: lead } = await leadRes.json()
      const contactId = lead.contactId as number
      expect(contactId, 'upsertLead() debe resolver el Contact del comprador').toBeTruthy()

      const reqRes = await a.post('/api/admin/saas/buyer-requirements', {
        data: { contactId, title: `Necesidad 25-29 ${cat.kind} ${RUN}`, operation: 'sale', propertyTypes: ['Apartment'], priceMin: newPrice - 1500, priceMax: newPrice + 1500, bedroomsMin: 1 },
      })
      expect(reqRes.ok(), await reqRes.text()).toBeTruthy()
      const requirement = await reqRes.json()

      // --- 17. Matching ---------------------------------------------------------
      const matching = await (await a.get(`/api/admin/saas/matching/requirement/${requirement.id}`, { params: { limit: '200' } })).json()
      const candidate = matching.results.find((m: any) => m.propertyKind === cat.kind && m.property.id === propertyId)
      expect(candidate, 'la ficha debe salir como candidata para la necesidad').toBeTruthy()
      expect(candidate.persisted).toBeNull()

      // El comprador escribe primero por WhatsApp: abre la ventana de 24 h y,
      // por su teléfono, el hilo queda vinculado a su lead.
      const inbound = inboundPayload(`wamid.e2e.in.${RUN}.${cat.idx}`, waId, buyerName, '¿Tenéis algo en mi rango?')
      const hook = await anon.post('/api/comms/webhooks/meta', { headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(inbound) }, data: inbound })
      expect(hook.ok(), await hook.text()).toBeTruthy()
      expect(await hook.json()).toMatchObject({ processed: 1 })

      // --- 18-21. seleccionar en Compatibilidades y «Enviar propiedad» ----------
      await page.goto('/admin/compatibilidades')
      await page.getByTestId('match-property-select').selectOption(`${cat.kind}:${propertyId}`)
      const row = page.getByTestId(`match-requirement-${requirement.id}`)
      await expect(row).toBeVisible()
      await expect(row).toContainText(buyerName)
      await row.getByTestId('match-select').click()
      await expect(row.getByTestId('match-select')).toHaveText('Seleccionado')
      await row.getByTestId('match-send-property').click()
      await expect(row.getByTestId('match-send-property')).toHaveText('Propiedad enviada')

      // --- 19-20. el hilo en Comunicaciones, con su Contact/Lead ----------------
      const conversations = await (await a.get('/api/admin/comms/conversations', { params: { q: waId, status: 'all' } })).json()
      expect(conversations.rows).toHaveLength(1)
      const conversationId = conversations.rows[0].id as number
      const thread = await (await a.get(`/api/admin/comms/conversations/${conversationId}`)).json()
      expect(thread.lead?.id, 'el hilo debe estar vinculado al lead del comprador').toBe(lead.id)
      expect(thread.conversation).toMatchObject({ propertyId, propertyKind: cat.kind })

      // --- 22. Message creado, aceptado por el proveedor ------------------------
      const shared = thread.messages.filter((m: any) => m.type === 'property_share')
      expect(shared).toHaveLength(1)
      expect(shared[0]).toMatchObject({ direction: 'out', status: 'sent', propertyId, propertyKind: cat.kind })

      await page.goto(`/admin/comunicaciones?conversation=${conversationId}`)
      await expect(page.getByTestId(`message-${shared[0].id}`)).toBeVisible()

      // §125: lo que llegó al proveedor no lleva ningún dato interno.
      const sentToProvider = ((await (await fetch(`${MOCK_URL}/__requests`)).json()) as any[]).filter(
        (r) => r.method === 'POST' && r.path.endsWith(`/${META_PHONE_NUMBER_ID}/messages`) && r.body?.to === waId && r.body?.type !== undefined,
      )
      expect(sentToProvider).toHaveLength(1)
      expect(sentToProvider[0].hasBearer).toBe(true)
      const payload = JSON.stringify(sentToProvider[0].body)
      expect(payload).not.toContain(INTERNAL_MARKER)
      expect(payload).toContain(new Intl.NumberFormat('es-ES').format(newPrice).slice(0, 3))
      if (cat.kind === 'developer') {
        expect(sentToProvider[0].body.type).toBe('image')
        expect(payload).toContain(`Residencial 25-29 ${RUN}`)
      } else {
        expect(sentToProvider[0].body.type).toBe('text')
      }

      // --- 23. PropertyMatch pasa a SENT (sólo porque el envío ocurrió) ---------
      const after = await (await a.get(`/api/admin/saas/matching/requirement/${requirement.id}`, { params: { limit: '200' } })).json()
      const sentMatch = after.results.find((m: any) => m.propertyKind === cat.kind && m.property.id === propertyId)
      expect(sentMatch.persisted?.status).toBe('sent')

      // --- 24. Activity registra el envío --------------------------------------
      const activity = await (await a.get('/api/admin/saas/activity', { params: { leadId: String(lead.id) } })).json()
      const sentEvent = activity.rows.find((e: any) => e.eventType === 'PROPERTY_SENT')
      expect(sentEvent, 'PROPERTY_SENT debe estar en el timeline del lead').toBeTruthy()
      expect(sentEvent).toMatchObject({ propertyId, propertyKind: cat.kind })
      expect(activity.rows.map((e: any) => e.eventType)).toContain('LEAD_CREATED')

      // --- 25. CRM 360: la ficha del Contact muestra la comunicación ------------
      const contact360 = await (await a.get(`/api/admin/saas/contacts/${contactId}`)).json()
      expect(contact360.communications.conversations.some((c: any) => c.id === conversationId)).toBe(true)
      expect((await b.get(`/api/admin/saas/contacts/${contactId}`)).status()).toBe(404)
      await page.goto(`/admin/contactos/${contactId}?tab=comunicaciones`)
      await expect(page.getByTestId(`related-conversation-${conversationId}`)).toBeVisible()

      // Y la ficha del inmueble también lo enseña (§141).
      await page.goto(`/admin/${cat.resource}/${propertyId}`)
      await expect(page.getByTestId(`property-conversation-${conversationId}`)).toBeVisible()
    })
  }
})
