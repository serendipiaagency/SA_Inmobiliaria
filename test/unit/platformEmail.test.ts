import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { PLATFORM_EMAIL_DEFAULTS, PLATFORM_TEMPLATES, platformAdminRecipients, platformEmailConfig, sendPlatformEmail, summarizeEmailResults } from '../../server/utils/email/platform'
import { TEMPLATES } from '../../server/utils/email/templates'
import { htmlToText } from '../../server/utils/email/layout'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * Email de PLATAFORMA (alta y estado de empresas): sale siempre con el
 * remitente corporativo central `INMO <info@serendipiaagency.com>` — nunca
 * con la identidad que cada empresa configura para sus clientes —, deja
 * rastro en email_log, no se repite si se pide `once`, y un fallo del
 * proveedor no se disfraza de envío.
 */
let db: any
let org: TenantFixture
let sent: any[]

const KEY = { RESEND_API_KEY: 're_test_placeholder' }

function stubResend(status = 200) {
  sent = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)))
      return status === 200 ? new Response(JSON.stringify({ id: `re_${sent.length}` }), { status }) : new Response(JSON.stringify({ message: 'The serendipiaagency.com domain is not verified' }), { status })
    }),
  )
}

beforeEach(async () => {
  ;({ db } = createTestDb())
  org = await seedTenant(db, 'PlatformMail')
  // La empresa tiene su propia identidad de email verificada: el email de
  // plataforma NO debe usarla.
  await db.update(schema.organizations).set({ emailSenderName: 'Empresa Propia', emailSenderAddress: 'hola@empresa-propia.es', emailSenderDomainVerified: 1, emailReplyTo: 'ventas@empresa-propia.es' }).where(eq(schema.organizations.id, org.orgId))
})
afterEach(() => vi.unstubAllGlobals())

describe('platformEmailConfig', () => {
  it('por defecto: INMO <info@serendipiaagency.com>, y responder-a la misma dirección', () => {
    expect(PLATFORM_EMAIL_DEFAULTS).toEqual({ fromName: 'INMO', fromAddress: 'info@serendipiaagency.com' })
    expect(platformEmailConfig({})).toEqual({ fromName: 'INMO', fromAddress: 'info@serendipiaagency.com', fromHeader: 'INMO <info@serendipiaagency.com>', replyTo: 'info@serendipiaagency.com' })
  })

  it('el responder-a se configura aparte, sin tocar el remitente', () => {
    const c = platformEmailConfig({ PLATFORM_EMAIL_REPLY_TO: 'soporte@serendipiaagency.com' })
    expect(c.fromHeader).toBe('INMO <info@serendipiaagency.com>')
    expect(c.replyTo).toBe('soporte@serendipiaagency.com')
  })

  it('un valor configurado mal formado no se usa: se queda el remitente corporativo', () => {
    // El nombre no puede romper la cabecera From: se quitan < > ".
    expect(platformEmailConfig({ PLATFORM_EMAIL_FROM_NAME: '<script>' }).fromHeader).toBe('script <info@serendipiaagency.com>')
    expect(platformEmailConfig({ PLATFORM_EMAIL_FROM_ADDRESS: 'no-es-un-email' }).fromAddress).toBe('info@serendipiaagency.com')
  })
})

describe('sendPlatformEmail', () => {
  it('TODOS los templates de plataforma salen de INMO <info@serendipiaagency.com>, nunca con la identidad de la empresa', async () => {
    stubResend()
    const data = { companyName: 'Empresa Propia', name: 'Ana', email: 'ana@empresa-propia.es', loginUrl: 'https://inmo.test/admin/login', setPasswordUrl: 'https://inmo.test/reset-password/tok', adminUrl: 'https://inmo.test/admin/organizations/1', previousStatus: 'Activa', newStatus: 'Suspendida', registeredAt: '2026-10-02 10:00:00', source: 'Registro web', accessStatus: 'Activa' }
    for (const template of PLATFORM_TEMPLATES) {
      const [r] = await sendPlatformEmail(db, KEY, { organizationId: org.orgId, template, to: 'ana@empresa-propia.es', data })
      expect(r!.status).toBe('sent')
    }
    expect(sent).toHaveLength(PLATFORM_TEMPLATES.length)
    for (const body of sent) {
      expect(body.from).toBe('INMO <info@serendipiaagency.com>')
      expect(body.reply_to).toBe('info@serendipiaagency.com')
      expect(body.from).not.toContain('empresa-propia')
      expect(body.text).toBeTruthy() // versión de texto plano
    }
    const rows = await db.select().from(schema.emailLog).where(eq(schema.emailLog.organizationId, org.orgId))
    expect(rows).toHaveLength(PLATFORM_TEMPLATES.length)
    expect(rows.every((r: any) => r.fromHeader === 'INMO <info@serendipiaagency.com>' && r.status === 'sent' && r.kind === 'transactional')).toBe(true)
  })

  it('ningún template de plataforma imprime una contraseña aunque llegue en los datos', () => {
    for (const template of PLATFORM_TEMPLATES) {
      const data = { companyName: 'X', name: 'Y', email: 'y@x.es', password: 'Contraseña-Secreta-123', passwordHash: 'pbkdf2$1$abc$def' }
      const html = TEMPLATES[template].body(data, 'es') + TEMPLATES[template].subject(data, 'es')
      expect(html).not.toContain('Contraseña-Secreta-123')
      expect(html).not.toContain('pbkdf2$')
    }
  })

  it('escapa lo que escribe quien se registra (nombre de empresa)', async () => {
    stubResend()
    await sendPlatformEmail(db, KEY, { organizationId: org.orgId, template: 'admin_company_registered', to: 'super@inmo.test', data: { companyName: '<img src=x onerror=alert(1)>', email: 'a@b.es' } })
    expect(sent[0].html).not.toContain('<img src=x')
    expect(sent[0].html).toContain('&lt;img')
  })

  it('once: un reintento de la misma petición no manda dos bienvenidas', async () => {
    stubResend()
    const opts = { organizationId: org.orgId, template: 'company_registration_welcome' as const, to: 'Nueva@Empresa.es', data: { companyName: 'Nueva', email: 'nueva@empresa.es' }, once: true }
    const [first] = await sendPlatformEmail(db, KEY, opts)
    const [second] = await sendPlatformEmail(db, KEY, opts)
    expect(first!.status).toBe('sent')
    expect(second!.status).toBe('skipped')
    expect(sent).toHaveLength(1)
    const rows = await db.select().from(schema.emailLog).where(eq(schema.emailLog.template, 'company_registration_welcome'))
    expect(rows).toHaveLength(1)
    expect(rows[0].recipient).toBe('nueva@empresa.es')
  })

  it('proveedor que rechaza (dominio sin verificar): queda en cola para reintentar, nunca «enviado»', async () => {
    stubResend(403)
    const results = await sendPlatformEmail(db, KEY, { organizationId: org.orgId, template: 'company_registration_welcome', to: 'x@y.es', data: { companyName: 'X', email: 'x@y.es' } })
    expect(results[0]!.status).toBe('queued')
    expect(results[0]!.connected).toBe(true)
    expect(summarizeEmailResults(results)).toBe('queued')
    const [row] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.id, results[0]!.logId!))
    expect(row.status).toBe('queued')
    expect(row.fromHeader).toBe('INMO <info@serendipiaagency.com>') // no se cambia el remitente para «arreglarlo»
    expect(row.errorMessage).toContain('not verified')
  })

  it('sin RESEND_API_KEY: se registra, no se envía, y el resumen lo dice', async () => {
    const results = await sendPlatformEmail(db, {}, { organizationId: org.orgId, template: 'company_admin_invite', to: 'x@y.es', data: { name: 'X', companyName: 'Y', email: 'x@y.es', setPasswordUrl: 'https://inmo.test/reset-password/t' } })
    expect(results[0]!.connected).toBe(false)
    expect(summarizeEmailResults(results)).toBe('not_configured')
    expect(summarizeEmailResults([])).toBe('none')
  })
})

describe('platformAdminRecipients', () => {
  it('usa PLATFORM_ADMIN_NOTIFY_EMAILS si existe; si no, las cuentas super_admin — nunca los admins de empresa', async () => {
    expect(await platformAdminRecipients(db, { PLATFORM_ADMIN_NOTIFY_EMAILS: 'Ops@Serendipiaagency.com, mal, ops@serendipiaagency.com' })).toEqual(['ops@serendipiaagency.com'])
    const ts = '2026-01-01 00:00:00'
    await db.insert(schema.users).values({ name: 'Super', email: 'super@inmo.test', password: 'x', role: 'super_admin', createdAt: ts, updatedAt: ts })
    const recipients = await platformAdminRecipients(db, {})
    // El super admin sembrado por las migraciones y el nuevo; el admin de la empresa, no.
    expect(recipients).toContain('super@inmo.test')
    const supers = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.role, 'super_admin'))
    expect(recipients.sort()).toEqual(supers.map((u: { email: string }) => u.email.toLowerCase()).sort())
    const [orgAdmin] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, org.userId))
    expect(recipients).not.toContain(orgAdmin.email.toLowerCase())
  })
})

describe('htmlToText — la versión de texto plano', () => {
  it('conserva los enlaces con su URL, quita etiquetas y decodifica una sola vez', () => {
    const text = htmlToText('<style>p{}</style><h1>Hola</h1><p>Entra <a href="https://inmo.test/admin/login" style="x">Acceder a INMO</a></p><p>5 &lt; 6 &amp;lt; ok</p>')
    expect(text).toContain('Hola')
    expect(text).toContain('Acceder a INMO (https://inmo.test/admin/login)')
    expect(text).toContain('5 < 6 &lt; ok')
    expect(text).not.toMatch(/<[a-z]/i)
  })
})
