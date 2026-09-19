import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'
import { classifyTwilioStatus, computeTwilioSignature, isWhatsAppConfigured, sendWhatsAppMessage, toWhatsAppAddress, verifyTwilioSignature } from '../../server/utils/whatsapp'
import { notifyAppointment } from '../../server/utils/appointments/notifications'

/**
 * WhatsApp por Twilio sin tocar Twilio: un fetch de mentira que guarda lo
 * que se le pidió, y la firma del webhook comprobada contra una calculada
 * de forma independiente con node:crypto.
 */
const ENV = { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_WHATSAPP_FROM: '+14155238886' }

function twilioOk(sid = 'SM123') {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (url: any, init: any) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({ sid, status: 'queued' }), { status: 201, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { fetchImpl, calls }
}

afterEach(() => vi.unstubAllGlobals())

describe('toWhatsAppAddress', () => {
  it('normaliza formatos humanos a whatsapp:+E.164', () => {
    expect(toWhatsAppAddress('+34 600 11 22 33')).toBe('whatsapp:+34600112233')
    expect(toWhatsAppAddress('0034-600112233')).toBe('whatsapp:+34600112233')
    expect(toWhatsAppAddress('whatsapp:+971501234567')).toBe('whatsapp:+971501234567')
  })

  it('un número sin prefijo internacional sólo pasa con un prefijo por defecto explícito', () => {
    expect(toWhatsAppAddress('600112233')).toBeNull()
    expect(toWhatsAppAddress('600112233', '+34')).toBe('whatsapp:+34600112233')
    expect(toWhatsAppAddress('abc')).toBeNull()
    expect(toWhatsAppAddress('+1')).toBeNull()
  })
})

describe('sendWhatsAppMessage', () => {
  it('sin credenciales no llama a nadie y lo dice', async () => {
    const { fetchImpl, calls } = twilioOk()
    const res = await sendWhatsAppMessage({}, { to: '+34600112233', body: 'Hola' }, fetchImpl)
    expect(res).toMatchObject({ ok: false, connected: false, sid: null })
    expect(res.message).toContain('no conectado')
    expect(calls).toHaveLength(0)
    expect(isWhatsAppConfigured({ TWILIO_ACCOUNT_SID: 'x' })).toBe(false)
    expect(isWhatsAppConfigured(ENV)).toBe(true)
  })

  it('manda la petición que Twilio espera: cuenta en la URL, auth básica, From/To/Body y el webhook de estado', async () => {
    const { fetchImpl, calls } = twilioOk('SMabc')
    const res = await sendWhatsAppMessage(ENV, { to: '+34 600 112 233', body: 'Recordatorio', statusCallbackUrl: 'https://x.example/api/twilio/status' }, fetchImpl)
    expect(res).toMatchObject({ ok: true, connected: true, sid: 'SMabc', status: 'queued' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe(`Basic ${btoa('ACtest:tok')}`)
    const form = new URLSearchParams(String(calls[0].init.body))
    expect(form.get('From')).toBe('whatsapp:+14155238886')
    expect(form.get('To')).toBe('whatsapp:+34600112233')
    expect(form.get('Body')).toBe('Recordatorio')
    expect(form.get('StatusCallback')).toBe('https://x.example/api/twilio/status')
  })

  it('con una plantilla aprobada (Content SID) manda la variable en vez del cuerpo', async () => {
    const { fetchImpl, calls } = twilioOk()
    await sendWhatsAppMessage({ ...ENV, TWILIO_WHATSAPP_CONTENT_SID: 'HXtemplate' }, { to: '+34600112233', body: 'Texto' }, fetchImpl)
    const form = new URLSearchParams(String(calls[0].init.body))
    expect(form.get('ContentSid')).toBe('HXtemplate')
    expect(JSON.parse(form.get('ContentVariables')!)).toEqual({ '1': 'Texto' })
    expect(form.get('Body')).toBeNull()
  })

  it('un rechazo de Twilio se devuelve con su motivo, sin fingir envío', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ message: 'Twilio could not find a Channel', code: 63007 }), { status: 400, headers: { 'content-type': 'application/json' } })) as typeof fetch
    const res = await sendWhatsAppMessage(ENV, { to: '+34600112233', body: 'x' }, fetchImpl)
    expect(res.ok).toBe(false)
    expect(res.connected).toBe(true)
    expect(res.message).toContain('63007')
  })

  it('un teléfono inválido no llega a Twilio', async () => {
    const { fetchImpl, calls } = twilioOk()
    const res = await sendWhatsAppMessage(ENV, { to: '600112233', body: 'x' }, fetchImpl)
    expect(res.ok).toBe(false)
    expect(res.message).toContain('prefijo internacional')
    expect(calls).toHaveLength(0)
  })
})

describe('firma del webhook de estado', () => {
  const url = 'https://sa.example/api/twilio/status'
  const params = { MessageSid: 'SM1', MessageStatus: 'delivered', AccountSid: 'ACtest' }

  it('coincide con el algoritmo documentado por Twilio (calculado aparte con node:crypto)', async () => {
    const expected = createHmac('sha1', 'tok').update(url + 'AccountSidACtestMessageSidSM1MessageStatusdelivered').digest('base64')
    expect(await computeTwilioSignature(url, params, 'tok')).toBe(expected)
    expect(await verifyTwilioSignature(url, params, 'tok', expected)).toBe(true)
  })

  it('rechaza firma ausente, alterada, con otro token o con otros parámetros', async () => {
    const good = await computeTwilioSignature(url, params, 'tok')
    expect(await verifyTwilioSignature(url, params, 'tok', null)).toBe(false)
    expect(await verifyTwilioSignature(url, params, 'tok', good.slice(0, -1) + 'A')).toBe(false)
    expect(await verifyTwilioSignature(url, params, 'otro', good)).toBe(false)
    expect(await verifyTwilioSignature(url, { ...params, MessageStatus: 'failed' }, 'tok', good)).toBe(false)
  })

  it('clasifica los estados de Twilio', () => {
    expect(classifyTwilioStatus('delivered')).toBe('delivered')
    expect(classifyTwilioStatus('read')).toBe('delivered')
    expect(classifyTwilioStatus('undelivered')).toBe('failed')
    expect(classifyTwilioStatus('failed')).toBe('failed')
    expect(classifyTwilioStatus('sent')).toBe('pending')
    expect(classifyTwilioStatus('queued')).toBe('pending')
  })
})

describe('notifyAppointment con WhatsApp', () => {
  it('sin Twilio, la fila de whatsapp queda no entregada con el motivo (como siempre)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'WaOff')
    await notifyAppointment(db, {}, { organizationId: a.orgId, visitId: a.visitId, type: 'confirmation', recipientPhone: '+34600112233', message: 'Hola', scheduledAt: '2026-02-01 10:00:00' })
    const rows = await db.select().from(schema.appointmentNotifications).where(eq(schema.appointmentNotifications.visitId, a.visitId))
    const wa = rows.find((r: any) => r.channel === 'whatsapp')
    expect(wa).toBeTruthy()
    expect(wa.delivered).toBe(0)
    expect(wa.errorMessage).toContain('no conectado')
    expect(wa.externalId).toBeNull()
  })

  it('con Twilio, la fila queda aceptada con el SID, que es lo que el webhook usa después', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ sid: 'SMreal', status: 'queued' }), { status: 201, headers: { 'content-type': 'application/json' } })),
    )
    const { db } = createTestDb()
    const a = await seedTenant(db, 'WaOn')
    await notifyAppointment(db, ENV, { organizationId: a.orgId, visitId: a.visitId, type: 'reminder_24h', recipientPhone: '+34600112233', message: 'Recordatorio', scheduledAt: '2026-02-01 10:00:00', publicOrigin: 'https://sa.example/' })
    const rows = await db.select().from(schema.appointmentNotifications).where(eq(schema.appointmentNotifications.visitId, a.visitId))
    const wa = rows.find((r: any) => r.channel === 'whatsapp')
    expect(wa.delivered).toBe(1)
    expect(wa.errorMessage).toBeNull()
    expect(wa.externalId).toBe('SMreal')
    const form = new URLSearchParams(String((globalThis.fetch as any).mock.calls[0][1].body))
    expect(form.get('StatusCallback')).toBe('https://sa.example/api/twilio/status')
  })
})
