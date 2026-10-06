import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Núcleo inmobiliario, bloque N8a (FASES 29, 30, 32, 33 y 34) sobre HTTP real:
 *
 *   - un formulario público aparece en Comunicaciones como hilo «Formulario
 *     web» con su lead y su Contact, y se responde sólo por un canal real;
 *   - el chat de la web: activarlo, abrir una conversación como visitante,
 *     responder desde la bandeja, verla en el sondeo del visitante; otra
 *     agencia ni la lee ni la contesta;
 *   - una ficha compartida por el chat lleva enlace personal y su apertura
 *     cuenta en el Lead Score;
 *   - matching exploratorio de INMO/tools sin guardar nada;
 *   - dashboard comercial por la entidad Oficina, con la visibilidad en la respuesta;
 *   - el marketplace sólo ofrece lo que existe.
 *
 * Presupuestos de límite de tasa compartidos con otros specs: UN envío del
 * formulario de contacto (5/10 min por IP) y UNA conversación de chat nueva
 * (5/10 min por IP).
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('N8a — comunicaciones web, aperturas, matching exploratorio y dashboard', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let visitor: APIRequestContext
  let chatWasEnabled = false

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    // El visitante de la web: sin sesión de nadie.
    visitor = await pwRequest.newContext({ baseURL: BASE_URL })
    const settings = await (await a.get('/api/admin/comms/settings')).json()
    chatWasEnabled = Boolean(settings.webChatEnabled)
  })

  test.afterAll(async () => {
    // Deja el chat como estaba.
    await a?.put('/api/admin/comms/settings', { data: { webChatEnabled: chatWasEnabled } }).catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose(), visitor?.dispose()])
  })

  test('formulario público → hilo «Formulario web» con lead y Contact; respuesta sólo por canal real; otra agencia: 404', async ({ page }) => {
    const email = `n8a-form-${RUN}@example.com`
    const sent = await visitor.post('/api/public/contact', { data: { name: `Visitante N8a ${RUN}`, email, phone: '+34 600 000 808', message: 'Quiero información del ático', subject: 'Ático', type: 'contact' } })
    expect(sent.ok(), await sent.text()).toBeTruthy()

    const list = await (await a.get('/api/admin/comms/conversations', { params: { source: 'web_form', status: 'all', q: email } })).json()
    expect(list.rows).toHaveLength(1)
    const row = list.rows[0]
    expect(row).toMatchObject({ source: 'web_form', channel: { label: 'Formulario web' }, formType: 'contact', unreadCount: 1 })
    expect(row.id).toMatch(/^w\d+$/)

    const thread = await (await a.get(`/api/admin/comms/conversations/${row.id}`)).json()
    expect(thread.kind).toBe('web')
    expect(thread.lead?.id, 'el hilo guarda su lead').toBeTruthy()
    expect(thread.crmContact?.id, 'y el Contact de ese lead').toBeTruthy()
    expect(thread.messages[0]).toMatchObject({ direction: 'in', via: 'form', body: 'Quiero información del ático' })
    expect(thread.reply.chat.available).toBe(false)

    // Email: se envía de verdad si la plataforma lo tiene conectado; si no, 409 con el motivo (nunca simulado).
    const reply = await a.post(`/api/admin/comms/conversations/${row.id}/messages`, { data: { type: 'text', via: 'email', body: 'Gracias, te escribimos con la ficha.' } })
    if (thread.reply.email.available) expect([200, 502]).toContain(reply.status())
    else expect(reply.status()).toBe(409)
    // Un canal que no existe para este hilo: 409.
    expect((await a.post(`/api/admin/comms/conversations/${row.id}/messages`, { data: { type: 'text', via: 'chat', body: 'hola' } })).status()).toBe(409)

    // Nota interna, leído y estado.
    expect((await a.post(`/api/admin/comms/conversations/${row.id}/notes`, { data: { body: 'Llamar el lunes' } })).ok()).toBeTruthy()
    expect((await a.post(`/api/admin/comms/conversations/${row.id}/read`)).ok()).toBeTruthy()
    expect((await a.patch(`/api/admin/comms/conversations/${row.id}`, { data: { status: 'pending' } })).ok()).toBeTruthy()

    // El Contact lo ve en su ficha.
    const person = await (await a.get(`/api/admin/saas/contacts/${thread.crmContact.id}`)).json()
    expect(person.communications.webThreads.map((w: any) => w.id)).toContain(row.id)

    // Otra agencia: ni lo lee, ni lo cambia, ni lo contesta.
    expect((await b.get(`/api/admin/comms/conversations/${row.id}`)).status()).toBe(404)
    expect((await b.patch(`/api/admin/comms/conversations/${row.id}`, { data: { status: 'closed' } })).status()).toBe(404)
    expect((await b.post(`/api/admin/comms/conversations/${row.id}/notes`, { data: { body: 'intruso' } })).status()).toBe(404)
    expect((await b.post(`/api/admin/comms/conversations/${row.id}/messages`, { data: { type: 'text', via: 'email', body: 'intruso' } })).status()).toBe(404)
    const listB = await (await b.get('/api/admin/comms/conversations', { params: { source: 'web_form', status: 'all', q: email } })).json()
    expect(listB.rows).toEqual([])

    // En el panel.
    await page.goto(`/admin/comunicaciones?conversation=${row.id}`)
    await expect(page.getByTestId('thread-name')).toContainText(`Visitante N8a ${RUN}`)
    await expect(page.getByTestId('web-composer')).toBeVisible()
    await expect(page.getByTestId('web-thread-panel')).toBeVisible()
  })

  test('chat de la web: visitante ↔ bandeja, enlace personal a una ficha que cuenta en el Lead Score, y aislamiento', async ({ page }) => {
    // Apagado: la web no lo ofrece.
    expect((await a.put('/api/admin/comms/settings', { data: { webChatEnabled: false } })).ok()).toBeTruthy()
    expect((await visitor.post('/api/public/contact?channel=chat&action=start', { data: { name: 'X', message: 'hola' } })).status()).toBe(404)
    expect((await a.put('/api/admin/comms/settings', { data: { webChatEnabled: true, webChatGreeting: `Hola N8a ${RUN}` } })).ok()).toBeTruthy()
    expect((await (await visitor.get('/api/public/tenant')).json()).webChat).toMatchObject({ enabled: true, greeting: `Hola N8a ${RUN}` })

    // Campo trampa: rechazado.
    expect((await visitor.post('/api/public/contact?channel=chat&action=start', { data: { name: 'Bot', message: 'spam', website: 'http://spam.example' } })).status()).toBe(400)

    const email = `n8a-chat-${RUN}@example.com`
    const started = await visitor.post('/api/public/contact?channel=chat&action=start', { data: { name: `Chat N8a ${RUN}`, email, message: '¿Tenéis áticos con terraza?' } })
    expect(started.ok(), await started.text()).toBeTruthy()
    const session = await started.json()
    expect(session.token).toMatch(/^[A-Za-z0-9_-]{40,}$/)

    const list = await (await a.get('/api/admin/comms/conversations', { params: { source: 'web_chat', status: 'all', q: email } })).json()
    expect(list.rows).toHaveLength(1)
    const key = list.rows[0].id
    const thread = await (await a.get(`/api/admin/comms/conversations/${key}`)).json()
    expect(thread.reply.chat.available).toBe(true)
    expect(thread.lead?.id).toBeTruthy()

    // Respuesta por el chat → el visitante la ve en su sondeo; la nota interna, nunca.
    await a.post(`/api/admin/comms/conversations/${key}/notes`, { data: { body: `Nota privada ${RUN}` } })
    const reply = await a.post(`/api/admin/comms/conversations/${key}/messages`, { data: { type: 'text', via: 'chat', body: 'Sí, te enseño uno ahora' } })
    expect(reply.ok(), await reply.text()).toBeTruthy()
    const polled = await (await visitor.post('/api/public/contact?channel=chat&action=poll', { data: { token: session.token, after: 0 } })).json()
    expect(polled.messages.map((m: any) => m.body)).toEqual(['¿Tenéis áticos con terraza?', 'Sí, te enseño uno ahora'])
    expect(JSON.stringify(polled)).not.toContain(`Nota privada ${RUN}`)

    // El visitante escribe otra vez en su hilo; un token inventado no sirve.
    expect((await visitor.post('/api/public/contact?channel=chat&action=send', { data: { token: session.token, message: 'Genial, gracias' } })).ok()).toBeTruthy()
    expect((await visitor.post('/api/public/contact?channel=chat&action=poll', { data: { token: 'x'.repeat(43) } })).status()).toBe(404)

    // Ficha de obra nueva con enlace personal por el chat → apertura real desde la web → Lead Score.
    const props = await (await a.get('/api/admin/comms/properties', { params: { q: '' } })).json()
    const dev = (props.rows || []).find((p: any) => p.kind === 'developer')
    test.skip(!dev, 'Esta base no tiene ninguna propiedad de obra nueva publicada para compartir.')
    const share = await a.post(`/api/admin/comms/conversations/${key}/messages`, { data: { type: 'property', via: 'chat', propertyId: dev.id, propertyKind: 'developer' } })
    expect(share.ok(), await share.text()).toBeTruthy()
    const shared = (await share.json()).message
    const url = /\/propiedades\/([^?\s]+)\?f=([A-Za-z0-9_-]+)/.exec(shared.body)
    expect(url, 'la ficha va con enlace personal').toBeTruthy()
    const opened = await visitor.post(`/api/public/properties/${url![1]}/view`, { data: { f: url![2] } })
    expect((await opened.json()).personalLink).toBe(true)
    // El mismo token desde otra propiedad o inventado no cuenta.
    expect((await (await visitor.post(`/api/public/properties/${url![1]}/view`, { data: { f: 'y'.repeat(32) } })).json()).personalLink).toBe(false)
    const score = await (await a.get('/api/admin/saas/leads', { params: { scoreFor: String(thread.lead.id) } })).json()
    const opened1 = (score.breakdown || score.score?.breakdown || []).find((x: any) => x.criterion === 'opened_listings')
    expect(opened1?.detail).toContain('enlace personal')

    // Otra agencia no ve ni contesta el chat.
    expect((await b.get(`/api/admin/comms/conversations/${key}`)).status()).toBe(404)
    expect((await b.post(`/api/admin/comms/conversations/${key}/messages`, { data: { type: 'text', via: 'chat', body: 'intruso' } })).status()).toBe(404)

    // En la web pública: el widget aparece y recupera la conversación de este navegador.
    await page.goto('/contacto')
    await expect(page.getByTestId('webchat-open')).toBeVisible()
  })

  test('matching exploratorio por la tool find_matches: mismo motor, no guarda nada y ofrece guardarla', async () => {
    const before = (await (await a.get('/api/admin/saas/buyer-requirements')).json()).length
    const res = await a.post('/api/admin/domain-tools', { data: { tool: 'find_matches', input: { criteria: { operation: 'sale', priceMax: 5_000_000 }, limit: 5 } } })
    const body = await res.json()
    expect(body.ok, JSON.stringify(body.error)).toBe(true)
    expect(body.output).toMatchObject({ exploratory: true, saved: false })
    expect(body.output.suggestion).toContain('update_buyer_requirements')
    expect((await (await a.get('/api/admin/saas/buyer-requirements')).json()).length).toBe(before)

    const invalid = await (await a.post('/api/admin/domain-tools', { data: { tool: 'find_matches', input: { criteria: { propertyTypes: ['Castillo'] } } } })).json()
    expect(invalid.ok).toBe(false)
    expect(invalid.error.code).toBe('VALIDATION_ERROR')
  })

  test('dashboard comercial: oficinas como entidad, filtro por officeId y visibilidad declarada', async ({ page }) => {
    const created = await a.post('/api/admin/offices', { data: { name: `Oficina N8a ${RUN}` } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const officeId = (await created.json()).id
    try {
      const options = await (await a.get('/api/admin/saas/overview', { params: { view: 'commercial-options' } })).json()
      expect(options.visibility).toEqual({ mode: 'all' })
      expect(options.offices.some((o: any) => o.id === officeId && o.name === `Oficina N8a ${RUN}`)).toBe(true)

      const d = await (await a.get('/api/admin/saas/overview', { params: { view: 'commercial', officeId: String(officeId) } })).json()
      expect(d.scope.officeId).toBe(officeId)
      expect(d.visibility).toEqual({ mode: 'all' })
      expect(d.kpis.newLeads.value).toBe(0)
      expect(d.kpis.newLeads.link).toContain(`officeScope=${officeId}`)

      await page.goto('/admin/rendimiento')
      await expect(page.getByTestId('dash-office')).toBeVisible()
      await expect(page.getByTestId('dash-own-view')).toHaveCount(0)
    } finally {
      await a.delete(`/api/admin/offices/${officeId}?hard=1`).catch(() => null)
    }
  })

  test('marketplace: lo disponible enlaza a su configuración; lo próximo no tiene botones', async ({ page }) => {
    await page.goto('/admin/marketplace')
    await expect(page.getByTestId('marketplace-app-whatsapp')).toBeVisible()
    await expect(page.getByTestId('marketplace-configure-webchat')).toHaveAttribute('href', '/admin/comunicaciones/configuracion')
    const upcoming = page.getByTestId('marketplace-upcoming')
    await expect(upcoming).toContainText('Portales inmobiliarios')
    await expect(upcoming).toContainText('Firma electrónica')
    await expect(upcoming.locator('button, a')).toHaveCount(0)
  })
})
