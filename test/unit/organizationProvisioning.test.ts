import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { verifyPassword } from '../../server/utils/auth'
import { SELF_REGISTRATION_POLICY, decideOrganizationAccess, initialAccessFor } from '../../server/utils/organizations/access'
import { ProvisioningError, checkDomainAvailability, provisionOrganization } from '../../server/utils/organizations/provisioning'
import { createTestDb } from './helpers/tenantFixtures'

/**
 * Empresas — el núcleo compartido por los dos canales de alta (Sistemas >
 * Empresas > + Nuevo y el registro público) y la política de acceso que
 * deciden el login y la sesión. Contra la base de datos real (migraciones
 * reales, incluida la 0085).
 */
let db: any
/** Las migraciones ya siembran la organización y el super admin de la plataforma. */
let seededOrgs = 0

beforeEach(async () => {
  ;({ db } = createTestDb())
  seededOrgs = (await db.select({ id: schema.organizations.id }).from(schema.organizations)).length
})

/** Empresas creadas por el test (sin contar las sembradas por las migraciones). */
const orgCount = async () => (await db.select({ id: schema.organizations.id }).from(schema.organizations)).length - seededOrgs

async function expectProvisioningError(p: Promise<unknown>, field: string, step: string, statusCode?: number) {
  let error: unknown
  try {
    await p
  } catch (e) {
    error = e
  }
  expect(error).toBeInstanceOf(ProvisioningError)
  const pe = error as ProvisioningError
  expect(pe.field).toBe(field)
  expect(pe.step).toBe(step)
  if (statusCode) expect(pe.statusCode).toBe(statusCode)
}

describe('decideOrganizationAccess — la política de acceso', () => {
  it('activa + aprobada + sin pago requerido → entra (también los valores por defecto de las empresas antiguas)', () => {
    expect(decideOrganizationAccess({ status: 'active', approvalStatus: 'approved', billingStatus: 'not_required' })).toEqual({ allowed: true })
    expect(decideOrganizationAccess({ status: 'active', approvalStatus: 'approved', billingStatus: 'active' })).toEqual({ allowed: true })
    expect(decideOrganizationAccess({ status: null, approvalStatus: null, billingStatus: null })).toEqual({ allowed: true })
  })

  it('deniega con un motivo propio cada estado que no puede entrar', () => {
    const reason = (o: any) => {
      const d = decideOrganizationAccess(o)
      return d.allowed ? 'allowed' : d.reason
    }
    expect(reason({ status: 'suspended', approvalStatus: 'approved', billingStatus: 'not_required' })).toBe('suspended')
    expect(reason({ status: 'active', approvalStatus: 'pending', billingStatus: 'not_required' })).toBe('pending_approval')
    expect(reason({ status: 'active', approvalStatus: 'rejected', billingStatus: 'not_required' })).toBe('rejected')
    expect(reason({ status: 'active', approvalStatus: 'approved', billingStatus: 'pending' })).toBe('pending_payment')
    expect(reason({ status: 'active', approvalStatus: 'approved', billingStatus: 'past_due' })).toBe('payment_past_due')
  })

  it('falla cerrada ante un valor desconocido', () => {
    for (const o of [
      { status: 'archived', approvalStatus: 'approved', billingStatus: 'not_required' },
      { status: 'active', approvalStatus: 'maybe', billingStatus: 'not_required' },
      { status: 'active', approvalStatus: 'approved', billingStatus: 'free-forever' },
    ]) {
      const d = decideOrganizationAccess(o)
      expect(d.allowed).toBe(false)
      if (!d.allowed) expect(d.reason).toBe('unknown_state')
    }
  })

  it('el mensaje de denegación habla a la empresa, sin datos internos', () => {
    const d = decideOrganizationAccess({ status: 'suspended', approvalStatus: 'approved', billingStatus: 'not_required' })
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.message).toMatch(/suspendido/)
  })

  it('política ACTUAL del autorregistro: acceso inmediato (aprobada, sin pago)', () => {
    expect(SELF_REGISTRATION_POLICY).toEqual({ approvalStatus: 'approved', billingStatus: 'not_required' })
    expect(initialAccessFor('self_service')).toEqual({ approvalStatus: 'approved', billingStatus: 'not_required' })
    expect(decideOrganizationAccess({ status: 'active', ...initialAccessFor('self_service') }).allowed).toBe(true)
  })
})

describe('provisionOrganization — alta desde Sistemas > Empresas (source admin)', () => {
  it('con los datos mínimos crea sólo la empresa, con su origen y acceso por defecto', async () => {
    const res = await provisionOrganization(db, { source: 'admin', organization: { name: 'Costa Norte' } })
    expect(res.admin).toBeNull()
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, res.organization.id))
    expect(org).toMatchObject({ name: 'Costa Norte', slug: 'costa-norte', status: 'active', registrationSource: 'admin', approvalStatus: 'approved', billingStatus: 'not_required', companyName: null })
    expect(await db.select().from(schema.users).where(eq(schema.users.organizationId, org.id))).toHaveLength(0)
  })

  it('guarda dominio normalizado, color en mayúsculas, idioma y almacenamiento; el nombre comercial igual al nombre no se duplica', async () => {
    const res = await provisionOrganization(db, {
      source: 'admin',
      organization: { name: 'Marina Homes', companyName: 'Marina Homes', domain: 'https://WWW.Marina-Homes.es/inicio', brandColor: '#1f6f5c', emailLocale: 'en', storageLimitGb: 12, status: 'suspended' },
    })
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, res.organization.id))
    expect(org.domain).toBe('marina-homes.es') // sin «www.», como normalizeHost() en el middleware de tenant
    expect(org.brandColor).toBe('#1F6F5C')
    expect(org.emailLocale).toBe('en')
    expect(org.storageBytesLimit).toBe(12 * 1024 ** 3)
    expect(org.status).toBe('suspended')
    expect(org.companyName).toBeNull()
  })

  it('el administrador inicial es «admin» de ESA empresa, sin contraseña utilizable hasta que acepte la invitación', async () => {
    const res = await provisionOrganization(db, { source: 'admin', organization: { name: 'Sierra' }, initialAdmin: { name: 'Lucía', email: 'Lucia@Sierra.es' } })
    expect(res.admin).toMatchObject({ name: 'Lucía', email: 'lucia@sierra.es', role: 'admin', hasPassword: false })
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, res.admin!.id))
    expect(user.organizationId).toBe(res.organization.id)
    expect(user.role).toBe('admin')
    expect(user.permissions).toBeNull()
    expect(user.password).toMatch(/^pbkdf2\$/)
    expect(await verifyPassword('', user.password)).toBe(false)
  })

  it('dominio ocupado → 409 en el paso Empresa, sin crear nada', async () => {
    await provisionOrganization(db, { source: 'admin', organization: { name: 'Uno', domain: 'uno.es' } })
    const before = await orgCount()
    await expectProvisioningError(provisionOrganization(db, { source: 'admin', organization: { name: 'Dos', domain: 'UNO.es' } }), 'domain', 'empresa', 409)
    expect(await orgCount()).toBe(before)
  })

  it('rechaza dominios inválidos y los reservados de la plataforma', async () => {
    await expectProvisioningError(provisionOrganization(db, { source: 'admin', organization: { name: 'X', domain: 'no es un dominio' } }), 'domain', 'empresa')
    await expectProvisioningError(provisionOrganization(db, { source: 'admin', organization: { name: 'X', domain: 'algo.workers.dev' } }), 'domain', 'empresa')
    await expectProvisioningError(provisionOrganization(db, { source: 'admin', organization: { name: 'X', domain: 'localhost' } }), 'domain', 'empresa')
  })

  it('valida color, idioma y almacenamiento en su paso', async () => {
    await expectProvisioningError(provisionOrganization(db, { source: 'admin', organization: { name: 'X', brandColor: 'verde' } }), 'brandColor', 'identidad')
    await expectProvisioningError(provisionOrganization(db, { source: 'admin', organization: { name: 'X', emailLocale: 'fr' } }), 'emailLocale', 'configuracion')
    await expectProvisioningError(provisionOrganization(db, { source: 'admin', organization: { name: 'X', storageLimitGb: 0 } }), 'storageLimitGb', 'configuracion')
    await expectProvisioningError(provisionOrganization(db, { source: 'admin', organization: { name: 'X', storageLimitGb: 2.5 } }), 'storageLimitGb', 'configuracion')
    await expectProvisioningError(provisionOrganization(db, { source: 'admin', organization: { name: '   ' } }), 'name', 'empresa')
    await expectProvisioningError(provisionOrganization(db, { source: 'admin', organization: { name: 'X', status: 'deleted' } }), 'status', 'empresa')
    expect(await orgCount()).toBe(0)
  })

  it('doble envío del asistente: la misma empresa en menos de un minuto → 409, una sola empresa', async () => {
    await provisionOrganization(db, { source: 'admin', organization: { name: 'Doble Clic' } })
    await expectProvisioningError(provisionOrganization(db, { source: 'admin', organization: { name: 'Doble Clic' } }), 'name', 'empresa', 409)
    expect(await orgCount()).toBe(1)
  })
})

describe('provisionOrganization — registro público (source self_service)', () => {
  it('crea empresa + administrador con la contraseña elegida; nunca super_admin', async () => {
    const res = await provisionOrganization(db, {
      source: 'self_service',
      organization: { name: 'Inmo Sol', companyName: 'Sol Homes' },
      initialAdmin: { name: 'Sol Homes', email: 'hola@solhomes.es', password: 'MuySegura123' },
    })
    expect(res.organization).toMatchObject({ registrationSource: 'self_service', approvalStatus: 'approved', billingStatus: 'not_required', status: 'active', companyName: 'Sol Homes' })
    expect(res.admin).toMatchObject({ role: 'admin', hasPassword: true })
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, res.admin!.id))
    expect(user.role).toBe('admin')
    expect(user.organizationId).toBe(res.organization.id)
    expect(user.password).not.toContain('MuySegura123') // nunca en claro
    expect(await verifyPassword('MuySegura123', user.password)).toBe(true)
    const supers = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.role, 'super_admin'))
    expect(supers.map((u: { email: string }) => u.email)).not.toContain('hola@solhomes.es')
  })

  it('el canal público no fija dominio, color, almacenamiento ni un estado distinto de activo', async () => {
    const res = await provisionOrganization(db, {
      source: 'self_service',
      organization: { name: 'Pirata', domain: 'secuestro.es', brandColor: '#000000', storageLimitGb: 999 },
      initialAdmin: { name: 'P', email: 'p@pirata.es', password: 'MuySegura123' },
    })
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, res.organization.id))
    expect(org.domain).toBeNull()
    expect(org.brandColor).toBeNull()
    expect(org.storageBytesLimit).toBe(5_368_709_120)
    await expectProvisioningError(
      provisionOrganization(db, { source: 'self_service', organization: { name: 'Otra', status: 'suspended' }, initialAdmin: { name: 'O', email: 'o@otra.es', password: 'MuySegura123' } }),
      'status',
      'empresa',
    )
  })

  it('exige contraseña de al menos 8 caracteres', async () => {
    await expectProvisioningError(provisionOrganization(db, { source: 'self_service', organization: { name: 'A' }, initialAdmin: { name: 'A', email: 'a@a.es', password: '' } }), 'password', 'acceso')
    await expectProvisioningError(provisionOrganization(db, { source: 'self_service', organization: { name: 'A' }, initialAdmin: { name: 'A', email: 'a@a.es', password: 'corta' } }), 'password', 'acceso')
    expect(await orgCount()).toBe(0)
  })

  it('correo ya registrado → 409 y ninguna empresa huérfana', async () => {
    await provisionOrganization(db, { source: 'self_service', organization: { name: 'Primera' }, initialAdmin: { name: 'X', email: 'dup@x.es', password: 'MuySegura123' } })
    const before = await orgCount()
    await expectProvisioningError(provisionOrganization(db, { source: 'self_service', organization: { name: 'Segunda' }, initialAdmin: { name: 'X', email: 'DUP@x.es', password: 'MuySegura123' } }), 'email', 'acceso', 409)
    expect(await orgCount()).toBe(before)
  })

  it('compensación: si el usuario no se puede crear (carrera), la empresa recién creada se borra', async () => {
    // Simula que otra petición se quedó el correo entre la comprobación y el insert.
    const racing = new Proxy(db, {
      get(target, prop) {
        if (prop === 'insert') {
          return (table: unknown) =>
            table === schema.users
              ? { values: () => ({ returning: async () => Promise.reject(new Error('UNIQUE constraint failed: users.email')) }) }
              : target.insert(table)
        }
        return Reflect.get(target, prop)
      },
    })
    await expectProvisioningError(provisionOrganization(racing, { source: 'self_service', organization: { name: 'Carrera' }, initialAdmin: { name: 'C', email: 'c@c.es', password: 'MuySegura123' } }), 'email', 'acceso', 409)
    expect(await orgCount()).toBe(0)
  })

  it('slug libre: dos empresas con el mismo nombre no chocan', async () => {
    const a = await provisionOrganization(db, { source: 'self_service', organization: { name: 'Gemela' }, initialAdmin: { name: 'G', email: 'g1@g.es', password: 'MuySegura123' } })
    const b = await provisionOrganization(db, { source: 'self_service', organization: { name: 'Gemela' }, initialAdmin: { name: 'G', email: 'g2@g.es', password: 'MuySegura123' } })
    expect(a.organization.slug).toBe('gemela')
    expect(b.organization.slug).toBe('gemela-2')
  })
})

describe('checkDomainAvailability', () => {
  it('libre, ocupado, y libre para la propia empresa al editarla', async () => {
    const res = await provisionOrganization(db, { source: 'admin', organization: { name: 'Dueña', domain: 'duena.es' } })
    expect(await checkDomainAvailability(db, 'libre.es')).toEqual({ domain: 'libre.es', available: true, message: null })
    expect((await checkDomainAvailability(db, 'Duena.ES')).available).toBe(false)
    expect((await checkDomainAvailability(db, 'duena.es', { excludeOrganizationId: res.organization.id })).available).toBe(true)
    expect(await checkDomainAvailability(db, '')).toEqual({ domain: null, available: true, message: null })
    const invalid = await checkDomainAvailability(db, 'mal dominio')
    expect(invalid.available).toBe(false)
    expect(invalid.domain).toBeNull()
  })
})
