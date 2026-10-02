import { and, eq, gte, like, or } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { isUniqueConstraintError, now, slugify } from '../db'
import { hashPassword } from '../auth'
import { isReservedHost, isValidHostname, normalizeHost } from '../domain'
import { initialAccessFor, ORGANIZATION_STATUSES, type OrganizationStatus, type RegistrationSource } from './access'

/**
 * Provisioning de empresas — UN solo núcleo para los dos canales de alta:
 *
 *   Sistemas > Empresas > + Nuevo  (super admin)        → source 'admin'
 *   Landing → Registro Empresa     (autorregistro web)  → source 'self_service'
 *
 * Crea la organización (el tenant: `organizations` es la tabla de tenants) y,
 * si se pide, su usuario administrador inicial (`users` con organization_id +
 * rol 'admin' es la pertenencia real: no hay tabla de memberships). Nunca crea
 * un super_admin y nunca acepta un id de tenant, un rol o permisos del cliente.
 *
 * Consistencia: D1 no ofrece transacciones interactivas, así que se usa
 * compensación — si el usuario inicial no se puede crear (p. ej. el email ya
 * existe, también en una carrera entre dos peticiones), se borra la
 * organización recién creada, que todavía no tiene nada colgando. Nunca queda
 * una empresa sin su administrador cuando se pidió uno, ni un usuario sin
 * empresa. Los emails y la auditoría van después y nunca deshacen el alta.
 */

export const PASSWORD_MIN_LENGTH = 8
export const EMAIL_LOCALES = ['es', 'en'] as const

export type ProvisioningStep = 'empresa' | 'identidad' | 'configuracion' | 'acceso'

/** Error de validación ligado a un campo y al paso del asistente donde vive. */
export class ProvisioningError extends Error {
  constructor(
    public field: string,
    public step: ProvisioningStep,
    message: string,
    public statusCode = 422,
  ) {
    super(message)
  }
}

export interface ProvisionOrganizationInput {
  source: RegistrationSource
  organization: {
    name: string
    companyName?: string | null
    domain?: string | null
    status?: string | null
    brandColor?: string | null
    emailLocale?: string | null
    /** En GB enteros (la unidad que maneja la UI); null = el valor por defecto de la plataforma. */
    storageLimitGb?: number | null
  }
  initialAdmin?: {
    name: string
    email: string
    /** Si llega, se usa como credencial (mín. 8). Si no, la cuenta queda sin contraseña utilizable y se invita por email. */
    password?: string | null
  } | null
}

export interface ProvisionedOrganization {
  organization: { id: number; name: string; slug: string; companyName: string | null; domain: string | null; status: string; registrationSource: string; approvalStatus: string; billingStatus: string; createdAt: string }
  admin: { id: number; name: string; email: string; role: 'admin'; hasPassword: boolean } | null
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const HEX_RE = /^#[0-9a-fA-F]{6}$/

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** Dominio propio normalizado como lo resuelve server/middleware/00.tenant.ts, o null si no hay. */
export function normalizeOrganizationDomain(raw: unknown): string | null {
  const value = typeof raw === 'string' ? normalizeHost(raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')) : ''
  if (!value) return null
  if (!isValidHostname(value)) throw new ProvisioningError('domain', 'empresa', 'El dominio no es válido. Escríbelo como «inmobiliaria.es», sin «https://» ni rutas.')
  if (isReservedHost(value)) throw new ProvisioningError('domain', 'empresa', 'Ese dominio pertenece a la plataforma y no puede asignarse a una empresa.')
  return value
}

/** ¿Está libre este dominio? (validación inmediata del asistente; la autoridad final es el índice único). */
export async function checkDomainAvailability(db: any, raw: unknown, opts: { excludeOrganizationId?: number } = {}): Promise<{ domain: string | null; available: boolean; message: string | null }> {
  let domain: string | null
  try {
    domain = normalizeOrganizationDomain(raw)
  } catch (e) {
    if (e instanceof ProvisioningError) return { domain: null, available: false, message: e.message }
    throw e
  }
  if (!domain) return { domain: null, available: true, message: null }
  const [taken] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.domain, domain)).limit(1)
  if (taken && taken.id !== opts.excludeOrganizationId) return { domain, available: false, message: 'Este dominio ya está asociado a otra empresa.' }
  return { domain, available: true, message: null }
}

export function validateInitialAdmin(input: ProvisionOrganizationInput['initialAdmin'], opts: { requirePassword: boolean }) {
  if (!input) return null
  const name = text(input.name, 120)
  const email = text(input.email, 200).toLowerCase()
  if (!name) throw new ProvisioningError('adminName', 'acceso', 'Introduce el nombre del administrador.')
  if (!EMAIL_RE.test(email)) throw new ProvisioningError('adminEmail', 'acceso', 'Introduce un correo electrónico válido.')
  const password = typeof input.password === 'string' ? input.password : ''
  if (opts.requirePassword && !password) throw new ProvisioningError('password', 'acceso', 'Introduce una contraseña.')
  if (password && password.length < PASSWORD_MIN_LENGTH) throw new ProvisioningError('password', 'acceso', `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  return { name, email, password: password || null }
}

/** Slug libre derivado del nombre: base, base-2, base-3… (el índice único sigue siendo la autoridad). */
async function freeSlug(db: any, name: string): Promise<string> {
  const base = slugify(name) || 'empresa'
  const rows = await db
    .select({ slug: schema.organizations.slug })
    .from(schema.organizations)
    .where(or(eq(schema.organizations.slug, base), like(schema.organizations.slug, `${base}-%`)))
  const taken = new Set(rows.map((r: { slug: string }) => r.slug))
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Math.floor(Math.random() * 1e6)}`
}

export async function provisionOrganization(db: any, input: ProvisionOrganizationInput): Promise<ProvisionedOrganization> {
  // --- validación (todo antes de escribir nada) -----------------------------
  const name = text(input.organization.name, 120)
  if (!name) throw new ProvisioningError('name', 'empresa', 'Introduce un nombre para la empresa.')
  const companyNameRaw = text(input.organization.companyName, 120)
  const companyName = companyNameRaw && companyNameRaw !== name ? companyNameRaw : null

  const status = (input.organization.status || 'active') as OrganizationStatus
  if (!(ORGANIZATION_STATUSES as readonly string[]).includes(status)) throw new ProvisioningError('status', 'empresa', 'Elige un estado válido para la empresa.')
  if (input.source === 'self_service' && status !== 'active') throw new ProvisioningError('status', 'empresa', 'Estado no permitido.')

  const domain = input.source === 'admin' ? normalizeOrganizationDomain(input.organization.domain) : null

  const brandColorRaw = text(input.organization.brandColor, 7)
  if (brandColorRaw && !HEX_RE.test(brandColorRaw)) throw new ProvisioningError('brandColor', 'identidad', 'El color debe tener el formato #RRGGBB (por ejemplo, #1F6F5C).')
  const brandColor = input.source === 'admin' && brandColorRaw ? brandColorRaw.toUpperCase() : null

  const emailLocale = input.organization.emailLocale || 'es'
  if (!(EMAIL_LOCALES as readonly string[]).includes(emailLocale)) throw new ProvisioningError('emailLocale', 'configuracion', 'Elige un idioma válido.')

  let storageBytesLimit: number | null = null
  if (input.source === 'admin' && input.organization.storageLimitGb != null && String(input.organization.storageLimitGb) !== '') {
    const gb = Number(input.organization.storageLimitGb)
    if (!Number.isInteger(gb) || gb < 1 || gb > 1000) throw new ProvisioningError('storageLimitGb', 'configuracion', 'El almacenamiento debe ser un número entero de GB entre 1 y 1000.')
    storageBytesLimit = gb * 1024 ** 3
  }

  const admin = validateInitialAdmin(input.initialAdmin, { requirePassword: input.source === 'self_service' })
  if (input.source === 'self_service' && !admin) throw new ProvisioningError('adminEmail', 'acceso', 'Introduce el correo y la contraseña de acceso.')

  // --- comprobaciones de unicidad (feedback claro; el índice único decide) --
  if (domain) {
    const [taken] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.domain, domain)).limit(1)
    if (taken) throw new ProvisioningError('domain', 'empresa', 'Este dominio ya está asociado a otra empresa.', 409)
  }
  if (admin) {
    const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, admin.email)).limit(1)
    if (existing) throw emailTaken(input.source)
  }
  // Doble clic en el alta interna: la misma empresa creada hace un momento.
  if (input.source === 'admin') {
    const recent = new Date(Date.now() - 60_000).toISOString().replace('T', ' ').slice(0, 19)
    const [dupe] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(and(eq(schema.organizations.name, name), gte(schema.organizations.createdAt, recent)))
      .limit(1)
    if (dupe) throw new ProvisioningError('name', 'empresa', 'Esta empresa se acaba de crear hace un momento. Revisa el listado de empresas antes de volver a crearla.', 409)
  }

  // Hash antes de escribir nada: si fallara, no queda ninguna fila.
  const passwordHash = admin ? await hashPassword(admin.password || randomUnusablePassword()) : null

  // --- escritura -------------------------------------------------------------
  const access = initialAccessFor(input.source)
  const ts = now()
  let org: any
  for (let attempt = 0; attempt < 3 && !org; attempt++) {
    const slug = await freeSlug(db, name)
    try {
      ;[org] = await db
        .insert(schema.organizations)
        .values({
          name,
          slug: attempt === 0 ? slug : `${slug}-${Math.floor(Math.random() * 10_000)}`,
          domain,
          companyName,
          brandColor,
          status,
          emailLocale,
          // El correo con el que se registra (o el del administrador invitado)
          // es desde el primer día el «Responder a» de sus emails: sin
          // configurar nada, las respuestas de sus clientes le llegan a ella.
          emailReplyTo: admin?.email ?? null,
          ...(storageBytesLimit ? { storageBytesLimit } : {}),
          registrationSource: input.source,
          approvalStatus: access.approvalStatus,
          billingStatus: access.billingStatus,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning()
    } catch (e) {
      if (!isUniqueConstraintError(e)) throw e
      // Carrera: otro alta se quedó el dominio entre la comprobación y el insert.
      if (domain) {
        const [taken] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.domain, domain)).limit(1)
        if (taken) throw new ProvisioningError('domain', 'empresa', 'Este dominio ya está asociado a otra empresa.', 409)
      }
      // Si no, fue el slug: se reintenta con otro.
    }
  }
  if (!org) throw new ProvisioningError('name', 'empresa', 'No se ha podido reservar un identificador para la empresa. Inténtalo de nuevo.', 409)

  let createdAdmin: ProvisionedOrganization['admin'] = null
  if (admin) {
    try {
      const [user] = await db
        .insert(schema.users)
        .values({ organizationId: org.id, name: admin.name, email: admin.email, password: passwordHash!, role: 'admin', permissions: null, createdAt: ts, updatedAt: ts })
        .returning({ id: schema.users.id })
      createdAdmin = { id: user.id, name: admin.name, email: admin.email, role: 'admin', hasPassword: Boolean(admin.password) }
    } catch (e) {
      // Compensación: la empresa recién creada no tiene nada colgando todavía.
      await db.delete(schema.organizations).where(eq(schema.organizations.id, org.id))
      if (isUniqueConstraintError(e)) throw emailTaken(input.source)
      throw e
    }
  }

  return {
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      companyName: org.companyName,
      domain: org.domain,
      status: org.status,
      registrationSource: org.registrationSource,
      approvalStatus: org.approvalStatus,
      billingStatus: org.billingStatus,
      createdAt: org.createdAt,
    },
    admin: createdAdmin,
  }
}

function emailTaken(source: RegistrationSource): ProvisioningError {
  return source === 'self_service'
    ? new ProvisioningError('email', 'acceso', 'Este correo ya tiene una cuenta en INMO. Inicia sesión o recupera tu contraseña.', 409)
    : new ProvisioningError('adminEmail', 'acceso', 'Ya existe un usuario con este correo. Cada correo sólo puede pertenecer a una empresa.', 409)
}

/** Contraseña aleatoria que nadie conoce: la cuenta sólo se activa con el enlace de «definir contraseña». */
function randomUnusablePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
