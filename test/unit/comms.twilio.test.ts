import { describe, expect, it } from 'vitest'
import { parseTwilioInbound, parseTwilioStatus, twilioMessageForm, twilioSendMessage } from '../../server/utils/comms/providers/twilio'
import type { LoadedChannel } from '../../server/utils/comms/types'

const channel: LoadedChannel = {
  id: 2,
  organizationId: 1,
  provider: 'twilio',
  label: 'Twilio',
  phoneE164: '+14155238886',
  externalPhoneId: 'whatsapp:+14155238886',
  businessAccountId: null,
  status: 'active',
  isDefault: true,
  callingStatus: 'unavailable',
  callingCheckedAt: null,
  callingNote: null,
  lastError: null,
  createdAt: '',
  updatedAt: '',
  credentials: { provider: 'twilio', accountSid: 'ACtest', authToken: 'tok' },
}

describe('twilioMessageForm', () => {
  it('texto, medio y plantilla (Content SID + variables)', () => {
    const text = twilioMessageForm(channel, '+34600112233', { kind: 'text', body: 'Hola' }, 'https://x/api/comms/webhooks/twilio/status')
    expect(Object.fromEntries(text)).toEqual({ From: 'whatsapp:+14155238886', To: 'whatsapp:+34600112233', Body: 'Hola', StatusCallback: 'https://x/api/comms/webhooks/twilio/status' })
    const media = twilioMessageForm(channel, '+34600112233', { kind: 'image', link: 'https://x/y.jpg', caption: 'Pie' })
    expect(media.get('MediaUrl')).toBe('https://x/y.jpg')
    expect(media.get('Body')).toBe('Pie')
    const tpl = twilioMessageForm(channel, '+34600112233', { kind: 'template', name: 'seguimiento', language: 'es', params: ['Ana', 'Piso'], contentSid: 'HX1234' })
    expect(tpl.get('ContentSid')).toBe('HX1234')
    expect(JSON.parse(tpl.get('ContentVariables')!)).toEqual({ '1': 'Ana', '2': 'Piso' })
    expect(() => twilioMessageForm(channel, '+34600112233', { kind: 'template', name: 'x', language: 'es', params: [] })).toThrow(/Content SID/)
  })
})

describe('twilioSendMessage', () => {
  it('usa autenticación básica y devuelve el SID', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: any, init: any) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify({ sid: 'SM123', status: 'queued' }), { status: 201 })
    }) as typeof fetch
    const r = await twilioSendMessage(channel, '+34600112233', { kind: 'text', body: 'Hola' }, null, fetchImpl)
    expect(r).toEqual({ ok: true, externalId: 'SM123', status: 'queued', errorCode: null, error: null })
    expect(calls[0].url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json')
    expect((calls[0].init.headers as any).authorization).toBe(`Basic ${btoa('ACtest:tok')}`)
  })
  it('un rechazo de Twilio llega con su código', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ message: 'Outside the allowed window', code: 63016 }), { status: 400 })) as typeof fetch
    const r = await twilioSendMessage(channel, '+34600112233', { kind: 'text', body: 'Hola' }, null, fetchImpl)
    expect(r.ok).toBe(false)
    expect(r.errorCode).toBe('63016')
  })
})

describe('parseTwilioInbound', () => {
  const base = { MessageSid: 'SMin1', AccountSid: 'ACtest', From: 'whatsapp:+34600112233', To: 'whatsapp:+14155238886', ProfileName: 'Ana', WaId: '34600112233', NumMedia: '0', Body: 'Hola' }
  it('texto', () => {
    const r = parseTwilioInbound(base)!
    expect(r.externalPhoneId).toBe('whatsapp:+14155238886')
    expect(r.events[0]).toMatchObject({ kind: 'message', externalId: 'SMin1', from: '+34600112233', profileName: 'Ana', type: 'text', text: 'Hola' })
  })
  it('medio adjunto, ubicación y botón', () => {
    const media = parseTwilioInbound({ ...base, MessageSid: 'SMin2', NumMedia: '1', MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/AC/Messages/SM/Media/ME', MediaContentType0: 'image/jpeg', Body: '' })!.events[0] as any
    expect(media).toMatchObject({ type: 'image', media: { url: 'https://api.twilio.com/2010-04-01/Accounts/AC/Messages/SM/Media/ME', mime: 'image/jpeg' } })
    const loc = parseTwilioInbound({ ...base, MessageSid: 'SMin3', Body: '', Latitude: '36.5', Longitude: '-4.9', Label: 'Oficina' })!.events[0] as any
    expect(loc).toMatchObject({ type: 'location', location: { latitude: 36.5, longitude: -4.9, name: 'Oficina' } })
    const btn = parseTwilioInbound({ ...base, MessageSid: 'SMin4', Body: 'Sí', ButtonText: 'Sí', ButtonPayload: 'yes' })!.events[0] as any
    expect(btn).toMatchObject({ type: 'button', interactive: { id: 'yes', title: 'Sí' } })
  })
  it('sin SID o sin teléfonos no hay evento', () => {
    expect(parseTwilioInbound({ From: 'whatsapp:+34600112233', To: 'x' })).toBeNull()
  })
})

describe('parseTwilioStatus', () => {
  it('delivered/read/failed se normalizan; queued/sent-intermedios se ignoran', () => {
    const delivered = parseTwilioStatus({ MessageSid: 'SM1', MessageStatus: 'delivered', From: 'whatsapp:+14155238886', To: 'whatsapp:+34600112233' })!
    expect(delivered.externalPhoneId).toBe('whatsapp:+14155238886')
    expect(delivered.events[0]).toMatchObject({ kind: 'status', externalId: 'SM1', status: 'delivered', recipient: '+34600112233' })
    const failed = parseTwilioStatus({ MessageSid: 'SM2', MessageStatus: 'undelivered', From: 'whatsapp:+14155238886', ErrorCode: '63016' })!
    expect(failed.events[0]).toMatchObject({ status: 'failed', errorCode: '63016' })
    expect(parseTwilioStatus({ MessageSid: 'SM3', MessageStatus: 'queued', From: 'whatsapp:+14155238886' })!.events).toEqual([])
  })
})
