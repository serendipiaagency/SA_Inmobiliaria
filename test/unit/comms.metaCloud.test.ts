import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  computeMetaSignature,
  metaCallAction,
  metaGetCallPermission,
  metaListTemplates,
  metaMessageBody,
  metaPhoneNumberIdsIn,
  metaSendMessage,
  parseMetaWebhook,
  verifyMetaSignature,
  verifyMetaWebhookToken,
} from '../../server/utils/comms/providers/metaCloud'
import type { LoadedChannel } from '../../server/utils/comms/types'

/**
 * Meta WhatsApp Cloud API sin tocar Meta: los cuerpos exactos de cada
 * petición, la firma comprobada contra node:crypto, y el parser de webhooks
 * sobre los payloads tal como los documenta Meta (docs/communications.md).
 */
const channel: LoadedChannel = {
  id: 1,
  organizationId: 1,
  provider: 'meta_cloud',
  label: 'Test',
  phoneE164: '+34900000000',
  externalPhoneId: '436666719526789',
  businessAccountId: '366634483210360',
  status: 'active',
  isDefault: true,
  callingStatus: 'enabled',
  callingCheckedAt: null,
  callingNote: null,
  lastError: null,
  createdAt: '',
  updatedAt: '',
  credentials: { provider: 'meta_cloud', accessToken: 'EAAG-test-token', appSecret: 'app-secret' },
}

function fakeFetch(responses: Array<{ status?: number; json: any }>) {
  const calls: { url: string; init: RequestInit }[] = []
  let i = 0
  const fetchImpl = (async (url: any, init: any) => {
    calls.push({ url: String(url), init: init || {} })
    const r = responses[Math.min(i++, responses.length - 1)]
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { fetchImpl, calls }
}

describe('cuerpos de POST /<PHONE_NUMBER_ID>/messages', () => {
  it('texto', () => {
    expect(metaMessageBody('+34600112233', { kind: 'text', body: 'Hola' })).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '34600112233',
      type: 'text',
      text: { preview_url: true, body: 'Hola' },
    })
  })
  it('imagen y documento por enlace', () => {
    expect(metaMessageBody('+34600112233', { kind: 'image', link: 'https://x/y.jpg', caption: 'Pie' })).toMatchObject({ type: 'image', image: { link: 'https://x/y.jpg', caption: 'Pie' } })
    expect(metaMessageBody('+34600112233', { kind: 'document', link: 'https://x/y.pdf', filename: 'dossier.pdf' })).toMatchObject({ type: 'document', document: { link: 'https://x/y.pdf', filename: 'dossier.pdf' } })
  })
  it('plantilla con parámetros de cuerpo', () => {
    expect(metaMessageBody('+34600112233', { kind: 'template', name: 'seguimiento', language: 'es', params: ['Ana', 'Piso Centro'] })).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '34600112233',
      type: 'template',
      template: { name: 'seguimiento', language: { code: 'es' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: 'Piso Centro' }] }] },
    })
  })
})

describe('metaSendMessage', () => {
  it('llama al endpoint del número con el token Bearer y devuelve el wamid', async () => {
    const { fetchImpl, calls } = fakeFetch([{ json: { messaging_product: 'whatsapp', contacts: [{ input: '34600112233', wa_id: '34600112233' }], messages: [{ id: 'wamid.HBgL' }] } }])
    const r = await metaSendMessage(channel, {}, '+34600112233', { kind: 'text', body: 'Hola' }, fetchImpl)
    expect(r).toEqual({ ok: true, externalId: 'wamid.HBgL', status: 'accepted', errorCode: null, error: null })
    expect(calls[0].url).toBe('https://graph.facebook.com/v23.0/436666719526789/messages')
    expect((calls[0].init.headers as any).authorization).toBe('Bearer EAAG-test-token')
    expect(JSON.parse(String(calls[0].init.body)).text.body).toBe('Hola')
  })
  it('un error de Meta llega con su código y no como éxito', async () => {
    const { fetchImpl } = fakeFetch([{ status: 400, json: { error: { message: 'Re-engagement message', code: 131047, error_data: { details: 'Message failed to send because more than 24 hours have passed' } } } }])
    const r = await metaSendMessage(channel, {}, '+34600112233', { kind: 'text', body: 'Hola' }, fetchImpl)
    expect(r.ok).toBe(false)
    expect(r.errorCode).toBe('131047')
    expect(r.error).toContain('24 hours')
  })
  it('respeta WHATSAPP_GRAPH_VERSION', async () => {
    const { fetchImpl, calls } = fakeFetch([{ json: { messages: [{ id: 'wamid.x' }] } }])
    await metaSendMessage(channel, { WHATSAPP_GRAPH_VERSION: 'v22.0' }, '+34600112233', { kind: 'text', body: 'Hola' }, fetchImpl)
    expect(calls[0].url).toContain('/v22.0/')
  })
})

describe('firma y handshake del webhook', () => {
  it('X-Hub-Signature-256 es sha256=HMAC-SHA256(app secret, cuerpo)', async () => {
    const body = '{"object":"whatsapp_business_account","entry":[]}'
    const expected = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`
    expect(await computeMetaSignature(body, 'app-secret')).toBe(expected)
    expect(await verifyMetaSignature(body, expected, 'app-secret')).toBe(true)
    expect(await verifyMetaSignature(body, expected, 'otro')).toBe(false)
    expect(await verifyMetaSignature(`${body} `, expected, 'app-secret')).toBe(false)
    expect(await verifyMetaSignature(body, null, 'app-secret')).toBe(false)
  })
  it('el GET de verificación devuelve el challenge sólo con el token correcto', () => {
    expect(verifyMetaWebhookToken({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '12345' }, ['otro', 'tok'])).toEqual({ ok: true, challenge: '12345' })
    expect(verifyMetaWebhookToken({ 'hub.mode': 'subscribe', 'hub.verify_token': 'mal', 'hub.challenge': '12345' }, ['tok']).ok).toBe(false)
    expect(verifyMetaWebhookToken({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'tok', 'hub.challenge': '1' }, ['tok']).ok).toBe(false)
  })
  it('extrae los phone_number_id sin fiarse del resto', () => {
    const payload = { entry: [{ changes: [{ value: { metadata: { phone_number_id: '111' } } }, { value: { metadata: { phone_number_id: '222' } } }, { value: {} }] }] }
    expect(metaPhoneNumberIdsIn(payload)).toEqual(['111', '222'])
  })
})

const metadata = { display_phone_number: '34900000000', phone_number_id: '436666719526789' }
const wrap = (value: Record<string, any>, field = 'messages') => ({ object: 'whatsapp_business_account', entry: [{ id: '366634483210360', changes: [{ field, value: { messaging_product: 'whatsapp', metadata, ...value } }] }] })

describe('parseMetaWebhook', () => {
  it('un mensaje de texto entrante, con el nombre de perfil', () => {
    const [group] = parseMetaWebhook(
      wrap({
        contacts: [{ profile: { name: 'Ana' }, wa_id: '34600112233' }],
        messages: [{ from: '34600112233', id: 'wamid.msg1', timestamp: '1700000000', type: 'text', text: { body: 'Hola, me interesa el piso' } }],
      }),
    )
    expect(group.externalPhoneId).toBe('436666719526789')
    expect(group.events).toHaveLength(1)
    expect(group.events[0]).toMatchObject({ kind: 'message', externalId: 'wamid.msg1', from: '+34600112233', profileName: 'Ana', type: 'text', text: 'Hola, me interesa el piso', timestamp: '2023-11-14T22:13:20.000Z' })
  })
  it('imagen, documento, ubicación y respuesta de botón', () => {
    const [group] = parseMetaWebhook(
      wrap({
        messages: [
          { from: '34600112233', id: 'wamid.img', timestamp: '1700000000', type: 'image', image: { id: 'MEDIA1', mime_type: 'image/jpeg', sha256: 'abc', caption: 'Mira' } },
          { from: '34600112233', id: 'wamid.doc', timestamp: '1700000000', type: 'document', document: { id: 'MEDIA2', mime_type: 'application/pdf', filename: 'nomina.pdf' } },
          { from: '34600112233', id: 'wamid.loc', timestamp: '1700000000', type: 'location', location: { latitude: 36.51, longitude: -4.88, name: 'Marbella' } },
          { from: '34600112233', id: 'wamid.btn', timestamp: '1700000000', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'yes', title: 'Sí, me interesa' } } },
          { from: '34600112233', id: 'wamid.unk', timestamp: '1700000000', type: 'ephemeral' },
        ],
      }),
    )
    const [img, doc, loc, btn, unk] = group.events as any[]
    expect(img).toMatchObject({ type: 'image', text: 'Mira', media: { providerMediaId: 'MEDIA1', mime: 'image/jpeg', caption: 'Mira' } })
    expect(doc).toMatchObject({ type: 'document', media: { providerMediaId: 'MEDIA2', filename: 'nomina.pdf' } })
    expect(loc).toMatchObject({ type: 'location', location: { latitude: 36.51, longitude: -4.88, name: 'Marbella' } })
    expect(btn).toMatchObject({ type: 'interactive', text: 'Sí, me interesa', interactive: { type: 'button_reply', id: 'yes' } })
    expect(unk.type).toBe('unsupported')
  })
  it('estados de entrega, con el error cuando falla', () => {
    const [group] = parseMetaWebhook(
      wrap({
        statuses: [
          { id: 'wamid.out1', status: 'delivered', timestamp: '1700000001', recipient_id: '34600112233', conversation: { id: 'c' }, pricing: {} },
          { id: 'wamid.out2', status: 'failed', timestamp: '1700000002', recipient_id: '34600112233', errors: [{ code: 131047, title: 'Re-engagement message', message: 'Re-engagement message', error_data: { details: 'more than 24 hours' } }] },
          { id: 'wamid.out3', status: 'weird', timestamp: '1700000003' },
        ],
      }),
    )
    expect(group.events).toHaveLength(2)
    expect(group.events[0]).toMatchObject({ kind: 'status', externalId: 'wamid.out1', status: 'delivered', recipient: '+34600112233' })
    expect(group.events[1]).toMatchObject({ kind: 'status', externalId: 'wamid.out2', status: 'failed', errorCode: '131047' })
    expect((group.events[1] as any).errorMessage).toContain('24 hours')
  })
  it('respuesta al permiso de llamada', () => {
    const [group] = parseMetaWebhook(
      wrap({
        messages: [{ from: '34600112233', id: 'wamid.perm', timestamp: '1700000000', type: 'interactive', interactive: { type: 'call_permission_reply', call_permission_reply: { response: 'accept', is_permanent: false, expiration_timestamp: '1700604800', response_source: 'user_action' } } }],
      }),
    )
    expect(group.events[0]).toMatchObject({ kind: 'call_permission', from: '+34600112233', response: 'accept', isPermanent: false, expiresAt: '2023-11-21T22:13:20.000Z' })
  })
  it('llamadas: connect entrante con oferta SDP, estado y terminate', () => {
    const [group] = parseMetaWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '366634483210360',
          changes: [
            {
              field: 'calls',
              value: {
                messaging_product: 'whatsapp',
                metadata,
                contacts: [{ profile: { name: 'Ana' }, wa_id: '34600112233' }],
                calls: [{ id: 'wacid.ABC', to: '34900000000', from: '34600112233', event: 'connect', timestamp: '1700000000', direction: 'USER_INITIATED', session: { sdp_type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111' } }],
              },
            },
            { field: 'calls', value: { messaging_product: 'whatsapp', metadata, statuses: [{ id: 'wacid.ABC', status: 'ACCEPTED', timestamp: '1700000010' }] } },
            { field: 'calls', value: { messaging_product: 'whatsapp', metadata, calls: [{ id: 'wacid.ABC', to: '34900000000', from: '34600112233', event: 'terminate', direction: 'USER_INITIATED', timestamp: '1700000500', status: 'Completed', start_time: '1700000010', end_time: '1700000490', duration: 480 }] } },
          ],
        },
      ],
    })
    const [connect, status, terminate] = group.events as any[]
    expect(connect).toMatchObject({ kind: 'call', event: 'connect', externalId: 'wacid.ABC', direction: 'inbound', from: '+34600112233', session: { sdpType: 'offer' } })
    expect(status).toMatchObject({ kind: 'call', event: 'status', externalId: 'wacid.ABC', status: 'ACCEPTED' })
    expect(terminate).toMatchObject({ kind: 'call', event: 'terminate', status: 'COMPLETED', durationSeconds: 480, startTime: '2023-11-14T22:13:30.000Z' })
  })
  it('ignora lo que no es de una cuenta de WhatsApp Business o no trae phone_number_id', () => {
    expect(parseMetaWebhook({ object: 'page', entry: [] })).toEqual([])
    expect(parseMetaWebhook({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ id: 'x', from: '1', type: 'text', text: { body: 'a' } }] } }] }] })).toEqual([])
  })
})

describe('llamadas y permisos', () => {
  it('connect envía la oferta y devuelve el wacid; terminate sólo el call_id', async () => {
    const { fetchImpl, calls } = fakeFetch([{ json: { messaging_product: 'whatsapp', calls: [{ id: 'wacid.NEW' }] } }, { json: { messaging_product: 'whatsapp', success: true } }])
    const r = await metaCallAction(channel, {}, { action: 'connect', toE164: '+34600112233', sdp: 'v=0', bizOpaqueCallbackData: '7' }, fetchImpl)
    expect(r).toEqual({ ok: true, callId: 'wacid.NEW', error: null, errorCode: null })
    expect(calls[0].url).toBe('https://graph.facebook.com/v23.0/436666719526789/calls')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ messaging_product: 'whatsapp', to: '34600112233', action: 'connect', session: { sdp_type: 'offer', sdp: 'v=0' }, biz_opaque_callback_data: '7' })
    await metaCallAction(channel, {}, { action: 'terminate', callId: 'wacid.NEW' }, fetchImpl)
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ messaging_product: 'whatsapp', call_id: 'wacid.NEW', action: 'terminate' })
  })
  it('el error 138006 (sin permiso) se distingue', async () => {
    const { fetchImpl } = fakeFetch([{ status: 400, json: { error: { message: 'No call permission', code: 138006 } } }])
    const r = await metaCallAction(channel, {}, { action: 'connect', toE164: '+34600112233', sdp: 'v=0' }, fetchImpl)
    expect(r.ok).toBe(false)
    expect(r.errorCode).toBe('138006')
  })
  it('consulta el permiso de llamada por wa_id', async () => {
    const { fetchImpl, calls } = fakeFetch([{ json: { messaging_product: 'whatsapp', permission: { status: 'temporary', expiration_time: 1745343479 }, actions: [{ action_name: 'send_call_permission_request', can_perform_action: false, limits: [] }] } }])
    const r = await metaGetCallPermission(channel, {}, '+34600112233', fetchImpl)
    expect(calls[0].url).toBe('https://graph.facebook.com/v23.0/436666719526789/call_permissions?user_wa_id=34600112233')
    expect(r).toMatchObject({ ok: true, status: 'temporary', expiresAt: '2025-04-22T17:37:59.000Z', canRequest: false })
  })
})

describe('plantillas', () => {
  it('lista todas las páginas de /<WABA_ID>/message_templates y extrae el cuerpo', async () => {
    const { fetchImpl, calls } = fakeFetch([
      { json: { data: [{ id: '1', name: 'seguimiento', status: 'APPROVED', category: 'UTILITY', language: 'es', components: [{ type: 'BODY', text: 'Hola {{1}}' }] }], paging: { cursors: { after: 'CURSOR' }, next: 'https://graph.facebook.com/next' } } },
      { json: { data: [{ id: '2', name: 'sin_cuerpo', status: 'PENDING', language: 'es', components: [{ type: 'HEADER', format: 'IMAGE' }] }], paging: { cursors: {} } } },
    ])
    const r = await metaListTemplates(channel, {}, fetchImpl)
    expect(r.ok).toBe(true)
    expect(r.templates).toEqual([
      { externalId: '1', name: 'seguimiento', language: 'es', status: 'APPROVED', category: 'UTILITY', body: 'Hola {{1}}' },
      { externalId: '2', name: 'sin_cuerpo', language: 'es', status: 'PENDING', category: null, body: '' },
    ])
    expect(calls[1].url).toContain('after=CURSOR')
  })
  it('sin WABA no se puede listar y lo dice', async () => {
    const r = await metaListTemplates({ ...channel, businessAccountId: null }, {}, fakeFetch([{ json: {} }]).fetchImpl)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('WABA')
  })
})
