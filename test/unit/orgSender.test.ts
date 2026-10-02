import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { OrgSenderError, effectiveOrgSender, emailDomainOwner, formatFromHeader, orgSenderView, resolveEffectiveOrgSender, saveOrgSender, senderDomainProblem, verifyOrgSender } from '../../server/utils/email/orgSender'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * Remitente propio de cada empresa (server/utils/email/orgSender.ts) contra
 * una cuenta de Resend simulada: alta del dominio, registros DNS,
 * verificación, propiedad del dominio por empresa y los dominios que no
 * pueden ser remitente.
 */
let db: any
let a: TenantFixture
let b: TenantFixture
const ENV = { RESEND_API_KEY: 're_test_placeholder' }
const ADMIN = { role: 'admin' }
const SUPER = { role: 'super_admin' }

interface FakeDomain { id: string; name: string; status: string; region: string }
let domains: Map<string, FakeDomain>
let calls: string[]
let forceError: { status: number; message: string } | null

function stubResend() {
  domains = new Map([['d-ajeno', { id: 'd-ajeno', name: 'ajeno.es', status: 'verified', region: 'eu-west-1' }]])
  calls = []
  forceError = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname
      const method = init.method || 'GET'
      calls.push(`${method} ${path}`)
      if (forceError) return new Response(JSON.stringify({ message: forceError.message }), { status: forceError.status })
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
      const records = (d: FakeDomain) => [
        { record: 'SPF', name: 'send', type: 'MX', value: `feedback-smtp.${d.region}.amazonses.com`, priority: 10, status: d.status === 'verified' ? 'verified' : 'not_started' },
        { record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=ABC', status: d.status === 'verified' ? 'verified' : 'not_started' },
      ]
      if (method === 'GET' && path === '/domains') return json({ data: [...domains.values()] })
      if (method === 'POST' && path === '/domains') {
        const body = JSON.parse(String(init.body))
        const d = { id: `d-${domains.size + 1}`, name: body.name, status: 'not_started', region: body.region }
        domains.set(d.id, d)
        return json({ ...d, records: records(d) }, 201)
      }
      const m = path.match(/^\/domains\/([^/]+)(\/verify)?$/)
      const d = m ? domains.get(m[1]!) : undefined
      if (!d) return json({ message: 'not found' }, 404)
      if (m![2]) {
        d.status = d.name.startsWith('ok-') ? 'verified' : 'pending'
        return json({ object: 'domain', id: d.id })
      }
      return json({ ...d, records: records(d) })
    }),
  )
}

async function expectSenderError(p: Promise<unknown>, field: string, statusCode?: number) {
  let error: unknown
  try {
    await p
  } catch (e) {
    error = e
  }
  expect(error).toBeInstanceOf(OrgSenderError)
  expect((error as OrgSenderError).field).toBe(field)
  if (statusCode) expect((error as OrgSenderError).statusCode).toBe(statusCode)
}

const orgRow = async (id: number) => (await db.select().from(schema.organizations).where(eq(schema.organizations.id, id)))[0]

beforeEach(async () => {
  ;({ db } = createTestDb())
  a = await seedTenant(db, 'Remite A')
  b = await seedTenant(db, 'Remite B')
  stubResend()
})
afterEach(() => vi.unstubAllGlobals())

describe('effectiveOrgSender', () => {
  it('sin dominio verificado: su nombre con la dirección de la plataforma, respuestas a la empresa', () => {
    expect(effectiveOrgSender({ name: 'Costa Azul', emailSenderAddress: 'hola@costaazul.es', emailSenderDomainVerified: 0 })).toEqual({
      mode: 'platform',
      fromHeader: 'Costa Azul <info@serendipiaagency.com>',
      replyTo: 'hola@costaazul.es',
    })
    expect(effectiveOrgSender({ name: 'Costa Azul', legalEmail: 'legal@costaazul.es' }).replyTo).toBe('legal@costaazul.es')
    expect(effectiveOrgSender({ name: 'Costa Azul', emailReplyTo: 'Ventas@Gmail.com', emailSenderAddress: 'hola@costaazul.es' }).replyTo).toBe('ventas@gmail.com')
    // Último recurso: el correo de su administrador.
    expect(effectiveOrgSender({ name: 'Costa Azul' }, {}, { fallbackReplyTo: 'admin@costaazul.es' }).replyTo).toBe('admin@costaazul.es')
    expect(effectiveOrgSender({ name: 'Costa Azul', legalEmail: 'legal@costaazul.es' }, {}, { fallbackReplyTo: 'admin@costaazul.es' }).replyTo).toBe('legal@costaazul.es')
  })

  it('una empresa que no ha configurado nada: su nombre y las respuestas al correo de su administrador', async () => {
    await db.update(schema.users).set({ email: 'Admin@Remite-A.es' }).where(eq(schema.users.id, a.userId))
    const org = (await db.select().from(schema.organizations).where(eq(schema.organizations.id, a.orgId)))[0]
    expect(await resolveEffectiveOrgSender(db, {}, org)).toEqual({ mode: 'platform', fromHeader: 'Remite A <info@serendipiaagency.com>', replyTo: 'admin@remite-a.es' })
  })

  it('con dominio verificado: su dirección y su nombre', () => {
    expect(effectiveOrgSender({ name: 'X', companyName: 'Costa Azul', emailSenderName: 'Costa Azul Homes', emailSenderAddress: 'hola@costaazul.es', emailSenderDomainVerified: 1 })).toEqual({
      mode: 'own',
      fromHeader: 'Costa Azul Homes <hola@costaazul.es>',
      replyTo: null,
    })
  })

  it('el nombre no puede romper la cabecera From', () => {
    expect(formatFromHeader('M&M Real Estate S.L.', 'a@b.es')).toBe('"M&M Real Estate S.L." <a@b.es>')
    // Sin saltos de línea (no se pueden inyectar cabeceras) ni < > " propios.
    expect(formatFromHeader('Evil <x@y.z>\r\nBcc: z', 'a@b.es')).toBe('"Evil x@y.zBcc: z" <a@b.es>')
  })
})

describe('senderDomainProblem', () => {
  it('rechaza el dominio de la plataforma, resend.dev y los buzones gratuitos', () => {
    expect(senderDomainProblem('serendipiaagency.com')).toMatch(/plataforma/)
    expect(senderDomainProblem('mail.serendipiaagency.com')).toMatch(/plataforma/)
    expect(senderDomainProblem('resend.dev')).toMatch(/plataforma/)
    expect(senderDomainProblem('gmail.com')).toMatch(/Gmail/)
    expect(senderDomainProblem('hotmail.es')).toMatch(/Gmail/)
    expect(senderDomainProblem('costaazul.es')).toBeNull()
  })
})

describe('saveOrgSender + verifyOrgSender', () => {
  it('registra el dominio en Resend (región eu-west-1), enseña los registros DNS y no envía desde él hasta verificarlo', async () => {
    const { view } = await saveOrgSender(db, ENV, a.orgId, { senderName: 'Remite A', senderAddress: 'Hola@OK-remitea.es', replyTo: '', internalRecipients: 'ops@ok-remitea.es\nventas@ok-remitea.es' }, ADMIN)
    expect(view.senderAddress).toBe('hola@ok-remitea.es')
    expect(view.internalRecipients).toEqual(['ops@ok-remitea.es', 'ventas@ok-remitea.es'])
    expect(view.domain).toMatchObject({ name: 'ok-remitea.es', status: 'not_started', verified: false })
    expect(view.domain!.records.map((r) => r.host)).toEqual(['send.ok-remitea.es', 'resend._domainkey.ok-remitea.es'])
    expect(view.effective.mode).toBe('platform')
    expect([...domains.values()].find((d) => d.name === 'ok-remitea.es')?.region).toBe('eu-west-1')
    expect(await emailDomainOwner(db, 'ok-remitea.es')).toBe(a.orgId)

    const verified = await verifyOrgSender(db, ENV, a.orgId)
    expect(verified.view.domain).toMatchObject({ status: 'verified', verified: true })
    expect(verified.view.effective).toEqual({ mode: 'own', fromHeader: 'Remite A <hola@ok-remitea.es>', replyTo: null })
    expect((await orgRow(a.orgId)).emailSenderDomainVerified).toBe(1)
  })

  it('un dominio que no verifica se queda pendiente y los emails siguen saliendo con la dirección de la plataforma', async () => {
    await saveOrgSender(db, ENV, a.orgId, { senderAddress: 'hola@lento.es' }, ADMIN)
    const { view } = await verifyOrgSender(db, ENV, a.orgId)
    expect(view.domain).toMatchObject({ status: 'pending', verified: false })
    expect(view.effective.mode).toBe('platform')
  })

  it('un dominio es de UNA empresa: otra no puede usarlo, aunque ya esté verificado', async () => {
    await saveOrgSender(db, ENV, a.orgId, { senderAddress: 'hola@ok-propio.es' }, ADMIN)
    await verifyOrgSender(db, ENV, a.orgId)
    await expectSenderError(saveOrgSender(db, ENV, b.orgId, { senderAddress: 'ventas@ok-propio.es' }, ADMIN), 'senderAddress', 409)
    // Ni siquiera un super_admin lo cambia de dueño por esta vía.
    await expectSenderError(saveOrgSender(db, ENV, b.orgId, { senderAddress: 'ventas@ok-propio.es' }, SUPER), 'senderAddress', 409)
    expect((await orgRow(b.orgId)).emailSenderAddress).toBeNull()
  })

  it('un dominio que ya estaba en Resend sin dueño en INMO sólo lo asigna un super_admin', async () => {
    await expectSenderError(saveOrgSender(db, ENV, a.orgId, { senderAddress: 'hola@ajeno.es' }, ADMIN), 'senderAddress', 409)
    const { view } = await saveOrgSender(db, ENV, a.orgId, { senderAddress: 'hola@ajeno.es' }, SUPER)
    expect(view.domain).toMatchObject({ name: 'ajeno.es', verified: true })
    expect(await emailDomainOwner(db, 'ajeno.es')).toBe(a.orgId)
  })

  it('no acepta Gmail ni el dominio de la plataforma como remitente; sí como «Responder a»', async () => {
    await expectSenderError(saveOrgSender(db, ENV, a.orgId, { senderAddress: 'inmobiliaria@gmail.com' }, ADMIN), 'senderAddress')
    await expectSenderError(saveOrgSender(db, ENV, a.orgId, { senderAddress: 'yo@serendipiaagency.com' }, ADMIN), 'senderAddress')
    const { view } = await saveOrgSender(db, ENV, a.orgId, { senderAddress: '', replyTo: 'inmobiliaria@gmail.com' }, ADMIN)
    expect(view.domain).toBeNull()
    expect(view.effective).toEqual({ mode: 'platform', fromHeader: 'Remite A <info@serendipiaagency.com>', replyTo: 'inmobiliaria@gmail.com' })
    expect(calls.filter((c) => c.startsWith('POST /domains'))).toHaveLength(0)
  })

  it('valida direcciones y destinatarios antes de escribir nada', async () => {
    await expectSenderError(saveOrgSender(db, ENV, a.orgId, { senderAddress: 'no-es-email' }, ADMIN), 'senderAddress')
    await expectSenderError(saveOrgSender(db, ENV, a.orgId, { replyTo: 'tampoco' }, ADMIN), 'replyTo')
    await expectSenderError(saveOrgSender(db, ENV, a.orgId, { internalRecipients: ['bien@x.es', 'mal'] }, ADMIN), 'internalRecipients')
    expect((await orgRow(a.orgId)).emailSenderAddress).toBeNull()
  })

  it('cambiar de dominio vuelve a «sin verificar»; el mismo dominio conserva la verificación', async () => {
    await saveOrgSender(db, ENV, a.orgId, { senderAddress: 'hola@ok-uno.es' }, ADMIN)
    await verifyOrgSender(db, ENV, a.orgId)
    await saveOrgSender(db, ENV, a.orgId, { senderAddress: 'ventas@ok-uno.es' }, ADMIN)
    expect((await orgRow(a.orgId)).emailSenderDomainVerified).toBe(1)
    const { view } = await saveOrgSender(db, ENV, a.orgId, { senderAddress: 'hola@ok-dos.es' }, ADMIN)
    expect(view.domain).toMatchObject({ name: 'ok-dos.es', verified: false })
    expect(view.effective.mode).toBe('platform')
  })

  it('sin RESEND_API_KEY guarda la dirección y lo dice; con una clave sólo de envío explica qué falta', async () => {
    const off = await saveOrgSender(db, {}, a.orgId, { senderAddress: 'hola@sinclave.es' }, ADMIN)
    expect(off.view.providerConnected).toBe(false)
    expect(off.view.domain).toMatchObject({ status: 'not_connected', verified: false })
    expect(off.view.domain!.error).toMatch(/RESEND_API_KEY/)

    forceError = { status: 401, message: 'This API key is restricted to only send emails' }
    const restricted = await saveOrgSender(db, ENV, b.orgId, { senderAddress: 'hola@restringida.es' }, ADMIN)
    expect(restricted.view.domain).toMatchObject({ status: 'error', verified: false })
    expect(restricted.view.domain!.error).toMatch(/Full access/)
    expect((await orgRow(b.orgId)).emailSenderAddress).toBe('hola@restringida.es')
  })

  it('la vista sincroniza la verificación con lo que diga Resend ahora', async () => {
    await saveOrgSender(db, ENV, a.orgId, { senderAddress: 'hola@ok-sync.es' }, ADMIN)
    const d = [...domains.values()].find((x) => x.name === 'ok-sync.es')!
    d.status = 'verified' // verificado desde el panel de Resend
    const v = await orgSenderView(db, ENV, a.orgId)
    expect(v.domain?.verified).toBe(true)
    expect((await orgRow(a.orgId)).emailSenderDomainVerified).toBe(1)
  })
})
