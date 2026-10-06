/**
 * Política de acceso de una empresa — EL ÚNICO sitio que decide si los
 * usuarios de una organización pueden entrar al panel.
 *
 * Combina dimensiones separadas (migración 0085), nunca un único booleano:
 *
 *   status              operativo, lo decide el super admin: active | suspended
 *   approval_status     aprobación del alta: approved | pending | rejected
 *   billing_status      pago/suscripción: not_required | pending | active | past_due
 *   registration_source cómo se dio de alta: admin | self_service | demo (no decide
 *                       por sí mismo; decide qué valores iniciales recibe)
 *
 * Se aplica en dos puntos: al iniciar sesión (server/api/auth/login.post.ts)
 * y en cada petición con sesión (loadSessionUser en server/utils/auth.ts),
 * así que suspender una empresa corta el acceso de sus sesiones abiertas sin
 * borrar credenciales ni datos.
 *
 * Política ACTUAL del autorregistro: acceso inmediato (aprobada, sin pago).
 * Para pasar a aprobación previa o a pago basta con cambiar
 * `SELF_REGISTRATION_POLICY` — el login, la sesión y esta decisión ya
 * saben denegar `pending`. Ver docs/empresas.md.
 */

import { ORGANIZATION_STATUS_LABELS } from '../../../utils/organizationLabels'

export const ORGANIZATION_STATUSES = ['active', 'suspended'] as const
export const APPROVAL_STATUSES = ['approved', 'pending', 'rejected'] as const
export const BILLING_STATUSES = ['not_required', 'pending', 'active', 'past_due'] as const
// 'demo': la cuenta demo comercial que aprovisiona la propia plataforma (server/demo/).
export const REGISTRATION_SOURCES = ['admin', 'self_service', 'demo'] as const

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number]
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]
export type BillingStatus = (typeof BILLING_STATUSES)[number]
export type RegistrationSource = (typeof REGISTRATION_SOURCES)[number]

export interface OrganizationAccessFields {
  status: string | null | undefined
  approvalStatus: string | null | undefined
  billingStatus: string | null | undefined
}

export type AccessDenialReason = 'suspended' | 'pending_approval' | 'rejected' | 'pending_payment' | 'payment_past_due' | 'unknown_state'

export type OrganizationAccessDecision = { allowed: true } | { allowed: false; reason: AccessDenialReason; message: string }

const DENIAL_MESSAGES: Record<AccessDenialReason, string> = {
  suspended: 'El acceso de tu empresa a INMO está suspendido. Si crees que es un error, contacta con nuestro equipo.',
  pending_approval: 'Tu empresa está pendiente de aprobación. Te avisaremos por email en cuanto esté lista.',
  rejected: 'El registro de tu empresa no ha sido aprobado. Contacta con nuestro equipo si necesitas más información.',
  pending_payment: 'Tu empresa está pendiente de completar el alta.',
  payment_past_due: 'Hay un pago pendiente en la cuenta de tu empresa. Contacta con nuestro equipo para regularizarlo.',
  unknown_state: 'El acceso de tu empresa no está disponible ahora mismo. Contacta con nuestro equipo.',
}

function deny(reason: AccessDenialReason): OrganizationAccessDecision {
  return { allowed: false, reason, message: DENIAL_MESSAGES[reason] }
}

/**
 * ¿Pueden entrar los usuarios de esta empresa? Falla cerrada: un valor que
 * no reconoce deniega en vez de dejar pasar.
 */
export function decideOrganizationAccess(org: OrganizationAccessFields): OrganizationAccessDecision {
  const status = org.status || 'active'
  const approval = org.approvalStatus || 'approved'
  const billing = org.billingStatus || 'not_required'

  if (status === 'suspended') return deny('suspended')
  if (status !== 'active') return deny('unknown_state')

  if (approval === 'pending') return deny('pending_approval')
  if (approval === 'rejected') return deny('rejected')
  if (approval !== 'approved') return deny('unknown_state')

  if (billing === 'pending') return deny('pending_payment')
  if (billing === 'past_due') return deny('payment_past_due')
  if (billing !== 'not_required' && billing !== 'active') return deny('unknown_state')

  return { allowed: true }
}

/**
 * Valores iniciales de acceso según el canal de alta.
 *
 *  - admin (Sistemas > Empresas > + Nuevo): lo crea el super admin, que ya la
 *    está aprobando al crearla; sin billing.
 *  - self_service (Landing → Registro Empresa): POLÍTICA ACTUAL = acceso
 *    inmediato. Para exigir aprobación: approvalStatus 'pending'; para exigir
 *    pago: billingStatus 'pending' (con su proveedor y webhook verificado).
 */
export const SELF_REGISTRATION_POLICY: { approvalStatus: ApprovalStatus; billingStatus: BillingStatus } = {
  approvalStatus: 'approved',
  billingStatus: 'not_required',
}

export function initialAccessFor(source: RegistrationSource): { approvalStatus: ApprovalStatus; billingStatus: BillingStatus } {
  return source === 'self_service' ? { ...SELF_REGISTRATION_POLICY } : { approvalStatus: 'approved', billingStatus: 'not_required' }
}

/** Mismos textos que el panel (utils/organizationLabels.ts). */
export const STATUS_LABELS: Record<OrganizationStatus, { label: string; description: string }> = {
  active: ORGANIZATION_STATUS_LABELS.active!,
  suspended: ORGANIZATION_STATUS_LABELS.suspended!,
}
