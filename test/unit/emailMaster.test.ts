import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { htmlToText } from '../../server/utils/email/layout'
import { greetingNameOf, renderMasterEmail } from '../../server/utils/email/master'
import { PORTAL_INMO_TEMPLATES, isPortalInmoTemplate, renderTemplateEmail } from '../../server/utils/email/render'
import { sendInternalNotification, sendTransactionalEmail } from '../../server/utils/email/send'
import { TEMPLATES, type TemplateKey } from '../../server/utils/email/templates'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * Plantilla maestra de los emails propios de Portal INMO (docs/email.md): la
 * misma estructura en todos, el remitente central, el saludo sin huecos, el
 * botón sólo con una URL real, y los emails de cada inmobiliaria a SUS
 * clientes sin tocar.
 */

const CTX = { branding: { companyName: 'Agencia' }, contactEmail: 'info@serendipiaagency.com' }
const DATA = {
  name: 'Lucía',
  email: 'lucia@agencia.es',
  companyName: 'Agencia Costa',
  loginUrl: 'https://portal.test/admin/login',
  setPasswordUrl: 'https://portal.test/reset-password/tok',
  resetUrl: 'https://portal.test/reset-password/tok',
  adminUrl: 'https://portal.test/admin/leads/1',
  inboxUrl: 'https://portal.test/admin/comunicaciones?conversation=1',
  previousStatus: 'Activa',
  newStatus: 'Suspendida',
  registeredAt: '2026-10-07 10:00',
  changedAt: '2026-10-07 10:00',
  source: 'Registro web',
  accessStatus: 'Activa',
  message: 'Hola, me interesa el ático.',
  preview: 'Hola, ¿sigue disponible?',
  contactName: 'Marta',
  phone: '+34 600 000 000',
  domain: 'agencia.es',
  organizationName: 'Agencia Costa',
  error: 'DNS',
  checkedAt: '10:00',
  title: 'Contrato de arras',
  clientName: 'Pablo',
  acceptedAt: '2026-10-07',
}

describe('plantilla maestra: estructura', () => {
  it('los emails propios de Portal INMO son los de plataforma, cuenta, sistema y avisos al equipo; los de clientes, no', () => {
    for (const k of ['company_registration_welcome', 'admin_company_registered', 'company_admin_invite', 'company_status_changed', 'company_deactivated', 'user_welcome', 'password_reset', 'lead_created', 'contact_message', 'whatsapp_message_received', 'domain_check_failed'] as TemplateKey[]) {
      expect(isPortalInmoTemplate(k), k).toBe(true)
    }
    for (const k of ['appointment_created', 'appointment_reminder_24h', 'contract_sent', 'deposit_received', 'payment_failed', 'saved_search_alert', 'web_thread_reply'] as TemplateKey[]) {
      expect(isPortalInmoTemplate(k), k).toBe(false)
    }
  })

  it('todas comparten la misma maqueta: cabecera, contacto, pie; sin huecos, sin localhost, sin scripts ni imágenes', () => {
    for (const key of PORTAL_INMO_TEMPLATES) {
      const { html, subject } = renderTemplateEmail(key, DATA, 'es', CTX)
      expect(html, key).toContain('Portal <span')
      expect(html).toContain('TU ESPACIO<br>INMOBILIARIO')
      expect(html).toContain('¿Hablamos?')
      expect(html).toContain('Nuestro equipo está aquí para ayudarte.')
      expect(html).toContain('href="mailto:info@serendipiaagency.com"')
      expect(html).toContain('PORTAL INMO · GESTIÓN INMOBILIARIA')
      expect(html).toContain('Este correo se ha generado desde la plataforma.')
      expect(html).toContain('Seguimos a tu lado.')
      expect(html).toContain('El equipo de Portal INMO')
      for (const bad of ['undefined', 'null', '{{', 'localhost', '<script', '<img', '<iframe', '<form']) expect(html.toLowerCase(), `${key}: ${bad}`).not.toContain(bad)
      expect(subject).not.toMatch(/\bINMO\b(?<!Portal INMO)/) // el nombre es «Portal INMO», nunca «INMO» a secas
    }
  })

  it('los colores y medidas salen de la referencia aprobada', () => {
    const { html } = renderTemplateEmail('user_welcome', DATA, 'es', CTX)
    for (const token of ['#EDF0EB', '#172C22', '#EE856E', '#E4765F', '#365043', '#BA513C', '#536057', '#CC553F', '#E4E9E1', '#E4EBDF', '#7A8576', 'max-width:600px', 'border-radius:8px']) expect(html).toContain(token)
  })

  it('el email de bienvenida reproduce el contenido de la referencia', () => {
    const { html } = renderTemplateEmail('company_registration_welcome', DATA, 'es', CTX)
    expect(html).toContain('Conectados con tu actividad')
    expect(html).toContain('Te damos la bienvenida a<br>Portal INMO')
    expect(html).toContain('Hola, Lucía:')
    expect(html).toContain('Tu cuenta ya está preparada. Accede a la plataforma para empezar a gestionar tu actividad inmobiliaria.')
    expect(html).toContain('href="https://portal.test/admin/login"')
    expect(html).toContain('Acceder a mi cuenta')
  })

  it('el aviso al super admin lleva los datos de la empresa y «Ver empresa»', () => {
    const { html } = renderTemplateEmail('admin_company_registered', { ...DATA, adminUrl: 'https://portal.test/admin/organizations/9' }, 'es', CTX)
    expect(html).toContain('Nueva actividad en Portal INMO')
    expect(html).toContain('Nueva empresa<br>registrada')
    expect(html).toContain('Empresa:</strong> Agencia Costa')
    expect(html).toContain('Correo:</strong> lucia@agencia.es')
    expect(html).toContain('Estado:</strong> Activa')
    expect(html).toContain('href="https://portal.test/admin/organizations/9"')
    expect(html).toContain('Ver empresa')
  })
})

describe('plantilla maestra: contenido dinámico', () => {
  it('sin nombre, «Hola:» — nunca «Hola, undefined:», «Hola, null:» ni «Hola, :»', () => {
    for (const name of [undefined, null, '', '   ', 'undefined', 'null', '{{nombre}}']) {
      expect(greetingNameOf(name)).toBeNull()
      const html = renderMasterEmail({ eyebrow: 'x', title: 'y', greetingName: name as any, paragraphs: ['z'] }, { locale: 'es', subject: 's', contactEmail: 'info@serendipiaagency.com' })
      expect(html).toContain('>Hola:</p>')
      expect(html).not.toMatch(/Hola, (undefined|null|\{\{|:)/)
    }
  })

  it('el botón sólo aparece con una URL http(s); javascript: o un hueco no generan botón', () => {
    const base = { eyebrow: 'x', title: 'y', paragraphs: ['z'] }
    const ctx = { locale: 'es' as const, subject: 's', contactEmail: 'info@serendipiaagency.com' }
    expect(renderTemplateEmail('password_reset', { resetUrl: 'javascript:alert(1)' }, 'es', CTX).html).not.toContain('javascript:')
    expect(renderTemplateEmail('password_reset', {}, 'es', CTX).html).not.toContain('Restablecer contraseña</a>')
    expect(renderMasterEmail({ ...base, cta: { label: 'Ver cita', url: 'https://portal.test/admin/visitas/3' } }, ctx)).toContain('href="https://portal.test/admin/visitas/3"')
  })

  it('escapa lo que escribe un cliente o quien se registra', () => {
    const { html } = renderTemplateEmail('contact_message', { ...DATA, name: '<b>x</b>', message: '<script>alert(1)</script>' }, 'es', CTX)
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<b>x</b>')
  })

  it('títulos, nombres y textos largos no rompen la estructura', () => {
    const long = 'Inmobiliaria con un nombre comercial larguísimo de verdad, S.L.'.repeat(3)
    const { html } = renderTemplateEmail('company_registration_welcome', { ...DATA, name: long, companyName: long }, 'es', CTX)
    expect(html.match(/<table/g)!.length).toBe(renderTemplateEmail('company_registration_welcome', DATA, 'es', CTX).html.match(/<table/g)!.length)
    expect(html).toContain('¿Hablamos?')
  })

  it('nunca imprime una contraseña ni un hash aunque lleguen en los datos', () => {
    for (const key of PORTAL_INMO_TEMPLATES) {
      const { html, subject } = renderTemplateEmail(key, { ...DATA, password: 'Secreta-123', passwordHash: 'pbkdf2$1$a$b' }, 'es', CTX)
      expect(html + subject).not.toContain('Secreta-123')
      expect(html + subject).not.toContain('pbkdf2$')
    }
  })

  it('texto plano: contenido, botón como URL, contacto y pie; sin el pre-encabezado repetido', () => {
    const { html } = renderTemplateEmail('company_registration_welcome', DATA, 'es', CTX)
    const text = htmlToText(html)
    expect(text).toContain('Hola, Lucía:')
    expect(text).toContain('Acceder a mi cuenta (https://portal.test/admin/login)')
    expect(text).toContain('info@serendipiaagency.com (mailto:info@serendipiaagency.com)')
    expect(text).toContain('PORTAL INMO · GESTIÓN INMOBILIARIA')
    expect(text.split('Tu cuenta ya está preparada').length - 1).toBe(1)
    expect(text).not.toMatch(/<[a-z]/i)
  })

  it('inglés: misma maqueta, textos en inglés', () => {
    const { html } = renderTemplateEmail('password_reset', DATA, 'en', CTX)
    expect(html).toContain('Shall we talk?')
    expect(html).toContain('Hello, Lucía:')
    expect(html).toContain('PORTAL INMO · GESTIÓN INMOBILIARIA')
  })
})

describe('plantilla maestra: remitente', () => {
  let db: any
  let org: TenantFixture
  let sent: any[]
  beforeEach(async () => {
    ;({ db } = createTestDb())
    org = await seedTenant(db, 'MasterMail')
    // La empresa tiene su dominio verificado y un buzón interno con una cuenta suya.
    await db
      .update(schema.organizations)
      .set({ emailSenderName: 'Agencia Propia', emailSenderAddress: 'hola@agencia-propia.es', emailSenderDomainVerified: 1, emailReplyTo: 'ventas@agencia-propia.es', emailInternalRecipientsJson: JSON.stringify(['equipo@agencia-propia.es']) })
      .where(eq(schema.organizations.id, org.orgId))
    const ts = '2026-01-01 00:00:00'
    await db.insert(schema.users).values({ name: 'Elena Equipo', email: 'equipo@agencia-propia.es', password: 'x', role: 'admin', organizationId: org.orgId, createdAt: ts, updatedAt: ts })
    sent = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ id: `re_${sent.length}` }), { status: 200 }) }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('un aviso al equipo sale de «Portal INMO <info@…>» con la plantilla maestra y saluda por su nombre', async () => {
    await sendInternalNotification(db, { RESEND_API_KEY: 're_test' }, org.orgId, 'lead_created', { name: 'Pablo', email: 'pablo@x.es', source: 'web', adminUrl: 'https://portal.test/admin/leads/7' })
    expect(sent).toHaveLength(1)
    expect(sent[0].from).toBe('Portal INMO <info@serendipiaagency.com>')
    expect(sent[0].reply_to).toBe('info@serendipiaagency.com')
    expect(sent[0].html).toContain('Hola, Elena Equipo:')
    expect(sent[0].html).toContain('Tienes un<br>nuevo lead')
    expect(sent[0].html).toContain('href="https://portal.test/admin/leads/7"')
  })

  it('lo que la agencia manda a SUS clientes sigue con su identidad y su maqueta', async () => {
    await sendTransactionalEmail(db, { RESEND_API_KEY: 're_test' }, { organizationId: org.orgId, template: 'appointment_created', to: 'cliente@x.es', data: { name: 'Ana', title: 'Visita', date: '2026-10-08', time: '10:00' } })
    expect(sent[0].from).toBe('Agencia Propia <hola@agencia-propia.es>')
    expect(sent[0].html).not.toContain('¿Hablamos?')
    expect(sent[0].html).not.toContain('PORTAL INMO · GESTIÓN INMOBILIARIA')
  })

  it('cada template propio de Portal INMO tiene contenido maestro (no hay HTML suelto por módulo)', () => {
    for (const key of PORTAL_INMO_TEMPLATES) {
      expect(TEMPLATES[key].master, key).toBeTypeOf('function')
      expect(TEMPLATES[key].body, key).toBeUndefined()
    }
  })
})
