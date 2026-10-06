import { and, eq, sql } from 'drizzle-orm'
import { createError, createEvent, getCookie, getRequestHeader, getRequestIP, setResponseHeader } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Núcleo inmobiliario, bloque N8a (FASES 29, 30, 32 y 33) sobre una SQLite
 * real con las migraciones reales (0087 incluida):
 *
 *   - formulario público → hilo «Formulario web» vinculado a Contact, Lead y Property;
 *   - chat de la web: sesión por token opaco, aislamiento entre agencias y
 *     entre hilos, límite de tasa, campo trampa y respuesta real (chat/email);
 *   - enlace personal a una ficha → apertura → Lead Score;
 *   - Contact guardado en el hilo de WhatsApp;
 *   - matching exploratorio sin persistir nada;
 *   - dashboard comercial por oficina (entidad) y «cada comercial ve sólo lo suyo».
 *
 * Ningún envío real: el email usa un `fetch` simulado y nada llama a WhatsApp.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})
vi.mock('../../server/utils/audit', () => ({ logAdminAction: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
})

const ts = '2026-01-01 00:00:00'
let seq = 0
const ev = (db: any) => ({ context: { db } }) as any

async function office(db: any, orgId: number, name = `Oficina ${++seq}`) {
  const [row] = await db.insert(schema.offices).values({ organizationId: orgId, name, createdAt: ts, updatedAt: ts }).returning()
  return row
}
async function member(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db
    .insert(schema.teamMembers)
    .values({ organizationId: orgId, name: `Comercial ${seq}`, slug: `comercial-${seq}`, email: `c${seq}@n8a.test`, position: 'Comercial', createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}
async function contact(db: any, orgId: number, name = `Contacto ${++seq}`) {
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name, email: `p${seq}@n8a.test`, createdAt: ts, updatedAt: ts }).returning()
  return row
}
async function lead(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db
    .insert(schema.leads)
    .values({ organizationId: orgId, name: `Lead ${seq}`, email: `l${seq}@n8a.test`, source: 'web', status: 'new', stage: 'new', score: 0, createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}
async function devProperty(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [developer] = await db.select({ id: schema.developers.id }).from(schema.developers).where(eq(schema.developers.organizationId, orgId)).limit(1)
  const [row] = await db
    .insert(schema.developerProperties)
    .values({ organizationId: orgId, developerId: developer.id, name: `Residencial ${seq}`, slug: `residencial-${seq}`, status: 'new', price: 400_000, area: 90, createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}

// --- D1 mínimo para el limitador de tasa real (server/utils/rateLimit.ts) -------
function d1(sqlite: any) {
  return {
    prepare(query: string) {
      return {
        bind(...params: any[]) {
          return {
            run: async () => sqlite.prepare(query).run(...params),
            first: async () => sqlite.prepare(query).get(...params) ?? null,
          }
        },
      }
    },
  }
}
/** Un evento H3 de verdad (cabeceras, query, cuerpo) para la ruta pública del chat. */
function publicEvent(db: any, sqlite: any, orgId: number, action: string, body: Record<string, any>, ip = '203.0.113.7') {
  const req: any = {
    method: 'POST',
    url: `/api/public/contact?channel=chat&action=${action}`,
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, host: 'agencia.test', referer: 'https://agencia.test/propiedades/x' },
    body: JSON.stringify(body),
  }
  const res: any = { statusCode: 200, setHeader: vi.fn(), getHeader: vi.fn(), removeHeader: vi.fn() }
  const event = createEvent(req, res)
  event.context.db = db
  ;(event.context as any).cloudflare = { env: { DB: d1(sqlite) } }
  ;(event.context as any).org = { id: orgId }
  return event
}
async function enableChat(db: any, orgId: number) {
  await db.insert(schema.commsSettings).values({ organizationId: orgId, webChatEnabled: 1, createdAt: ts, updatedAt: ts })
}

// ---------------------------------------------------------------------------
describe('FASE 29 — formulario público → hilo «Formulario web»', () => {
  it('cada envío queda como hilo vinculado a su Lead, al Contact de ese lead y a la propiedad; la misma persona reutiliza el hilo', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'FormA')
    const b = await seedTenant(db, 'FormB')
    const { upsertLead } = await import('../../server/utils/leads')
    const { recordWebFormSubmission, loadWebThreadForOrg, webThreadMessages } = await import('../../server/utils/comms/web')
    const property = await devProperty(db, a.orgId)

    const created = await upsertLead(ev(db), { organizationId: a.orgId, name: 'Marta Web', email: 'marta.form@n8a.test', phone: '+34 600 111 222', source: 'web', originalMessage: 'Me interesa' })
    const first = await recordWebFormSubmission(db, { orgId: a.orgId, formType: 'contact', leadId: created.id, name: 'Marta Web', email: 'MARTA.form@n8a.test', phone: '+34 600 111 222', message: 'Me interesa el ático', fields: { subject: 'Ático' }, propertyId: property.id, propertyKind: 'developer' })
    expect(first.created).toBe(true)

    const [leadRow] = await db.select().from(schema.leads).where(eq(schema.leads.id, created.id))
    expect(leadRow.contactId).toBeTruthy()
    const thread = await loadWebThreadForOrg(db, a.orgId, first.threadId)
    expect(thread).toMatchObject({ kind: 'form', formType: 'contact', leadId: created.id, contactId: leadRow.contactId, propertyId: property.id, propertyKind: 'developer', visitorEmail: 'marta.form@n8a.test', unreadCount: 1, status: 'open' })

    // Una solicitud de visita de la misma persona: mismo hilo, reabierto, dos mensajes.
    await db.update(schema.commsWebThreads).set({ status: 'closed' }).where(eq(schema.commsWebThreads.id, first.threadId))
    const second = await recordWebFormSubmission(db, { orgId: a.orgId, formType: 'visit_request', leadId: created.id, name: 'Marta Web', message: 'Solicitud de visita', fields: { startAt: '2026-11-01 10:00:00' } })
    expect(second).toMatchObject({ threadId: first.threadId, created: false })
    const again = await loadWebThreadForOrg(db, a.orgId, first.threadId)
    expect(again).toMatchObject({ status: 'open', unreadCount: 2, formType: 'visit_request' })
    const messages = await webThreadMessages(db, again)
    expect(messages.map((m: any) => [m.direction, m.via])).toEqual([
      ['in', 'form'],
      ['in', 'form'],
    ])
    expect(messages[0].fields).toMatchObject({ formType: 'contact', subject: 'Ático' })

    // Otra agencia: el hilo no existe para ella (404, nunca 403).
    await expect(loadWebThreadForOrg(db, b.orgId, first.threadId)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('un lead de otra agencia nunca se vincula al hilo (se ignora, no se filtra)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'FormLeakA')
    const b = await seedTenant(db, 'FormLeakB')
    const { recordWebFormSubmission, loadWebThreadForOrg } = await import('../../server/utils/comms/web')
    const foreign = await lead(db, b.orgId)
    const r = await recordWebFormSubmission(db, { orgId: a.orgId, formType: 'contact', leadId: foreign.id, name: 'X', email: 'x@n8a.test', message: 'hola' })
    const thread = await loadWebThreadForOrg(db, a.orgId, r.threadId)
    expect(thread.leadId).toBeNull()
    expect(thread.contactId).toBeNull()
  })

  it('la bandeja lista los hilos web junto a WhatsApp con clave w<n>, y el contador de no leídos los suma', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'FormList')
    const { recordWebFormSubmission, listWebThreads, serializeWebThreads, parseWebThreadKey } = await import('../../server/utils/comms/web')
    const { unreadTotal } = await import('../../server/utils/comms/admin')
    const r = await recordWebFormSubmission(db, { orgId: a.orgId, formType: 'referral', name: 'Referida', email: 'ref@n8a.test', message: 'Llega recomendada' })
    const [row] = await serializeWebThreads(db, a.orgId, await listWebThreads(db, a.orgId, { status: 'open' }))
    expect(row).toMatchObject({ id: `w${r.threadId}`, source: 'web_form', channel: { label: 'Formulario web' }, window: null })
    expect(parseWebThreadKey(row.id)).toBe(r.threadId)
    expect(parseWebThreadKey('12')).toBeNull()
    expect(await unreadTotal(db, a.orgId)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
describe('FASE 29 — chat de la web', () => {
  it('sesión por token opaco (sólo se guarda su hash), con lead si deja email; aislado entre agencias y entre hilos; sin notas internas', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'ChatA')
    const b = await seedTenant(db, 'ChatB')
    const { upsertLead } = await import('../../server/utils/leads')
    const { startWebChat, postWebChatMessage, pollWebChat, findChatThreadByToken, addWebThreadNote, replyToWebThread } = await import('../../server/utils/comms/web')

    const createLead = (l: any) => upsertLead(ev(db), { organizationId: a.orgId, name: l.name, email: l.email, phone: l.phone, source: 'web', sourceDetail: 'Chat web', originalMessage: l.message })
    const one = await startWebChat(db, { orgId: a.orgId, name: 'Lucía', email: 'lucia.chat@n8a.test', message: '¿Sigue disponible?' }, { createLead })
    const two = await startWebChat(db, { orgId: a.orgId, name: 'Anónimo', message: 'Hola' })
    expect(one.token).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(one.messages).toEqual([expect.objectContaining({ from: 'visitor', body: '¿Sigue disponible?' })])

    const [stored] = await db.select().from(schema.commsWebThreads).where(eq(schema.commsWebThreads.id, one.threadId))
    expect(stored.sessionTokenHash).not.toBe(one.token)
    expect(stored.sessionTokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.leadId).toBeTruthy()
    expect(stored.contactId).toBeTruthy()
    const [anon] = await db.select().from(schema.commsWebThreads).where(eq(schema.commsWebThreads.id, two.threadId))
    expect(anon.leadId).toBeNull()

    // El token de A no vale en la agencia B, ni para leer ni para escribir.
    expect(await findChatThreadByToken(db, b.orgId, one.token)).toBeNull()
    await expect(pollWebChat(db, b.orgId, one.token, 0)).rejects.toMatchObject({ statusCode: 404 })
    await expect(postWebChatMessage(db, b.orgId, one.token, 'intruso')).rejects.toMatchObject({ statusCode: 404 })
    await expect(pollWebChat(db, a.orgId, 'no-es-un-token', 0)).rejects.toMatchObject({ statusCode: 404 })

    // Nota interna y respuesta del equipo: el visitante ve la respuesta, nunca la nota; el otro hilo, nada.
    await addWebThreadNote(db, stored, a.userId, 'Cliente VIP, llamar mañana')
    const reply = await replyToWebThread(db, {}, { orgId: a.orgId, thread: stored, userId: a.userId, via: 'chat', body: 'Sí, sigue disponible', origin: 'https://agencia.test', emailConnected: false })
    expect(reply.ok).toBe(true)
    const polled = await pollWebChat(db, a.orgId, one.token, one.messages[0].id)
    expect(polled.messages).toEqual([expect.objectContaining({ from: 'agency', body: 'Sí, sigue disponible' })])
    expect(JSON.stringify(polled)).not.toContain('VIP')
    const [delivered] = await db.select().from(schema.commsWebMessages).where(eq(schema.commsWebMessages.id, reply.message.id))
    expect(delivered.status).toBe('delivered')
    const other = await pollWebChat(db, a.orgId, two.token, 0)
    expect(other.messages.map((m: any) => m.body)).toEqual(['Hola'])

    // El visitante escribe otra vez en SU hilo.
    const more = await postWebChatMessage(db, a.orgId, one.token, 'Perfecto, ¿cuándo puedo verlo?')
    expect(more.from).toBe('visitor')
  })

  it('una sesión caducada ya no sirve, y responder por el chat de un hilo sin sesión es 409 (no se simula)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'ChatExp')
    const { startWebChat, pollWebChat, loadWebThreadForOrg, replyToWebThread, recordWebFormSubmission } = await import('../../server/utils/comms/web')
    const chat = await startWebChat(db, { orgId: a.orgId, name: 'Ana', message: 'Hola' })
    await db.update(schema.commsWebThreads).set({ sessionExpiresAt: '2020-01-01 00:00:00' }).where(eq(schema.commsWebThreads.id, chat.threadId))
    await expect(pollWebChat(db, a.orgId, chat.token, 0)).rejects.toMatchObject({ statusCode: 404 })
    const expired = await loadWebThreadForOrg(db, a.orgId, chat.threadId)
    await expect(replyToWebThread(db, {}, { orgId: a.orgId, thread: expired, userId: a.userId, via: 'chat', body: 'hola', origin: 'https://x.test', emailConnected: false })).rejects.toMatchObject({ statusCode: 409 })

    const form = await recordWebFormSubmission(db, { orgId: a.orgId, formType: 'contact', name: 'Sin email', message: 'x' })
    const formThread = await loadWebThreadForOrg(db, a.orgId, form.threadId)
    await expect(replyToWebThread(db, {}, { orgId: a.orgId, thread: formThread, userId: a.userId, via: 'chat', body: 'hola', origin: 'https://x.test', emailConnected: true })).rejects.toMatchObject({ statusCode: 409 })
    await expect(replyToWebThread(db, {}, { orgId: a.orgId, thread: formThread, userId: a.userId, via: 'email', body: 'hola', origin: 'https://x.test', emailConnected: true })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('anti-abuso: texto validado, como mucho 3 enlaces, y 15 mensajes seguidos sin respuesta → 429', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'ChatAbuse')
    const { startWebChat, postWebChatMessage, validateVisitorText, CHAT_MAX_UNANSWERED } = await import('../../server/utils/comms/web')
    expect(() => validateVisitorText('   ')).toThrow()
    expect(() => validateVisitorText('x'.repeat(2001))).toThrow()
    expect(() => validateVisitorText('http://a.test http://b.test http://c.test http://d.test')).toThrow(/enlaces/)
    expect(validateVisitorText('  hola\u0007  ')).toBe('hola')

    const chat = await startWebChat(db, { orgId: a.orgId, name: 'Spam', message: '1' })
    for (let i = 2; i <= CHAT_MAX_UNANSWERED; i++) await postWebChatMessage(db, a.orgId, chat.token, String(i))
    await expect(postWebChatMessage(db, a.orgId, chat.token, 'otro')).rejects.toMatchObject({ statusCode: 429 })
  })

  it('la ruta pública: chat apagado → 404, campo trampa → 400, límite de tasa por IP real → 429, y la agencia la decide el host', async () => {
    // rateLimit.ts usa los auto-imports de Nitro: aquí se le dan los de h3 para que el limitador sea el real.
    vi.stubGlobal('getRequestHeader', getRequestHeader)
    vi.stubGlobal('getRequestIP', getRequestIP)
    vi.stubGlobal('setResponseHeader', setResponseHeader)
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('getCookie', getCookie)
    const { db, sqlite } = createTestDb()
    const a = await seedTenant(db, 'ChatRoute')
    const b = await seedTenant(db, 'ChatRouteB')
    const { handlePublicWebChat } = await import('../../server/utils/comms/webPublic')

    await expect(handlePublicWebChat(publicEvent(db, sqlite, a.orgId, 'start', { name: 'X', message: 'hola' }))).rejects.toMatchObject({ statusCode: 404 })
    await enableChat(db, a.orgId)
    await expect(handlePublicWebChat(publicEvent(db, sqlite, a.orgId, 'start', { name: 'Bot', message: 'hola', website: 'http://spam.test' }, '198.51.100.1'))).rejects.toMatchObject({ statusCode: 400 })
    await expect(handlePublicWebChat(publicEvent(db, sqlite, a.orgId, 'nope', {}))).rejects.toMatchObject({ statusCode: 400 })

    const started: any = await handlePublicWebChat(publicEvent(db, sqlite, a.orgId, 'start', { name: 'Eva', message: 'Hola desde la web' }, '198.51.100.2'))
    expect(started.token).toBeTruthy()
    const [thread] = await db.select().from(schema.commsWebThreads).where(eq(schema.commsWebThreads.organizationId, a.orgId))
    expect(thread).toMatchObject({ kind: 'chat', pageUrl: '/propiedades/x' })
    // Ni un hilo en la otra agencia.
    expect(await db.select().from(schema.commsWebThreads).where(eq(schema.commsWebThreads.organizationId, b.orgId))).toEqual([])

    const polled: any = await handlePublicWebChat(publicEvent(db, sqlite, a.orgId, 'poll', { token: started.token, after: 0 }, '198.51.100.2'))
    expect(polled.messages.map((m: any) => m.body)).toEqual(['Hola desde la web'])
    // El token de A en el host de B: 404 (B no tiene el chat activo; y con él activo, tampoco lo encontraría).
    await enableChat(db, b.orgId)
    await expect(handlePublicWebChat(publicEvent(db, sqlite, b.orgId, 'poll', { token: started.token }, '198.51.100.2'))).rejects.toMatchObject({ statusCode: 404 })

    // Límite real de la ruta: 5 conversaciones nuevas por IP cada 10 minutos.
    for (let i = 0; i < 5; i++) await handlePublicWebChat(publicEvent(db, sqlite, a.orgId, 'start', { name: `V${i}`, message: 'hola' }, '198.51.100.9'))
    await expect(handlePublicWebChat(publicEvent(db, sqlite, a.orgId, 'start', { name: 'V6', message: 'hola' }, '198.51.100.9'))).rejects.toMatchObject({ statusCode: 429 })
  })
})

// ---------------------------------------------------------------------------
describe('FASE 29/32 — responder por email y compartir ficha con enlace personal', () => {
  it('email real por el email transaccional (fetch simulado): email_log, estado aceptado, contacto humano del lead y enlace personal a la ficha', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'ReplyMail')
    const { upsertLead } = await import('../../server/utils/leads')
    const { recordWebFormSubmission, loadWebThreadForOrg, replyToWebThread, webReplyOptions } = await import('../../server/utils/comms/web')
    const property = await devProperty(db, a.orgId, { slug: 'torre-mar' })
    const created = await upsertLead(ev(db), { organizationId: a.orgId, name: 'Pablo', email: 'pablo.mail@n8a.test', source: 'web' })
    const r = await recordWebFormSubmission(db, { orgId: a.orgId, formType: 'contact', leadId: created.id, name: 'Pablo', email: 'pablo.mail@n8a.test', message: 'Info' })
    const thread = await loadWebThreadForOrg(db, a.orgId, r.threadId)

    // Sin email conectado en la plataforma: no se ofrece, se dice por qué.
    expect(webReplyOptions(thread, { emailConnected: false, whatsappChannelActive: false, defaultCountryPrefix: null }).email).toMatchObject({ available: false, reason: expect.stringContaining('RESEND_API_KEY') })

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 're_n8a' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const env = { RESEND_API_KEY: 're_test_key' }
    const sent = await replyToWebThread(db, env, { orgId: a.orgId, thread, userId: a.userId, via: 'email', body: 'Te paso la ficha', property: { id: property.id, kind: 'developer' }, origin: 'https://agencia.test', emailConnected: true })
    expect(sent.ok).toBe(true)
    expect(sent.message).toMatchObject({ direction: 'out', via: 'email', status: 'sent', type: 'property_share', propertyId: property.id })
    expect(sent.message.body).toContain('https://agencia.test/propiedades/torre-mar?f=')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [log] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.organizationId, a.orgId))
    expect(log).toMatchObject({ template: 'web_thread_reply', recipient: 'pablo.mail@n8a.test', status: 'sent' })
    expect(log.html).toContain('?f=')

    const [link] = await db.select().from(schema.propertyShareLinks).where(eq(schema.propertyShareLinks.organizationId, a.orgId))
    expect(link).toMatchObject({ propertyId: property.id, leadId: created.id, channel: 'email', openCount: 0 })
    expect(sent.message.body).not.toContain(link.tokenHash)

    const [leadRow] = await db.select().from(schema.leads).where(eq(schema.leads.id, created.id))
    expect(leadRow.firstResponseAt).toBeTruthy()
    const activity = await db.select().from(schema.activities).where(and(eq(schema.activities.organizationId, a.orgId), eq(schema.activities.eventType, 'PROPERTY_SENT')))
    expect(activity).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
describe('FASE 32 — aperturas del enlace personal en el Lead Score', () => {
  it('sólo cuenta el token de ESA agencia y ESA propiedad; la primera apertura deja actividad y suma «abrió fichas»', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'OpenA')
    const b = await seedTenant(db, 'OpenB')
    const { createPropertyShareLink, recordPropertyShareLinkOpen } = await import('../../server/utils/comms/shareLinks')
    const { collectLeadScoreSignals, evaluateLeadScore, defaultLeadScoreRules } = await import('../../server/utils/leads/score')
    const person = await contact(db, a.orgId)
    const l = await lead(db, a.orgId, { contactId: person.id })
    const props = [await devProperty(db, a.orgId), await devProperty(db, a.orgId), await devProperty(db, a.orgId)]
    const tokens = []
    for (const p of props) tokens.push((await createPropertyShareLink(db, { orgId: a.orgId, propertyId: p.id, contactId: person.id, leadId: l.id, channel: 'email' })).token)

    // Otra agencia, otra propiedad o un token inventado: no cuenta.
    expect(await recordPropertyShareLinkOpen(db, b.orgId, props[0].id, tokens[0])).toEqual({ counted: false, first: false })
    expect(await recordPropertyShareLinkOpen(db, a.orgId, props[1].id, tokens[0])).toEqual({ counted: false, first: false })
    expect(await recordPropertyShareLinkOpen(db, a.orgId, props[0].id, 'x'.repeat(30))).toEqual({ counted: false, first: false })
    expect((await collectLeadScoreSignals(db, a.orgId, l)).readPropertyShares).toBe(0)

    expect(await recordPropertyShareLinkOpen(db, a.orgId, props[0].id, tokens[0])).toEqual({ counted: true, first: true })
    expect(await recordPropertyShareLinkOpen(db, a.orgId, props[0].id, tokens[0])).toEqual({ counted: true, first: false })
    const opened = await db.select().from(schema.activities).where(and(eq(schema.activities.organizationId, a.orgId), eq(schema.activities.eventType, 'PROPERTY_SHARE_OPENED')))
    expect(opened).toHaveLength(1)
    expect(JSON.parse(opened[0].metadataJson)).toMatchObject({ via: 'link', channel: 'email' })

    await recordPropertyShareLinkOpen(db, a.orgId, props[1].id, tokens[1])
    await recordPropertyShareLinkOpen(db, a.orgId, props[2].id, tokens[2])
    const signals = await collectLeadScoreSignals(db, a.orgId, l)
    expect(signals).toMatchObject({ readPropertyShares: 3, openedLinkShares: 3 })
    const result = evaluateLeadScore(signals, defaultLeadScoreRules(), Date.now())
    const item = result.breakdown.find((x) => x.criterion === 'opened_listings')!
    expect(item.applied).toBe(true)
    expect(item.detail).toContain('enlace personal')
    // Y el recálculo real ya lo dejó en el lead.
    const [leadRow] = await db.select().from(schema.leads).where(eq(schema.leads.id, l.id))
    expect(leadRow.score).toBeGreaterThanOrEqual(4)
  })
})

// ---------------------------------------------------------------------------
describe('FASE 29 — el Contact se guarda en el hilo de WhatsApp', () => {
  it('al crearse el hilo con un contacto ya vinculado, y al vincularlo después; la ficha del Contact lo encuentra por ese vínculo', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'CrmLink')
    const { findOrCreateConversation, syncConversationCrmContact } = await import('../../server/utils/comms/inbox')
    const { listPersonCommunications } = await import('../../server/utils/comms/related')
    const [channel] = await db
      .insert(schema.commsChannels)
      .values({ organizationId: a.orgId, provider: 'meta_cloud', label: 'Meta', phoneE164: '+34900000001', externalPhoneId: 'n8a-1', credentialsCiphertext: 'x', credentialsIv: 'y', status: 'active', isDefault: 1, createdAt: ts, updatedAt: ts })
      .returning()
    const person = await contact(db, a.orgId, 'Rosa')
    const l = await lead(db, a.orgId, { contactId: person.id })
    const [linked] = await db.insert(schema.commsContacts).values({ organizationId: a.orgId, phoneE164: '+34600000001', leadId: l.id, createdAt: ts, updatedAt: ts }).returning()
    const conv = await findOrCreateConversation(db, a.orgId, channel.id, linked.id)
    expect(conv.crmContactId).toBe(person.id)

    const [unknown] = await db.insert(schema.commsContacts).values({ organizationId: a.orgId, phoneE164: '+34600000002', createdAt: ts, updatedAt: ts }).returning()
    const conv2 = await findOrCreateConversation(db, a.orgId, channel.id, unknown.id)
    expect(conv2.crmContactId).toBeNull()
    await db.update(schema.commsContacts).set({ leadId: l.id }).where(eq(schema.commsContacts.id, unknown.id))
    await syncConversationCrmContact(db, a.orgId, unknown.id)
    const [after] = await db.select().from(schema.commsConversations).where(eq(schema.commsConversations.id, conv2.id))
    expect(after.crmContactId).toBe(person.id)

    // Desvincular a mano lo quita.
    await db.update(schema.commsContacts).set({ leadId: null }).where(eq(schema.commsContacts.id, unknown.id))
    await syncConversationCrmContact(db, a.orgId, unknown.id, { clear: true })
    const [cleared] = await db.select().from(schema.commsConversations).where(eq(schema.commsConversations.id, conv2.id))
    expect(cleared.crmContactId).toBeNull()

    await db.update(schema.commsConversations).set({ lastMessageAt: ts }).where(eq(schema.commsConversations.id, conv.id))
    const comms = await listPersonCommunications(db, a.orgId, { contactIds: [person.id] })
    expect(comms.conversations.map((c) => c.id)).toEqual([conv.id])
  })
})

// ---------------------------------------------------------------------------
describe('FASE 30 — matching de una necesidad no guardada', () => {
  it('mismo motor que una necesidad guardada, sin persistir nada; la tool find_matches lo expone y pide guardarla', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Explore')
    const b = await seedTenant(db, 'ExploreB')
    const { findPropertiesForCriteria, findPropertiesForRequirement } = await import('../../server/utils/matching/service')
    const { createBuyerRequirement } = await import('../../server/utils/buyerRequirements/service')
    const good = await devProperty(db, a.orgId, { transactionType: 'sale', propertyType: 'Apartment', price: 300_000, bedrooms: 3, city: 'Madrid' })
    const pricey = await devProperty(db, a.orgId, { transactionType: 'sale', propertyType: 'Apartment', price: 900_000, bedrooms: 3, city: 'Madrid' })
    await devProperty(db, b.orgId, { transactionType: 'sale', propertyType: 'Apartment', price: 300_000, bedrooms: 3, city: 'Madrid' })

    const count = async () => {
      const [r] = await db.select({ n: sql<number>`(SELECT count(*) FROM buyer_requirements) + (SELECT count(*) FROM property_matches) + (SELECT count(*) FROM developer_property_matches) + (SELECT count(*) FROM activities)` }).from(schema.organizations).limit(1)
      return Number(r.n)
    }
    const before = await count()
    const criteria = { operation: 'sale', propertyTypes: ['Apartment'], priceMax: 350_000, bedroomsMin: 2, desiredZones: [{ label: 'Madrid' }] }
    const exploratory = await findPropertiesForCriteria(ev(db), a.orgId, criteria)
    expect(await count()).toBe(before)
    expect(exploratory.results.map((r) => r.property.id)).toContain(good.id)
    expect(exploratory.results.map((r) => r.property.id)).not.toContain(pricey.id)
    expect(exploratory.results.every((r) => r.persisted === null)).toBe(true)

    // La misma necesidad, guardada: el mismo score para la misma propiedad (un solo motor).
    const person = await contact(db, a.orgId)
    const saved = await createBuyerRequirement(ev(db), a.orgId, { contactId: person.id, ...criteria } as any, { createdBy: a.userId })
    const viaSaved = await findPropertiesForRequirement(ev(db), a.orgId, saved!.id)
    const scoreOf = (list: any[]) => list.find((r) => r.property.id === good.id)?.result.score
    expect(scoreOf(exploratory.results)).toBe(scoreOf(viaSaved!.results))

    const { DOMAIN_TOOLS } = (await import('../../server/utils/tools/registry')) as any
    const tool = (DOMAIN_TOOLS || []).find((t: any) => t.name === 'find_matches')
    expect(tool).toBeTruthy()
    expect(() => tool.parse({})).toThrow(/buyerRequirementId|criteria/)
    expect(() => tool.parse({ criteria: { propertyTypes: ['Castillo'] } })).toThrow()
    expect(() => tool.parse({ criteria: {} })).toThrow(/al menos un criterio/)
    const input = tool.parse({ criteria: { propertyTypes: ['Apartment'], priceMax: 350000, desiredZones: ['Madrid'] } })
    const out = await tool.run({ event: ev(db), db, env: {}, orgId: a.orgId, user: { id: a.userId, role: 'admin' }, source: 'inmo' }, input)
    expect(out.output).toMatchObject({ exploratory: true, saved: false })
    expect(out.output.suggestion).toContain('update_buyer_requirements')
    expect(out.output.results.map((r: any) => r.property.id)).toContain(good.id)
    expect(out.target).toBeNull()
  })
})

// ---------------------------------------------------------------------------
describe('FASE 33 — dashboard comercial: oficina como entidad y «cada comercial ve sólo lo suyo»', () => {
  it('la regla de visibilidad sale de los permisos existentes y del vínculo usuario ↔ comercial', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Vis')
    const { dashboardVisibilityFor, applyDashboardVisibility, parseDashboardScope } = await import('../../server/utils/dashboard/commercial')
    const mine = await member(db, a.orgId, { userId: 4242 })
    expect(await dashboardVisibilityFor(db, a.orgId, { id: 1, role: 'super_admin', permissions: '["crm:read"]' })).toEqual({ mode: 'all' })
    expect(await dashboardVisibilityFor(db, a.orgId, { id: 4242, role: 'admin', permissions: null })).toEqual({ mode: 'all' })
    expect(await dashboardVisibilityFor(db, a.orgId, { id: 4242, role: 'admin', permissions: '["crm:write","system:write"]' })).toEqual({ mode: 'all' })
    const own = await dashboardVisibilityFor(db, a.orgId, { id: 4242, role: 'admin', permissions: '["crm:write"]' })
    expect(own).toEqual({ mode: 'own', commercialId: mine.id, commercialName: mine.name })
    const none = await dashboardVisibilityFor(db, a.orgId, { id: 777, role: 'admin', permissions: '["crm:read"]' })
    expect(none.mode).toBe('none')

    // Lo que pida el navegador no cambia el comercial forzado.
    const scope = applyDashboardVisibility(parseDashboardScope({ from: '2026-05-01', to: '2026-05-31', commercialId: '99999' }), own)
    expect(scope.commercialId).toBe(mine.id)
    expect(() => applyDashboardVisibility(parseDashboardScope({}), none)).toThrow()

    // La ficha de otra agencia con el mismo usuario no cuenta.
    const b = await seedTenant(db, 'VisB')
    await member(db, b.orgId, { userId: 5151 })
    expect((await dashboardVisibilityFor(db, a.orgId, { id: 5151, role: 'admin', permissions: '["crm:read"]' })).mode).toBe('none')
  })

  it('«sólo lo suyo»: KPIs, embudo, tabla y opciones del comercial; filtro por la entidad Oficina (la del registro o la de su comercial)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Dash')
    const { getCommercialDashboard, dashboardFilterOptions, parseDashboardScope, applyDashboardVisibility } = await import('../../server/utils/dashboard/commercial')
    const madrid = await office(db, a.orgId, 'Madrid Centro')
    const sevilla = await office(db, a.orgId, 'Sevilla')
    const laura = await member(db, a.orgId, { name: 'Laura', officeId: madrid.id, userId: 9001 })
    const pedro = await member(db, a.orgId, { name: 'Pedro', officeId: sevilla.id })
    const at = '2026-05-10 10:00:00'
    // Laura: 3 leads (uno con la oficina propia de Sevilla), Pedro: 2 leads (uno con oficina propia de Madrid).
    await lead(db, a.orgId, { agentId: laura.id, createdAt: at, campaign: 'Laura Camp' })
    await lead(db, a.orgId, { agentId: laura.id, createdAt: at })
    await lead(db, a.orgId, { agentId: laura.id, officeId: sevilla.id, createdAt: at })
    await lead(db, a.orgId, { agentId: pedro.id, createdAt: at, campaign: 'Pedro Camp' })
    await lead(db, a.orgId, { agentId: pedro.id, officeId: madrid.id, createdAt: at })
    await db.insert(schema.visits).values([
      { organizationId: a.orgId, clientName: 'V1', agentId: laura.id, type: 'property_viewing', status: 'completed', scheduledAt: '2026-05-10 10:00:00', channel: 'in_person', createdAt: at },
      { organizationId: a.orgId, clientName: 'V2', agentId: pedro.id, type: 'property_viewing', status: 'completed', scheduledAt: '2026-05-11 10:00:00', channel: 'in_person', officeId: madrid.id, createdAt: at },
      { organizationId: a.orgId, clientName: 'V3', agentId: pedro.id, type: 'property_viewing', status: 'completed', scheduledAt: '2026-05-12 10:00:00', channel: 'in_person', createdAt: at },
    ])
    const period = { from: '2026-05-01', to: '2026-05-31' }

    const all = await getCommercialDashboard(db, a.orgId, parseDashboardScope(period))
    expect(all.kpis.newLeads.value).toBe(5) // el lead del seedTenant (enero) no cae en el periodo
    expect(all.kpis.completedViewings.value).toBe(3)

    // Oficina Madrid (entidad): leads con oficina Madrid + leads SIN oficina de comerciales de Madrid.
    const byOffice = await getCommercialDashboard(db, a.orgId, parseDashboardScope({ ...period, officeId: String(madrid.id) }))
    expect(byOffice.kpis.newLeads.value).toBe(3) // 2 de Laura sin oficina + 1 de Pedro con oficina Madrid
    expect(byOffice.kpis.completedViewings.value).toBe(2) // V1 (Laura, sin oficina) + V2 (oficina Madrid)
    expect(byOffice.kpis.newLeads.link).toContain(`officeScope=${madrid.id}`)
    expect(byOffice.byCommercial.find((r: any) => r.commercialId === laura.id)?.office).toBe('Madrid Centro')

    // Laura (restringida y vinculada) sólo ve lo suyo, pida lo que pida.
    const own = { mode: 'own' as const, commercialId: laura.id, commercialName: 'Laura' }
    const hers = await getCommercialDashboard(db, a.orgId, applyDashboardVisibility(parseDashboardScope({ ...period, commercialId: String(pedro.id) }), own))
    expect(hers.kpis.newLeads.value).toBe(3)
    expect(hers.funnel.stages[0].value).toBe(3)
    expect(hers.kpis.completedViewings.value).toBe(1)
    expect(hers.byCommercial.map((r: any) => r.commercialId)).toEqual([laura.id])

    const options = await dashboardFilterOptions(db, a.orgId, own)
    expect(options.commercials).toEqual([{ id: laura.id, name: 'Laura' }])
    expect(options.offices).toEqual([{ id: madrid.id, name: 'Madrid Centro' }])
    expect(options.campaigns).toEqual(['Laura Camp'])
    const everything = await dashboardFilterOptions(db, a.orgId)
    expect(everything.offices.map((o: any) => o.name)).toEqual(['Madrid Centro', 'Sevilla'])
  })
})
