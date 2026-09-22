import { createHmac } from 'node:crypto'
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Centro de Comunicaciones sobre HTTP real: los webhooks firmados (Meta y
 * Twilio) con el secreto del canal que cada agencia guarda cifrado, la
 * idempotencia, el aislamiento entre agencias, el flujo de la bandeja
 * (notas, leído, vincular, llamadas, seguimiento, ventana de 24 h) y las
 * tres pantallas del panel. No se toca ningún proveedor real: los tokens
 * son marcadores de posición y ningún test provoca un envío saliente.
 *
 * COMMS_CREDENTIALS_ENCRYPTION_KEY la inyecta scripts/e2e.sh como
 * marcador fijo, igual que los secretos de Stripe y Resend.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const APP_SECRET = 'e2e_app_secret'
const VERIFY_TOKEN = 'e2e_verify_token'
const META_PHONE_NUMBER_ID = `9${String(Date.now()).slice(-11)}`
const TWILIO_AUTH_TOKEN = 'e2e_twilio_auth_token'
// El Account SID se construye en tiempo de ejecución: un literal AC+32 hex dispara la
// protección de secretos de GitHub aunque sea un marcador de posición.
const TWILIO_ACCOUNT_SID = 'AC' + '0123456789abcdef'.repeat(2)
const TWILIO_FROM = `+1415523${String(Date.now()).slice(-4)}`

function metaSignature(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`
}
function twilioSignature(url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('')
  return createHmac('sha1', TWILIO_AUTH_TOKEN).update(data).digest('base64')
}
function metaTextPayload(wamid: string, from: string, text: string) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '366634483210360',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '34911000001', phone_number_id: META_PHONE_NUMBER_ID },
              contacts: [{ profile: { name: 'Ana E2E' }, wa_id: from }],
              messages: [{ from, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  })
}

test.describe('Centro de Comunicaciones', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let metaChannelId: number
  let twilioChannelId: number
  let inboundConversationId: number
  let inboundContactId: number
  const createdClientIds: number[] = []
  const createdTeamIds: number[] = []
  const INBOUND_FROM = `34600${String(Date.now()).slice(-6)}`

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
  })

  test.afterAll(async () => {
    await Promise.all(createdClientIds.map((id) => a.delete(`/api/admin/clients/${id}`)))
    await Promise.all(createdTeamIds.map((id) => a.delete(`/api/admin/team/${id}`)))
    if (metaChannelId) await a.delete(`/api/admin/comms/channels/${metaChannelId}`)
    if (twilioChannelId) await a.delete(`/api/admin/comms/channels/${twilioChannelId}`)
    await a?.dispose()
    await b?.dispose()
    await anon?.dispose()
  })

  test('conectar un número guarda las credenciales cifradas y nunca las devuelve; otra agencia no lo ve', async () => {
    const res = await a.post('/api/admin/comms/channels', {
      data: {
        provider: 'meta_cloud',
        label: 'Meta E2E',
        phone: '+34 911 000 001',
        externalPhoneId: META_PHONE_NUMBER_ID,
        businessAccountId: '366634483210360',
        credentials: { accessToken: 'EAAG-e2e-placeholder-token-1234567890', appSecret: APP_SECRET, verifyToken: VERIFY_TOKEN },
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const body = await res.json()
    metaChannelId = body.channel.id
    expect(body.channel.credentials).toEqual({ hasAccessToken: true, hasAppSecret: true, hasVerifyToken: true, hasAccountSid: false, hasAuthToken: false })
    expect(body.channel.capabilities.calling).toBe(true)

    const listText = await (await a.get('/api/admin/comms/channels')).text()
    expect(listText).not.toContain('EAAG-e2e-placeholder')
    expect(listText).not.toContain(APP_SECRET)
    expect(JSON.parse(listText).rows.some((c: any) => c.id === metaChannelId)).toBe(true)

    const listB = await (await b.get('/api/admin/comms/channels')).json()
    expect(listB.rows.some((c: any) => c.id === metaChannelId)).toBe(false)
    expect((await b.patch(`/api/admin/comms/channels/${metaChannelId}`, { data: { label: 'robo' } })).status()).toBe(404)

    const overview = await (await a.get('/api/admin/comms/overview')).json()
    expect(overview.configured).toBe(true)
    expect(overview.encryptionAvailable).toBe(true)
  })

  test('el handshake del webhook de Meta responde el challenge sólo con el token del canal', async () => {
    const ok = await anon.get('/api/comms/webhooks/meta', { params: { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '424242' } })
    expect(ok.status()).toBe(200)
    expect(await ok.text()).toBe('424242')
    const bad = await anon.get('/api/comms/webhooks/meta', { params: { 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '1' } })
    expect(bad.status()).toBe(403)
  })

  test('un webhook de Meta sin firma válida se rechaza con 403 y no crea nada', async () => {
    const body = metaTextPayload(`wamid.e2e.bad.${Date.now()}`, INBOUND_FROM, 'no debería entrar')
    const unsigned = await anon.post('/api/comms/webhooks/meta', { headers: { 'content-type': 'application/json' }, data: body })
    expect(unsigned.status()).toBe(403)
    const forged = await anon.post('/api/comms/webhooks/meta', { headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' }, data: body })
    expect(forged.status()).toBe(403)
    const unknownNumber = JSON.parse(body)
    unknownNumber.entry[0].changes[0].value.metadata.phone_number_id = '1'
    const unknown = await anon.post('/api/comms/webhooks/meta', { headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(JSON.stringify(unknownNumber)) }, data: JSON.stringify(unknownNumber) })
    expect(unknown.status()).toBe(403)
    const list = await (await a.get('/api/admin/comms/conversations', { params: { q: INBOUND_FROM } })).json()
    expect(list.rows).toEqual([])
  })

  test('un mensaje entrante firmado abre la conversación, sólo visible para su agencia, y el reenvío no duplica', async () => {
    const wamid = `wamid.e2e.${Date.now()}`
    const body = metaTextPayload(wamid, INBOUND_FROM, 'Hola desde e2e, me interesa el ático')
    const first = await anon.post('/api/comms/webhooks/meta', { headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(body) }, data: body })
    expect(first.ok(), await first.text()).toBeTruthy()
    expect(await first.json()).toMatchObject({ received: true, processed: 1, duplicates: 0, unknown: 0 })

    const list = await (await a.get('/api/admin/comms/conversations', { params: { q: INBOUND_FROM } })).json()
    expect(list.rows).toHaveLength(1)
    const conv = list.rows[0]
    inboundConversationId = conv.id
    inboundContactId = conv.contact.id
    expect(conv).toMatchObject({ status: 'open', unreadCount: 1, lastMessagePreview: 'Hola desde e2e, me interesa el ático' })
    expect(conv.contact).toMatchObject({ phone: `+${INBOUND_FROM}`, known: false, displayName: 'Ana E2E', consentStatus: 'opted_in' })
    expect(conv.window.open).toBe(true)

    expect((await b.get(`/api/admin/comms/conversations/${inboundConversationId}`)).status()).toBe(404)
    const listB = await (await b.get('/api/admin/comms/conversations', { params: { q: INBOUND_FROM } })).json()
    expect(listB.rows).toEqual([])

    const again = await anon.post('/api/comms/webhooks/meta', { headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature(body) }, data: body })
    expect(await again.json()).toMatchObject({ processed: 0, duplicates: 1 })
    const thread = await (await a.get(`/api/admin/comms/conversations/${inboundConversationId}`)).json()
    expect(thread.messages).toHaveLength(1)
    expect(thread.messages[0]).toMatchObject({ direction: 'in', type: 'text', body: 'Hola desde e2e, me interesa el ático', status: 'received' })
    expect(thread.conversation.unreadCount).toBe(1)
  })

  test('la bandeja muestra el hilo, el redactor abierto y la ficha del contacto desconocido', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.location().url.includes('/api/media/')) consoleErrors.push(msg.text())
    })
    await page.goto(`/admin/comunicaciones?conversation=${inboundConversationId}`)
    await expect(page.getByTestId('comms-inbox')).toBeVisible()
    await expect(page.getByTestId('thread-name')).toContainText('Ana E2E')
    await expect(page.getByTestId('comms-thread')).toContainText('Hola desde e2e, me interesa el ático')
    await expect(page.getByTestId('comms-composer-input')).toBeEnabled()
    await expect(page.getByTestId('contact-unknown')).toBeVisible()
    await expect(page.getByTestId('conversation-window')).toContainText('abierta')
    await expect(page.getByTestId(`comms-conversation-${inboundConversationId}`)).toBeVisible()

    // Escribir una nota interna desde el propio redactor: queda en el hilo y nunca sale.
    await page.getByTestId('composer-note-toggle').click()
    await page.getByTestId('comms-composer-input').fill('Nota interna e2e: llamar mañana')
    await page.getByTestId('comms-send').click()
    await expect(page.getByTestId('comms-thread')).toContainText('Nota interna e2e: llamar mañana')

    expect(consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('net::ERR_'))).toEqual([])
  })

  test('el flujo del hilo por API: leído, vincular a un lead nuevo, registrar llamada y programar seguimiento', async () => {
    const read = await a.post(`/api/admin/comms/conversations/${inboundConversationId}/read`)
    expect(read.ok()).toBeTruthy()
    let thread = await (await a.get(`/api/admin/comms/conversations/${inboundConversationId}`)).json()
    expect(thread.conversation.unreadCount).toBe(0)
    expect(thread.messages.some((m: any) => m.direction === 'note' && m.body.includes('Nota interna e2e'))).toBe(true)

    const linked = await a.post(`/api/admin/comms/contacts/${inboundContactId}/link`, { data: { createLead: { name: 'Ana Lead E2E' } } })
    expect(linked.ok(), await linked.text()).toBeTruthy()
    const contact = (await linked.json()).contact
    expect(contact.known).toBe(true)
    expect(contact.lead).toMatchObject({ name: 'Ana Lead E2E', status: 'new' })
    expect(contact.name).toBe('Ana Lead E2E')
    expect((await b.post(`/api/admin/comms/contacts/${inboundContactId}/link`, { data: { unlink: true } })).status()).toBe(404)

    const call = await a.post('/api/admin/comms/calls/log', { data: { conversationId: inboundConversationId, direction: 'outbound', outcome: 'interested', notes: 'Quiere visitar el sábado', durationSeconds: 240 } })
    expect(call.ok(), await call.text()).toBeTruthy()
    const callId = (await call.json()).call.id
    expect((await b.get(`/api/admin/comms/calls/${callId}`)).status()).toBe(404)

    const agent = await a.post('/api/admin/team', { data: { name: `E2E Comercial Comms ${Date.now()}`, email: `comms-${Date.now()}@example.com`, position: 'Agente' } })
    const agentId = (await agent.json()).id
    createdTeamIds.push(agentId)
    const when = new Date(Date.now() + 3 * 86_400_000)
    when.setUTCHours(10, 0, 0, 0)
    const scheduledAt = when.toISOString().replace('T', ' ').slice(0, 19)
    const followUp = await a.post(`/api/admin/comms/conversations/${inboundConversationId}/follow-up`, { data: { agentId, scheduledAt, channel: 'phone', notes: 'Confirmar visita' } })
    expect(followUp.ok(), await followUp.text()).toBeTruthy()
    const visit = (await followUp.json()).visit
    expect(visit.scheduledAt).toBe(scheduledAt)
    const visits = await (await a.get('/api/admin/saas/visits')).json()
    expect(visits.rows.some((v: any) => v.id === visit.id && v.channel === 'phone')).toBe(true)

    thread = await (await a.get(`/api/admin/comms/conversations/${inboundConversationId}`)).json()
    expect(thread.calls.some((c: any) => c.id === callId && c.outcome === 'interested')).toBe(true)
    expect(thread.messages.some((m: any) => m.type === 'call' && m.body.includes('Interesado'))).toBe(true)
    expect(thread.messages.some((m: any) => m.direction === 'note' && m.body.includes('Seguimiento programado'))).toBe(true)

    // Y la actividad 360º del lead... el lead no tiene ficha; la del cliente se comprueba en el test siguiente.
  })

  test('desde la ficha de un cliente: la conversación se abre sin escribir nada, y fuera de la ventana sólo valen plantillas', async ({ page }) => {
    const created = await a.post('/api/admin/clients', { data: { name: `Cliente Comms E2E ${Date.now()}`, type: 'buyer', stage: 'active', phone: `+34611${String(Date.now()).slice(-6)}` } })
    const clientId = (await created.json()).id
    createdClientIds.push(clientId)

    const opened = await a.post('/api/admin/comms/conversations', { data: { clientId } })
    expect(opened.ok(), await opened.text()).toBeTruthy()
    const { id: conversationId } = await opened.json()

    // El cliente nunca escribió: texto libre → 422 con el motivo, sin tocar al proveedor.
    const text = await a.post(`/api/admin/comms/conversations/${conversationId}/messages`, { data: { type: 'text', body: 'Hola' } })
    expect(text.status()).toBe(422)
    expect((await text.json()).data?.code).toBe('window_closed')
    const thread = await (await a.get(`/api/admin/comms/conversations/${conversationId}`)).json()
    expect(thread.messages).toEqual([])
    expect(thread.conversation.contact.client.id).toBe(clientId)

    // Una plantilla registrada a mano aparece disponible en el hilo.
    const tpl = await a.post('/api/admin/comms/templates', { data: { channelId: metaChannelId, name: 'seguimiento_e2e', language: 'es', body: 'Hola {{1}}, ¿seguimos con {{2}}?' } })
    expect(tpl.ok(), await tpl.text()).toBeTruthy()
    const threadWithTpl = await (await a.get(`/api/admin/comms/conversations/${conversationId}`)).json()
    expect(threadWithTpl.templates.some((t: any) => t.name === 'seguimiento_e2e')).toBe(true)

    // La ficha del cliente lleva los botones y la pestaña Comunicaciones lista el hilo.
    await page.goto(`/admin/clientes/${clientId}`)
    await expect(page.getByTestId('contact-whatsapp-button')).toBeVisible()
    await expect(page.getByTestId('contact-call-button')).toBeVisible()
    await page.getByRole('button', { name: /^Comunicaciones/ }).click()
    await expect(page.getByTestId('client-tab-comunicaciones')).toBeVisible()
    await page.getByTestId('contact-whatsapp-button').click()
    await expect(page).toHaveURL(new RegExp(`/admin/comunicaciones\\?conversation=${conversationId}`))
    await expect(page.getByTestId('composer-blocked')).toContainText('plantilla')
    await expect(page.getByTestId('comms-composer-input')).toBeDisabled()
  })

  test('Twilio: un mensaje entrante firmado con el auth token del canal entra; una firma falsa no', async () => {
    const res = await a.post('/api/admin/comms/channels', { data: { provider: 'twilio', label: 'Twilio E2E', phone: TWILIO_FROM, credentials: { accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN } } })
    expect(res.ok(), await res.text()).toBeTruthy()
    twilioChannelId = (await res.json()).channel.id

    const url = `${BASE_URL}/api/comms/webhooks/twilio/inbound`
    const from = `+34622${String(Date.now()).slice(-6)}`
    const params = { MessageSid: `SMe2e${Date.now()}`, AccountSid: TWILIO_ACCOUNT_SID, From: `whatsapp:${from}`, To: `whatsapp:${TWILIO_FROM}`, Body: 'Hola por Twilio', NumMedia: '0', ProfileName: 'Luis E2E', WaId: from.slice(1) }
    const form = new URLSearchParams(params).toString()

    const forged = await anon.post('/api/comms/webhooks/twilio/inbound', { headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'bad' }, data: form })
    expect(forged.status()).toBe(403)

    const ok = await anon.post('/api/comms/webhooks/twilio/inbound', { headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSignature(url, params) }, data: form })
    expect(ok.ok(), await ok.text()).toBeTruthy()
    expect(await ok.text()).toContain('<Response></Response>')

    const list = await (await a.get('/api/admin/comms/conversations', { params: { q: from.slice(1) } })).json()
    expect(list.rows).toHaveLength(1)
    expect(list.rows[0]).toMatchObject({ lastMessagePreview: 'Hola por Twilio', channel: { provider: 'twilio' } })
    expect(list.rows[0].contact.displayName).toBe('Luis E2E')
  })

  test('la configuración lista los números conectados sin secretos y la matriz de capacidades', async ({ page }) => {
    await page.goto('/admin/comunicaciones/configuracion')
    await expect(page.getByTestId('comms-config-page')).toBeVisible()
    await expect(page.getByTestId(`comms-channel-${metaChannelId}`)).toContainText('Meta E2E')
    await expect(page.getByTestId(`comms-channel-${twilioChannelId}`)).toContainText('Twilio E2E')
    await expect(page.getByRole('cell', { name: 'Llamadas de voz por WhatsApp' })).toBeVisible()
    const html = await page.content()
    expect(html).not.toContain('EAAG-e2e-placeholder')
    expect(html).not.toContain(TWILIO_AUTH_TOKEN)
  })

  test('un administrador de otra agencia no puede tocar la bandeja de la primera', async () => {
    expect((await b.patch(`/api/admin/comms/conversations/${inboundConversationId}`, { data: { status: 'closed' } })).status()).toBe(404)
    expect((await b.post(`/api/admin/comms/conversations/${inboundConversationId}/notes`, { data: { body: 'intruso' } })).status()).toBe(404)
    expect((await b.post(`/api/admin/comms/conversations/${inboundConversationId}/messages`, { data: { type: 'text', body: 'intruso' } })).status()).toBe(404)
    const thread = await (await a.get(`/api/admin/comms/conversations/${inboundConversationId}`)).json()
    expect(thread.conversation.status).toBe('open')
    expect(thread.messages.some((m: any) => m.body === 'intruso')).toBe(false)
  })
})
