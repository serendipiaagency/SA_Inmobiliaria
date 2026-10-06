import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import PostalMime from 'postal-mime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 29 — email entrante, sobre una SQLite real con las migraciones reales:
 *
 *   - dirección de respuesta firmada (manipulación, otra agencia, hilo inexistente);
 *   - MIME real con postal-mime: texto, HTML, quoted-printable, base64, charset
 *     y la cita del mensaje anterior;
 *   - entrada al hilo y sus efectos (no leído, último contacto del lead,
 *     Activity, Lead Score), idempotencia, respuestas automáticas y freno;
 *   - rechazo genérico de todo lo que no es una dirección válida;
 *   - sin configuración, el Reply-To de la agencia queda intacto;
 *   - el secreto no aparece en ninguna salida.
 *
 * Ningún envío real: Resend es un `fetch` simulado.
 */

const holder = vi.hoisted(() => ({ db: null as any }))
// El plugin abre la D1 con drizzle-orm/d1; en la prueba, la SQLite real.
vi.mock('drizzle-orm/d1', async (importOriginal) => ({ ...(await importOriginal<any>()), drizzle: () => holder.db }))
vi.mock('../../server/utils/audit', () => ({ logAdminAction: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const SECRET = 'S3cr3t-inbound-0123456789abcdefghijklmnopqrstuvwxyz'
const DOMAIN = 'respuestas.inmo.test'
const ENV = { INBOUND_EMAIL_DOMAIN: DOMAIN, INBOUND_EMAIL_SECRET: SECRET }
const ts = '2026-01-01 00:00:00'
let seq = 0

async function address() {
  return import('../../server/utils/comms/inboundAddress')
}
async function inbound() {
  return import('../../server/utils/comms/inboundEmail')
}

/** Lo que entrega Cloudflare: sobre (from/to), cuerpo crudo como stream, cabeceras y setReject. */
function fakeMessage(raw: string | Uint8Array, to: string, opts: { from?: string; headers?: Record<string, string>; rawSize?: number; stream?: ReadableStream<Uint8Array> } = {}) {
  const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw
  const text = typeof raw === 'string' ? raw : ''
  const headerBlock = text.split(/\r?\n\r?\n/)[0] || ''
  const headers = new Headers()
  for (const line of headerBlock.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim())
  }
  for (const [k, v] of Object.entries(opts.headers || {})) headers.set(k, v)
  const rejects: string[] = []
  return {
    from: opts.from ?? 'pablo@cliente.test',
    to,
    raw: opts.stream ?? (new Response(bytes as BodyInit).body as ReadableStream<Uint8Array>),
    rawSize: opts.rawSize ?? bytes.byteLength,
    headers,
    setReject: (reason: string) => {
      rejects.push(reason)
    },
    rejects,
  }
}

function mail(headers: Record<string, string>, body: string): string {
  const base: Record<string, string> = { From: 'Pablo Cliente <pablo@cliente.test>', Subject: '=?UTF-8?Q?Re:_Informaci=C3=B3n?=', 'Message-ID': `<m${++seq}@cliente.test>`, 'MIME-Version': '1.0', ...headers }
  return `${Object.entries(base)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n')}\r\n\r\n${body.replace(/\r?\n/g, '\r\n')}`
}

async function webThread(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [contact] = await db.insert(schema.contacts).values({ organizationId: orgId, name: `Pablo ${seq}`, email: `pablo${seq}@cliente.test`, createdAt: ts, updatedAt: ts }).returning()
  const [lead] = await db
    .insert(schema.leads)
    .values({ organizationId: orgId, name: `Pablo ${seq}`, email: `pablo${seq}@cliente.test`, source: 'web', status: 'new', stage: 'new', score: 0, contactId: contact.id, createdAt: ts, updatedAt: ts })
    .returning()
  const [thread] = await db
    .insert(schema.commsWebThreads)
    .values({ organizationId: orgId, kind: 'form', status: 'closed', contactId: contact.id, leadId: lead.id, visitorName: 'Pablo', visitorEmail: `pablo${seq}@cliente.test`, lastMessageAt: ts, lastMessagePreview: 'Info', unreadCount: 0, createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return { contact, lead, thread }
}

// ---------------------------------------------------------------------------
describe('FASE 29 — dirección de respuesta firmada', () => {
  it('sin dominio o sin secreto (o con uno corto) no está activo, no hay dirección y el panel dice qué falta sin enseñar valores', async () => {
    const { inboundEmailStatus, threadReplyAddress, verifyReplyAddress } = await address()
    const none = inboundEmailStatus({})
    expect(none).toMatchObject({ active: false, domain: null, routingAddress: null })
    expect(none.missing.join(' ')).toContain('INBOUND_EMAIL_DOMAIN')
    expect(none.missing.join(' ')).toContain('INBOUND_EMAIL_SECRET')
    expect(await threadReplyAddress({}, 1, 2)).toBeNull()
    expect(await threadReplyAddress({ INBOUND_EMAIL_DOMAIN: DOMAIN }, 1, 2)).toBeNull()

    const short = inboundEmailStatus({ INBOUND_EMAIL_DOMAIN: DOMAIN, INBOUND_EMAIL_SECRET: 'corto-y-secreto' })
    expect(short.active).toBe(false)
    expect(short.missing.join(' ')).toContain('demasiado corto')
    expect(JSON.stringify(short)).not.toContain('corto-y-secreto')
    expect(await threadReplyAddress({ INBOUND_EMAIL_DOMAIN: DOMAIN, INBOUND_EMAIL_SECRET: 'corto-y-secreto' }, 1, 2)).toBeNull()

    const badDomain = inboundEmailStatus({ INBOUND_EMAIL_DOMAIN: 'https://respuestas.inmo.test/', INBOUND_EMAIL_SECRET: SECRET })
    expect(badDomain.active).toBe(false)
    expect(badDomain.missing.join(' ')).toContain('no es un nombre de dominio válido')

    const ok = inboundEmailStatus(ENV)
    expect(ok).toEqual({ active: true, domain: DOMAIN, routingAddress: `respuestas@${DOMAIN}`, missing: [] })
    expect(JSON.stringify(ok)).not.toContain(SECRET)
    // Sin configuración, ninguna dirección se verifica (ni siquiera una bien formada).
    const signed = await threadReplyAddress(ENV, 1, 2)
    expect(await verifyReplyAddress({}, signed)).toBeNull()
  })

  it('firma y verifica; cualquier manipulación (firma, hilo, agencia, dominio, secreto) deja de valer', async () => {
    const { threadReplyAddress, verifyReplyAddress } = await address()
    const signed = (await threadReplyAddress(ENV, 7, 42))!
    expect(signed).toMatch(new RegExp(`^respuestas\\+7-42-[0-9a-f]{20}@${DOMAIN.replace(/\./g, '\\.')}$`))
    expect(signed).not.toContain(SECRET)
    expect(await verifyReplyAddress(ENV, signed)).toEqual({ orgId: 7, threadId: 42 })
    // Las direcciones de email no distinguen mayúsculas de forma fiable; con ángulos, también.
    expect(await verifyReplyAddress(ENV, `<${signed.toUpperCase()}>`)).toEqual({ orgId: 7, threadId: 42 })

    const sig = signed.split('-')[2]!.split('@')[0]!
    const flipped = sig.replace(/^./, (c) => (c === '0' ? '1' : '0'))
    expect(await verifyReplyAddress(ENV, signed.replace(sig, flipped))).toBeNull()
    expect(await verifyReplyAddress(ENV, signed.replace('+7-42-', '+7-43-'))).toBeNull() // otro hilo con la misma firma
    expect(await verifyReplyAddress(ENV, signed.replace('+7-42-', '+8-42-'))).toBeNull() // otra agencia con la misma firma
    expect(await verifyReplyAddress(ENV, signed.replace(DOMAIN, 'otro.test'))).toBeNull()
    expect(await verifyReplyAddress({ ...ENV, INBOUND_EMAIL_SECRET: `${SECRET}-rotado` }, signed)).toBeNull()
    expect(await verifyReplyAddress(ENV, signed.replace(`-${sig}`, `-${sig.slice(0, 19)}`))).toBeNull()
    for (const junk of ['', 'respuestas@respuestas.inmo.test', `r-7-42-${sig}@${DOMAIN}`, `respuestas+0-42-${sig}@${DOMAIN}`, null, 42]) {
      expect(await verifyReplyAddress(ENV, junk)).toBeNull()
    }
    // La firma depende de los dos ids: la de otro hilo es otra.
    expect(await threadReplyAddress(ENV, 7, 43)).not.toBe(signed)
  })
})

// ---------------------------------------------------------------------------
describe('FASE 29 — MIME real (postal-mime) y la cita del mensaje anterior', () => {
  it('quoted-printable UTF-8 con asunto codificado: sin la línea «… escribió:» ni las líneas citadas', async () => {
    const { extractReply } = await inbound()
    const raw = mail(
      { Subject: '=?UTF-8?Q?Re:_Informaci=C3=B3n_del_=C3=A1tico?=', 'Content-Type': 'text/plain; charset=UTF-8', 'Content-Transfer-Encoding': 'quoted-printable' },
      ['S=C3=AD, me interesa el =C3=A1tico. =C2=BFPodemos verlo el s=C3=A1bado?', '', 'Pablo', '', 'El lun, 6 oct 2026 a las 10:00, Agencia A <respuestas+1-2-abc@respuestas.inm=', 'o.test> escribi=C3=B3:', '> Te paso la ficha.', '> Un saludo'].join('\n'),
    )
    const r = extractReply(await PostalMime.parse(raw))
    expect(r.body).toBe('Sí, me interesa el ático. ¿Podemos verlo el sábado?\n\nPablo')
    expect(r.fields).toMatchObject({ subject: 'Re: Información del ático', from: 'Pablo Cliente <pablo@cliente.test>' })
    expect(r.attachments).toBe(0)
  })

  it('base64 en ISO-8859-1, y la atribución de Gmail partida en dos líneas', async () => {
    const { extractReply } = await inbound()
    const latin1 = Buffer.from('Buenos días, ¿cuánto es la comunidad?\nGracias\n\nEl mar, 7 oct 2026 a las 9:15, Agencia Costa Azul\n<respuestas+1-2-abc@respuestas.inmo.test> escribió:\n> Hola Pablo', 'latin1').toString('base64')
    const raw = mail({ 'Content-Type': 'text/plain; charset=ISO-8859-1', 'Content-Transfer-Encoding': 'base64' }, latin1.replace(/(.{76})/g, '$1\n'))
    const r = extractReply(await PostalMime.parse(raw))
    expect(r.body).toBe('Buenos días, ¿cuánto es la comunidad?\nGracias')
  })

  it('sólo HTML: sin la cita de Gmail, con entidades con nombre y numéricas y los saltos de línea de los bloques', async () => {
    const { extractReply } = await inbound()
    const html =
      '<html><head><style>p{color:red}</style></head><body><div dir="ltr">Perfecto, el s&aacute;bado a las 11 me va bien.<br>Gracias, Mu&#241;oz &amp; familia</div><br>' +
      '<div class="gmail_quote"><div dir="ltr" class="gmail_attr">El lun, 6 oct 2026, Agencia escribió:<br></div><blockquote class="gmail_quote">Te paso la ficha</blockquote></div></body></html>'
    const r = extractReply(await PostalMime.parse(mail({ 'Content-Type': 'text/html; charset=UTF-8' }, html)))
    expect(r.body).toBe('Perfecto, el sábado a las 11 me va bien.\nGracias, Muñoz & familia')
    expect(r.body).not.toContain('Te paso la ficha')
  })

  it('multipart: prefiere el texto plano; los adjuntos no se guardan pero se listan, con los ejecutables marcados', async () => {
    const { extractReply } = await inbound()
    const raw = mail(
      { 'Content-Type': 'multipart/mixed; boundary="b1"' },
      [
        '--b1',
        'Content-Type: multipart/alternative; boundary="b2"',
        '',
        '--b2',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        'Os adjunto la nómina.',
        '--b2',
        'Content-Type: text/html; charset=UTF-8',
        '',
        '<p>HTML que no se usa</p>',
        '--b2--',
        '--b1',
        'Content-Type: application/pdf; name="nomina.pdf"',
        'Content-Disposition: attachment; filename="nomina.pdf"',
        'Content-Transfer-Encoding: base64',
        '',
        'JVBERi0xLjQK',
        '--b1',
        'Content-Type: application/octet-stream; name="factura.exe"',
        'Content-Disposition: attachment; filename="factura.exe"',
        'Content-Transfer-Encoding: base64',
        '',
        'TVqQAAMAAAAEAAAA',
        '--b1--',
      ].join('\n'),
    )
    const r = extractReply(await PostalMime.parse(raw))
    expect(r.body).toBe('Os adjunto la nómina.')
    expect(r.attachments).toBe(2)
    expect(r.fields.attachmentsIgnored).toContain('nomina.pdf (9 B)')
    expect(r.fields.attachmentsIgnored).toContain('factura.exe (12 B, ejecutable)')
    expect(r.fields.attachmentsIgnored).toContain('No se guardan')
  })

  it('Outlook («De: / Enviado:»), «Mensaje original», respuesta intercalada, sólo cita y texto demasiado largo', async () => {
    const { stripQuotedReply, extractReply, INBOUND_EMAIL_BODY_MAX } = await inbound()
    expect(stripQuotedReply('Me va bien el jueves.\n\n________________________________\nDe: Agencia A <respuestas+1-2-x@d.test>\nEnviado: lunes, 6 de octubre de 2026 10:00\nPara: Pablo\nAsunto: Ficha\n\nTe paso la ficha')).toBe('Me va bien el jueves.')
    expect(stripQuotedReply('De acuerdo: el jueves.\nDe: nadie importante, todo bien')).toBe('De acuerdo: el jueves.\nDe: nadie importante, todo bien')
    expect(stripQuotedReply('Vale.\n\n-----Mensaje original-----\nDe: Agencia\nTe paso la ficha')).toBe('Vale.')
    expect(stripQuotedReply('> ¿Te va bien el jueves?\nSí, a las 10.\n> ¿Con tu pareja?\nSí.')).toBe('> ¿Te va bien el jueves?\nSí, a las 10.\n> ¿Con tu pareja?\nSí.')
    // Si sólo hay cita, se ve la cita antes que perder el mensaje.
    expect(stripQuotedReply('> sólo cito\n> nada más')).toBe('> sólo cito\n> nada más')

    const long = extractReply(await PostalMime.parse(mail({ 'Content-Type': 'text/plain; charset=UTF-8' }, 'a'.repeat(INBOUND_EMAIL_BODY_MAX + 50))))
    expect(long.truncated).toBe(true)
    expect(long.body).toHaveLength(INBOUND_EMAIL_BODY_MAX)
    expect(long.fields.truncated).toContain('recortado')
  })
})

// ---------------------------------------------------------------------------
describe('FASE 29 — la respuesta entra en SU hilo, con sus efectos', () => {
  it('dirección válida: mensaje `in` por email, hilo reabierto y no leído, último contacto del lead, Activity y Lead Score; un reenvío no duplica', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'InboundA')
    const { handleInboundEmail } = await inbound()
    const { threadReplyAddress } = await address()
    const { contact, lead, thread } = await webThread(db, a.orgId)
    const to = (await threadReplyAddress(ENV, a.orgId, thread.id))!
    const raw = mail({ 'Message-ID': '<unico-1@cliente.test>', 'Content-Type': 'text/plain; charset=UTF-8' }, 'Sí, el sábado me va bien.\n\nEl lun, 6 oct 2026, Agencia escribió:\n> ¿Te va bien el sábado?')

    const msg = fakeMessage(raw, to)
    const out = await handleInboundEmail(db, ENV, msg)
    expect(out).toMatchObject({ status: 'stored', orgId: a.orgId, threadId: thread.id })
    expect(msg.rejects).toEqual([])

    const rows = await db.select().from(schema.commsWebMessages).where(eq(schema.commsWebMessages.threadId, thread.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ organizationId: a.orgId, direction: 'in', via: 'email', body: 'Sí, el sábado me va bien.', status: 'received' })
    expect(JSON.parse(rows[0].fieldsJson)).toMatchObject({ subject: 'Re: Información', from: 'Pablo Cliente <pablo@cliente.test>' })

    const [t] = await db.select().from(schema.commsWebThreads).where(eq(schema.commsWebThreads.id, thread.id))
    expect(t).toMatchObject({ status: 'open', unreadCount: 1, lastMessagePreview: 'Sí, el sábado me va bien.' })
    expect(t.lastInboundAt).toBe(rows[0].createdAt)

    const [l] = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id))
    expect(l.lastContactAt).toBe(rows[0].createdAt)
    // Quien escribe es el cliente: ni primer contacto ni primera respuesta humana de la agencia.
    expect(l.firstContactAt).toBeNull()
    expect(l.firstResponseAt).toBeNull()
    expect(l.scoreBreakdownJson).toContain('Respuesta por email')

    const acts = await db.select().from(schema.activities).where(and(eq(schema.activities.organizationId, a.orgId), eq(schema.activities.eventType, 'EMAIL_REPLY_RECEIVED')))
    expect(acts).toHaveLength(1)
    expect(acts[0]).toMatchObject({ entityType: 'comms_web_message', entityId: rows[0].id, contactId: contact.id, leadId: lead.id, actorType: 'contact' })
    expect(acts[0].metadataJson).not.toContain('sábado')

    const { collectLeadScoreSignals } = await import('../../server/utils/leads/score')
    expect(await collectLeadScoreSignals(db, a.orgId, { id: lead.id, contactId: contact.id })).toMatchObject({ lastInboundKind: 'email', lastInboundAt: rows[0].createdAt })

    const [ev] = await db.select().from(schema.commsWebhookEvents).where(eq(schema.commsWebhookEvents.provider, 'email_inbound'))
    expect(ev).toMatchObject({ organizationId: a.orgId, processedOk: 1 })
    expect(ev.payloadJson).not.toContain('sábado')
    expect(ev.payloadJson).not.toContain('pablo@cliente.test')

    // El mismo correo otra vez (mismo Message-ID): no entra dos veces.
    const again = await handleInboundEmail(db, ENV, fakeMessage(raw, to))
    expect(again).toMatchObject({ status: 'duplicate' })
    expect(await db.select().from(schema.commsWebMessages).where(eq(schema.commsWebMessages.threadId, thread.id))).toHaveLength(1)
  })

  it('una respuesta automática (fuera de la oficina) se acepta pero no entra en el hilo; un rebote tampoco', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'InboundAuto')
    const { handleInboundEmail } = await inbound()
    const { threadReplyAddress } = await address()
    const { thread } = await webThread(db, a.orgId)
    const to = (await threadReplyAddress(ENV, a.orgId, thread.id))!
    const ooo = fakeMessage(mail({ 'Auto-Submitted': 'auto-replied', 'Content-Type': 'text/plain' }, 'Estoy fuera hasta el lunes.'), to)
    expect(await handleInboundEmail(db, ENV, ooo)).toMatchObject({ status: 'ignored', reason: 'auto_reply' })
    expect(ooo.rejects).toEqual([])
    const bounce = fakeMessage(mail({ 'Content-Type': 'text/plain' }, 'Delivery failed'), to, { from: 'MAILER-DAEMON@mx.cliente.test' })
    expect(await handleInboundEmail(db, ENV, bounce)).toMatchObject({ status: 'ignored' })
    expect(await db.select().from(schema.commsWebMessages).where(eq(schema.commsWebMessages.threadId, thread.id))).toHaveLength(0)
    const [t] = await db.select().from(schema.commsWebThreads).where(eq(schema.commsWebThreads.id, thread.id))
    expect(t.unreadCount).toBe(0)
  })

  it('freno: más de N respuestas por hilo en una hora se rechazan', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'InboundRate')
    const { handleInboundEmail, INBOUND_EMAILS_PER_THREAD_PER_HOUR, INBOUND_REJECT_REASONS } = await inbound()
    const { threadReplyAddress } = await address()
    const { thread } = await webThread(db, a.orgId)
    const { now } = await import('../../server/utils/db')
    for (let i = 0; i < INBOUND_EMAILS_PER_THREAD_PER_HOUR; i++) {
      await db.insert(schema.commsWebMessages).values({ organizationId: a.orgId, threadId: thread.id, direction: 'in', via: 'email', body: `m${i}`, status: 'received', createdAt: now() })
    }
    const msg = fakeMessage(mail({ 'Content-Type': 'text/plain' }, 'Uno más'), (await threadReplyAddress(ENV, a.orgId, thread.id))!)
    expect(await handleInboundEmail(db, ENV, msg)).toEqual({ status: 'rejected', reason: 'rate_limited' })
    expect(msg.rejects).toEqual([INBOUND_REJECT_REASONS.rate_limited])
  })
})

// ---------------------------------------------------------------------------
describe('FASE 29 — rechazo genérico, sin filtrar información', () => {
  it('firma mala, hilo de otra agencia, hilo inexistente o sin configurar: la misma razón y nada guardado', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'RejectA')
    const b = await seedTenant(db, 'RejectB')
    const { handleInboundEmail, INBOUND_REJECT_REASONS } = await inbound()
    const { threadReplyAddress } = await address()
    const { thread: threadA } = await webThread(db, a.orgId)
    const { thread: threadB } = await webThread(db, b.orgId)
    const body = mail({ 'Content-Type': 'text/plain' }, 'Intento colarme')
    const good = (await threadReplyAddress(ENV, a.orgId, threadA.id))!

    const cases = [
      // firma manipulada
      good.replace(/-([0-9a-f])([0-9a-f]{19})@/, (_m, c, rest) => `-${c === 'a' ? 'b' : 'a'}${rest}@`),
      // firmada de verdad, pero el hilo es de la agencia B: no es «el hilo X de A»
      (await threadReplyAddress(ENV, a.orgId, threadB.id))!,
      // hilo que no existe (o ya no existe)
      (await threadReplyAddress(ENV, a.orgId, 999_999))!,
      // ni siquiera es una dirección de respuestas
      `alguien@${DOMAIN}`,
    ]
    const reasons = new Set<string>()
    for (const to of cases) {
      const msg = fakeMessage(body, to)
      expect(await handleInboundEmail(db, ENV, msg)).toEqual({ status: 'rejected', reason: 'address' })
      expect(msg.rejects).toHaveLength(1)
      reasons.add(msg.rejects[0]!)
    }
    // Sin configuración, una dirección que fue válida tampoco.
    const off = fakeMessage(body, good)
    expect(await handleInboundEmail(db, {}, off)).toEqual({ status: 'rejected', reason: 'address' })
    reasons.add(off.rejects[0]!)
    expect([...reasons]).toEqual([INBOUND_REJECT_REASONS.address])
    // La razón no dice nada del hilo, la agencia ni la firma, y va en ASCII (respuesta SMTP).
    expect(INBOUND_REJECT_REASONS.address).not.toMatch(/hilo|agencia|firma|\d/i)
    for (const reason of Object.values(INBOUND_REJECT_REASONS)) expect(reason).toMatch(/^[\x20-\x7e]+$/)

    expect(await db.select().from(schema.commsWebMessages)).toHaveLength(0)
    expect(await db.select().from(schema.commsWebhookEvents)).toHaveLength(0)
    const threads = await db.select().from(schema.commsWebThreads)
    expect(threads.every((t: any) => t.unreadCount === 0)).toBe(true)
  })

  it('con dirección válida: demasiado grande o ilegible se dice, sin guardar nada', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'RejectSize')
    const { handleInboundEmail, INBOUND_EMAIL_MAX_BYTES } = await inbound()
    const { threadReplyAddress } = await address()
    const { thread } = await webThread(db, a.orgId)
    const to = (await threadReplyAddress(ENV, a.orgId, thread.id))!
    const big = fakeMessage(mail({}, 'x'), to, { rawSize: INBOUND_EMAIL_MAX_BYTES + 1 })
    expect(await handleInboundEmail(db, ENV, big)).toEqual({ status: 'rejected', reason: 'too_large' })
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('conexión cortada'))
      },
    })
    const unreadable = fakeMessage(mail({}, 'x'), to, { stream: broken })
    expect(await handleInboundEmail(db, ENV, unreadable)).toEqual({ status: 'rejected', reason: 'unreadable' })
    expect(await db.select().from(schema.commsWebMessages)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
describe('FASE 29 — el envío desde el hilo: Reply-To firmado sólo con configuración', () => {
  async function setup(db: any, name: string) {
    const a = await seedTenant(db, name)
    await db.update(schema.organizations).set({ emailReplyTo: 'oficina@agencia-a.test', companyName: 'Agencia A' }).where(eq(schema.organizations.id, a.orgId))
    const { thread } = await webThread(db, a.orgId, { status: 'open' })
    const { loadWebThreadForOrg } = await import('../../server/utils/comms/web')
    return { a, thread: await loadWebThreadForOrg(db, a.orgId, thread.id) }
  }
  function resendMock() {
    const bodies: any[] = []
    const fetchMock = vi.fn(async (_url: any, init: any) => {
      bodies.push(JSON.parse(String(init?.body || '{}')))
      return new Response(JSON.stringify({ id: `re_${bodies.length}` }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    return bodies
  }

  it('sin configuración: el Reply-To sigue siendo el de la agencia, igual que antes, y el panel lo dice', async () => {
    const { db } = createTestDb()
    const { a, thread } = await setup(db, 'SendPlain')
    const { replyToWebThread, webReplyOptions } = await import('../../server/utils/comms/web')
    const bodies = resendMock()
    const sent = await replyToWebThread(db, { RESEND_API_KEY: 're_test' }, { orgId: a.orgId, thread, userId: a.userId, via: 'email', body: 'Hola Pablo', origin: 'https://a.test', emailConnected: true })
    expect(sent.ok).toBe(true)
    expect(bodies[0]).toMatchObject({ reply_to: 'oficina@agencia-a.test', from: 'Agencia A <info@serendipiaagency.com>' })
    const [log] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.organizationId, a.orgId))
    expect(log.replyTo).toBe('oficina@agencia-a.test')
    expect(webReplyOptions(thread, { emailConnected: true, whatsappChannelActive: false, defaultCountryPrefix: null }).email.repliesToThread).toBe(false)
  })

  it('con configuración: el Reply-To es la dirección firmada del hilo (el remitente no cambia) y la respuesta a ella vuelve al mismo hilo', async () => {
    const { db } = createTestDb()
    const { a, thread } = await setup(db, 'SendSigned')
    const { replyToWebThread, webReplyOptions } = await import('../../server/utils/comms/web')
    const { handleInboundEmail } = await inbound()
    const bodies = resendMock()
    const env = { RESEND_API_KEY: 're_test', ...ENV }
    const sent = await replyToWebThread(db, env, { orgId: a.orgId, thread, userId: a.userId, via: 'email', body: 'Hola Pablo', origin: 'https://a.test', emailConnected: true })
    expect(sent.ok).toBe(true)
    const replyTo = bodies[0].reply_to as string
    expect(replyTo).toMatch(new RegExp(`^respuestas\\+${a.orgId}-${thread.id}-[0-9a-f]{20}@${DOMAIN.replace(/\./g, '\\.')}$`))
    expect(bodies[0].from).toBe('Agencia A <info@serendipiaagency.com>')
    expect(bodies[0].to).toBe(thread.visitorEmail)
    expect(webReplyOptions(thread, { emailConnected: true, whatsappChannelActive: false, defaultCountryPrefix: null, inboundEmailActive: true }).email.repliesToThread).toBe(true)

    // El cliente pulsa «Responder»: su correo va al Reply-To.
    const msg = fakeMessage(mail({ 'Content-Type': 'text/plain; charset=UTF-8' }, 'Gracias, lo miro.\n\nEl lun, 6 oct 2026, Agencia A escribió:\n> Hola Pablo'), replyTo)
    expect(await handleInboundEmail(db, env, msg)).toMatchObject({ status: 'stored', threadId: thread.id })
    const rows = await db.select().from(schema.commsWebMessages).where(eq(schema.commsWebMessages.threadId, thread.id)).orderBy(schema.commsWebMessages.id)
    expect(rows.map((r: any) => [r.direction, r.via, r.body])).toEqual([
      ['out', 'email', 'Hola Pablo'],
      ['in', 'email', 'Gracias, lo miro.'],
    ])
  })
})

// ---------------------------------------------------------------------------
describe('FASE 29 — el plugin de Nitro y el secreto', () => {
  it('Nitro llama al hook `cloudflare:email` desde el manejador `email` del Worker', () => {
    const handler = readFileSync(join(import.meta.dirname, '../../node_modules/nitropack/dist/presets/cloudflare/runtime/_module-handler.mjs'), 'utf8')
    expect(handler).toMatch(/email\(message, env, context\)/)
    expect(handler).toContain('"cloudflare:email"')
  })

  it('el plugin guarda la respuesta y su log no lleva direcciones, contenido ni el secreto; nada de lo que sale lo contiene', async () => {
    const { db } = createTestDb()
    holder.db = db
    const a = await seedTenant(db, 'PluginA')
    await db.update(schema.organizations).set({ emailReplyTo: 'oficina@plugin.test' }).where(eq(schema.organizations.id, a.orgId))
    const { thread } = await webThread(db, a.orgId)
    const { threadReplyAddress, inboundEmailStatus } = await address()
    const { replyToWebThread, loadWebThreadForOrg, webReplyOptions, webThreadMessages } = await import('../../server/utils/comms/web')

    const logs: string[] = []
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, level).mockImplementation((...args: any[]) => void logs.push(args.map(String).join(' ')))
    let hook: ((ctx: any) => Promise<void>) | null = null
    vi.stubGlobal('defineNitroPlugin', (fn: any) => fn)
    const plugin = (await import('../../server/plugins/inbound-email')).default as any
    plugin({ hooks: { hook: (name: string, fn: any) => (name === 'cloudflare:email' ? (hook = fn) : null) } })
    expect(hook).toBeTruthy()

    const env = { DB: {}, RESEND_API_KEY: 're_test', ...ENV }
    const bodies: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: any, init: any) => {
        bodies.push(String(init?.body))
        return new Response(JSON.stringify({ id: 're_x' }), { status: 200 })
      }),
    )
    const loaded = await loadWebThreadForOrg(db, a.orgId, thread.id)
    await replyToWebThread(db, env, { orgId: a.orgId, thread: loaded, userId: a.userId, via: 'email', body: 'Hola', origin: 'https://a.test', emailConnected: true })

    const to = (await threadReplyAddress(env, a.orgId, thread.id))!
    const good = fakeMessage(mail({ 'Content-Type': 'text/plain' }, 'Texto privadísimo del cliente'), to)
    await hook!({ message: good, env })
    const bad = fakeMessage(mail({ 'Content-Type': 'text/plain' }, 'Otro texto privado'), to.replace(/-[0-9a-f]{20}@/, '-0000000000000000000a@'))
    await hook!({ message: bad, env })
    const noDb = fakeMessage(mail({}, 'x'), to)
    await hook!({ message: noDb, env: { ...ENV } })

    expect(good.rejects).toEqual([])
    expect(bad.rejects).toHaveLength(1)
    expect(noDb.rejects).toHaveLength(1)
    expect(logs.some((l) => l.includes('[email entrante] stored'))).toBe(true)
    expect(logs.some((l) => l.includes('[email entrante] rejected (address)'))).toBe(true)
    const joinedLogs = logs.join('\n')
    for (const leak of ['privad', 'pablo@cliente.test', to, SECRET]) expect(joinedLogs).not.toContain(leak)

    // El secreto no está en ninguna salida: respuestas del panel, filas guardadas, cuerpos enviados a Resend, rechazos.
    const outputs = [
      JSON.stringify(inboundEmailStatus(env)),
      JSON.stringify(webReplyOptions(loaded, { emailConnected: true, whatsappChannelActive: false, defaultCountryPrefix: null, inboundEmailActive: true })),
      JSON.stringify(await webThreadMessages(db, loaded)),
      JSON.stringify(await db.select().from(schema.emailLog)),
      JSON.stringify(await db.select().from(schema.commsWebMessages)),
      JSON.stringify(await db.select().from(schema.commsWebThreads)),
      JSON.stringify(await db.select().from(schema.commsWebhookEvents)),
      JSON.stringify(await db.select().from(schema.activities)),
      JSON.stringify(await db.select().from(schema.leads)),
      ...bodies,
      ...good.rejects,
      ...bad.rejects,
      ...noDb.rejects,
      joinedLogs,
    ]
    for (const out of outputs) expect(out).not.toContain(SECRET)
  })

  it('Estado del sistema: el email entrante sin configurar dice qué se pierde y cómo activarlo; sólo presencia', async () => {
    const { buildSystemStatus, TRACKED_SECRETS } = await import('../../server/utils/systemStatus')
    expect(TRACKED_SECRETS).toContain('INBOUND_EMAIL_DOMAIN')
    expect(TRACKED_SECRETS).toContain('INBOUND_EMAIL_SECRET')
    const base = {
      secrets: Object.fromEntries(TRACKED_SECRETS.map((s) => [s, true])),
      database: { ok: true },
      storage: { ok: true },
      channels: { total: 1, implemented: 1 },
      email: { connected: true, status: 'ok' as const, headline: 'ok' },
      domains: { total: 0, failing: [], lastCheckedAt: null },
      browserRendering: true,
      build: { commit: 'x', branch: 'main', builtAt: '', source: 'test' },
    }
    const on = buildSystemStatus(base).integrations.find((i) => i.key === 'inbound-email')!
    expect(on.state).toBe('ok')
    const off = buildSystemStatus({ ...base, secrets: { ...base.secrets, INBOUND_EMAIL_SECRET: false } }).integrations.find((i) => i.key === 'inbound-email')!
    expect(off.state).toBe('not-configured')
    expect(off.remedy).toContain('INBOUND_EMAIL_SECRET')
    expect(off.detail).toContain('Responder a')
  })
})
