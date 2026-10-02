import type { H3Event } from 'h3'
import { and, count, desc, eq } from 'drizzle-orm'
import { cfEnv, now, schema, useDb } from '../db'
import { livePropertyCond } from '../properties/trash'
import { createPasswordResetToken, type SessionUser } from '../auth'
import { logAdminAction } from '../audit'
import { getRequestId } from '../requestId'
import { describeUserCreation } from '../sensitiveAudit'
import { platformAdminRecipients, sendPlatformEmail, summarizeEmailResults, type PlatformEmailResult } from '../email/platform'
import { STATUS_LABELS, decideOrganizationAccess, type OrganizationStatus } from './access'
import { PASSWORD_MIN_LENGTH, ProvisioningError, provisionOrganization, type ProvisionedOrganization } from './provisioning'

/**
 * Lo que pasa ALREDEDOR del provisioning (provisioning.ts): quién puede
 * pedirlo, qué se audita, qué emails salen y qué se responde. Los dos
 * canales de alta pasan por aquí y por el mismo provisionOrganization():
 *
 *   createOrganizationFromAdmin()  ← POST /api/admin/organizations (super admin)
 *   registerCompanySelfService()   ← POST /api/auth/login { action: 'register-company' } (público)
 *
 * Los emails y la auditoría van DESPUÉS de crear y nunca deshacen el alta:
 * si Resend falla, la empresa existe igual y la respuesta lo dice tal cual.
 */

export type EmailDelivery = ReturnType<typeof summarizeEmailResults>

const HTTPS_ORIGIN_RE = /^https?:\/\/[^/\s]+$/i

/** Origen público de la plataforma para los enlaces de los emails. */
export function platformBaseUrl(event: H3Event): string {
  const configured = String((cfEnv(event) as Record<string, any>).PLATFORM_BASE_URL || '').trim().replace(/\/+$/, '')
  return HTTPS_ORIGIN_RE.test(configured) ? configured : getRequestURL(event).origin
}

/** Respuesta de error de validación del alta: campo + paso del asistente + mensaje. */
export function provisioningErrorResponse(event: H3Event, e: ProvisioningError) {
  setResponseStatus(event, e.statusCode)
  return { ok: false as const, error: { field: e.field, step: e.step, message: e.message } }
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status as OrganizationStatus]?.label ?? status
}

async function safeSend(fn: () => Promise<PlatformEmailResult[]>): Promise<PlatformEmailResult[]> {
  try {
    return await fn()
  } catch (err) {
    // El alta ya está hecha: un fallo inesperado del email nunca la deshace.
    console.error('[empresas] email de plataforma no enviado', err instanceof Error ? err.message : 'error')
    return []
  }
}

// ---------------------------------------------------------------------------
// Canal A — Sistemas > Empresas > + Nuevo
// ---------------------------------------------------------------------------

export interface AdminCreateBody {
  name?: unknown
  companyName?: unknown
  domain?: unknown
  status?: unknown
  brandColor?: unknown
  emailLocale?: unknown
  storageLimitGb?: unknown
  initialAdmin?: { mode?: unknown; name?: unknown; email?: unknown } | null
}

export async function createOrganizationFromAdmin(event: H3Event, user: SessionUser, body: AdminCreateBody) {
  const db = useDb(event)
  const wantsAdmin = body?.initialAdmin?.mode === 'invite'
  let provisioned: ProvisionedOrganization
  try {
    provisioned = await provisionOrganization(db, {
      source: 'admin',
      organization: {
        name: String(body?.name ?? ''),
        companyName: typeof body?.companyName === 'string' ? body.companyName : null,
        domain: typeof body?.domain === 'string' ? body.domain : null,
        status: typeof body?.status === 'string' ? body.status : 'active',
        brandColor: typeof body?.brandColor === 'string' ? body.brandColor : null,
        emailLocale: typeof body?.emailLocale === 'string' ? body.emailLocale : 'es',
        storageLimitGb: body?.storageLimitGb === '' || body?.storageLimitGb == null ? null : Number(body.storageLimitGb),
      },
      // El super admin nunca fija la contraseña de otra persona: se invita
      // con un enlace de «definir contraseña» (mismo flujo que el alta de usuarios).
      initialAdmin: wantsAdmin ? { name: String(body.initialAdmin?.name ?? ''), email: String(body.initialAdmin?.email ?? '') } : null,
    })
  } catch (e) {
    if (e instanceof ProvisioningError) return provisioningErrorResponse(event, e)
    throw e
  }

  const { organization, admin } = provisioned
  // Auditoría de plataforma (organizationId null, como el resto de acciones
  // sobre Empresas): el alta y, aparte, la cuenta creada con su rol.
  await logAdminAction(event, { user, orgId: null, action: 'create', resource: 'organizations', resourceId: organization.id, detail: `alta desde Sistemas > Empresas; estado: ${organization.status}${organization.domain ? `; dominio: ${organization.domain}` : ''}` })
  if (admin) {
    await logAdminAction(event, { user, orgId: null, action: 'create', resource: 'users', resourceId: admin.id, detail: `${describeUserCreation({ role: 'admin' })}; administrador inicial de la empresa #${organization.id}; invitado por email` })
  }

  let invite: EmailDelivery = 'none'
  if (admin) {
    invite = await sendAdminInvite(event, { organizationId: organization.id, companyName: organization.companyName || organization.name, adminId: admin.id, name: admin.name, email: admin.email, locale: (body?.emailLocale === 'en' ? 'en' : 'es') })
  }
  return { ok: true as const, id: organization.id, organization, admin, invite }
}

/** Invitación (o reenvío) al administrador de una empresa: enlace para definir su contraseña. */
export async function sendAdminInvite(
  event: H3Event,
  opts: { organizationId: number; companyName: string; adminId: number; name: string; email: string; locale?: 'es' | 'en' },
): Promise<EmailDelivery> {
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const results = await safeSend(async () => {
    const token = await createPasswordResetToken(db, opts.adminId)
    return sendPlatformEmail(db, env, {
      organizationId: opts.organizationId,
      template: 'company_admin_invite',
      to: opts.email,
      locale: opts.locale || 'es',
      // El enlace lleva el token en claro sólo dentro del email; en email_log
      // queda el html, igual que el alta de usuarios (user_welcome) — un token
      // de un solo uso y 60 minutos de vida, nunca una contraseña.
      data: { name: opts.name, email: opts.email, companyName: opts.companyName, setPasswordUrl: `${platformBaseUrl(event)}/reset-password/${token}` },
      requestId: getRequestId(event),
    })
  })
  return results.length ? summarizeEmailResults(results) : 'failed'
}

/** Reenvía la invitación a un usuario admin de la empresa (Sistemas > Empresas > ficha > Usuarios). */
export async function resendAdminInvite(event: H3Event, user: SessionUser, body: { organizationId?: unknown; userId?: unknown }) {
  const db = useDb(event)
  const organizationId = Number(body?.organizationId)
  const userId = Number(body?.userId)
  if (!Number.isInteger(organizationId) || !Number.isInteger(userId)) throw createError({ statusCode: 422, statusMessage: 'Falta la empresa o el usuario' })
  const [org] = await db.select({ id: schema.organizations.id, name: schema.organizations.name, companyName: schema.organizations.companyName, emailLocale: schema.organizations.emailLocale }).from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1)
  // El usuario tiene que ser de ESA empresa: nunca se invita a alguien de otra.
  const [member] = org
    ? await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role }).from(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.organizationId, organizationId))).limit(1)
    : []
  if (!org || !member) throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado en esta empresa' })
  const invite = await sendAdminInvite(event, { organizationId, companyName: org.companyName || org.name, adminId: member.id, name: member.name, email: member.email, locale: org.emailLocale === 'en' ? 'en' : 'es' })
  await logAdminAction(event, { user, orgId: null, action: 'run', resource: 'users', resourceId: member.id, detail: `invitación reenviada (empresa #${organizationId}): ${invite}` })
  return { ok: true as const, invite }
}

// ---------------------------------------------------------------------------
// Canal B — Landing → Registro Empresa (público)
// ---------------------------------------------------------------------------

/**
 * Campos que el registro público NUNCA acepta. No se ignoran en silencio:
 * se rechazan, para que un intento de escalar privilegios quede a la vista.
 */
export const FORBIDDEN_REGISTRATION_FIELDS = ['role', 'permissions', 'isSuperAdmin', 'superAdmin', 'tenantId', 'organizationId', 'orgId', 'accessLevel', 'status', 'approvalStatus', 'billingStatus', 'registrationSource', 'domain'] as const

export interface SelfRegistrationBody {
  name?: unknown
  companyName?: unknown
  email?: unknown
  password?: unknown
  passwordConfirm?: unknown
  acceptTerms?: unknown
  /** Honeypot: un humano nunca lo ve ni lo rellena. */
  website?: unknown
  locale?: unknown
  [key: string]: unknown
}

export async function registerCompanySelfService(event: H3Event, body: SelfRegistrationBody) {
  for (const field of FORBIDDEN_REGISTRATION_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, field)) {
      throw createError({ statusCode: 400, statusMessage: 'La solicitud contiene campos no permitidos.' })
    }
  }
  if (typeof body?.website === 'string' && body.website.trim() !== '') {
    throw createError({ statusCode: 400, statusMessage: 'No se ha podido completar el registro.' })
  }
  const password = typeof body?.password === 'string' ? body.password : ''
  const passwordConfirm = typeof body?.passwordConfirm === 'string' ? body.passwordConfirm : ''
  if (password && password.length < PASSWORD_MIN_LENGTH) {
    return provisioningErrorResponse(event, new ProvisioningError('password', 'acceso', `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`))
  }
  if (password !== passwordConfirm) {
    return provisioningErrorResponse(event, new ProvisioningError('passwordConfirm', 'acceso', 'Las contraseñas no coinciden.'))
  }
  if (body?.acceptTerms !== true) {
    return provisioningErrorResponse(event, new ProvisioningError('acceptTerms', 'acceso', 'Debes aceptar los términos y la política de privacidad.'))
  }

  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const locale = body?.locale === 'en' ? 'en' : 'es'
  const name = typeof body?.name === 'string' ? body.name : ''
  const companyName = typeof body?.companyName === 'string' ? body.companyName : ''
  let provisioned: ProvisionedOrganization
  try {
    provisioned = await provisionOrganization(db, {
      source: 'self_service',
      organization: { name, companyName, emailLocale: locale },
      initialAdmin: { name: (companyName || name).trim(), email: typeof body?.email === 'string' ? body.email : '', password },
    })
  } catch (e) {
    if (e instanceof ProvisioningError) {
      // En el formulario público el correo se llama `email`, no `adminEmail`.
      if (e.field === 'adminEmail') e.field = 'email'
      if (e.field === 'adminName') e.field = 'name'
      return provisioningErrorResponse(event, e)
    }
    throw e
  }
  const { organization, admin } = provisioned
  const actor = { id: admin!.id, email: admin!.email }
  await logAdminAction(event, { user: actor, orgId: organization.id, action: 'create', resource: 'organizations', resourceId: organization.id, detail: 'alta por autorregistro web (self_service); acceso inmediato' })
  await logAdminAction(event, { user: actor, orgId: organization.id, action: 'create', resource: 'users', resourceId: admin!.id, detail: `${describeUserCreation({ role: 'admin' })}; administrador inicial (autorregistro)` })

  const base = platformBaseUrl(event)
  const loginUrl = `${base}/admin/login`
  const displayName = organization.companyName || organization.name
  const welcome = await safeSend(() =>
    sendPlatformEmail(db, env, {
      organizationId: organization.id,
      template: 'company_registration_welcome',
      to: admin!.email,
      locale,
      once: true,
      // Nunca la contraseña: sólo el correo con el que entrar y el enlace.
      data: { companyName: displayName, email: admin!.email, loginUrl },
      requestId: getRequestId(event),
    }),
  )
  const decision = decideOrganizationAccess(organization)
  await safeSend(async () =>
    sendPlatformEmail(db, env, {
      organizationId: organization.id,
      template: 'admin_company_registered',
      to: await platformAdminRecipients(db, env),
      once: true,
      data: {
        companyName: displayName,
        email: admin!.email,
        registeredAt: organization.createdAt,
        source: 'Registro web (autorregistro)',
        accessStatus: decision.allowed ? 'Activa — acceso inmediato' : decision.message,
        adminUrl: `${base}/admin/organizations/${organization.id}`,
      },
      requestId: getRequestId(event),
    }),
  )
  return {
    ok: true as const,
    email: admin!.email,
    companyName: displayName,
    // La pantalla de éxito sólo dice «te hemos enviado un email» si es verdad.
    welcomeEmail: welcome.length ? summarizeEmailResults(welcome) : ('failed' as EmailDelivery),
    access: decision.allowed ? 'active' : decision.reason,
    loginUrl,
  }
}

// ---------------------------------------------------------------------------
// Cambio de estado (Sistemas > Empresas > ficha > Estado)
// ---------------------------------------------------------------------------

export async function notifyOrganizationStatusChange(event: H3Event, org: { id: number; name: string; companyName: string | null; emailLocale: string | null }, previousStatus: string, newStatus: string) {
  if (previousStatus === newStatus) return
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const base = platformBaseUrl(event)
  const displayName = org.companyName || org.name
  const locale = org.emailLocale === 'en' ? 'en' : 'es'
  const admins = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(and(eq(schema.users.organizationId, org.id), eq(schema.users.role, 'admin')))
  const recipients = admins.map((a: { email: string }) => a.email)
  if (recipients.length && (newStatus === 'suspended' || newStatus === 'active')) {
    await safeSend(() =>
      sendPlatformEmail(db, env, {
        organizationId: org.id,
        template: newStatus === 'suspended' ? 'company_deactivated' : 'company_status_changed',
        to: recipients,
        locale,
        data: { companyName: displayName, loginUrl: `${base}/admin/login` },
        requestId: getRequestId(event),
      }),
    )
  }
  await safeSend(async () =>
    sendPlatformEmail(db, env, {
      organizationId: org.id,
      template: 'admin_company_status_changed',
      to: await platformAdminRecipients(db, env),
      data: { companyName: displayName, previousStatus: statusLabel(previousStatus), newStatus: statusLabel(newStatus), changedAt: now(), adminUrl: `${base}/admin/organizations/${org.id}` },
      requestId: getRequestId(event),
    }),
  )
}

// ---------------------------------------------------------------------------
// Ficha de empresa (Resumen + Usuarios)
// ---------------------------------------------------------------------------

export async function organizationOverview(db: any, orgId: number) {
  const [[users], [properties], [developerProperties], [team], [leads]] = await Promise.all([
    db.select({ n: count() }).from(schema.users).where(eq(schema.users.organizationId, orgId)),
    // Propiedades vivas: las de la papelera no cuentan en el resumen de la empresa.
    db.select({ n: count() }).from(schema.agentProperties).where(and(eq(schema.agentProperties.organizationId, orgId), livePropertyCond(schema.agentProperties))),
    db.select({ n: count() }).from(schema.developerProperties).where(and(eq(schema.developerProperties.organizationId, orgId), livePropertyCond(schema.developerProperties))),
    db.select({ n: count() }).from(schema.teamMembers).where(eq(schema.teamMembers.organizationId, orgId)),
    db.select({ n: count() }).from(schema.leads).where(eq(schema.leads.organizationId, orgId)),
  ])
  const members = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, createdAt: schema.users.createdAt })
    .from(schema.users)
    .where(eq(schema.users.organizationId, orgId))
    .orderBy(desc(schema.users.createdAt))
    .limit(50)
  return {
    counts: { users: users?.n ?? 0, properties: (properties?.n ?? 0) + (developerProperties?.n ?? 0), team: team?.n ?? 0, leads: leads?.n ?? 0 },
    users: members,
  }
}
