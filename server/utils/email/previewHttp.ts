import type { H3Event } from 'h3'
import { requireOrgScope, requireSuperAdmin } from '../auth'
import { cfEnv, useDb } from '../db'
import { logAdminAction } from '../audit'
import { getRequestId } from '../requestId'
import { htmlToText, type EmailLocale } from './layout'
import { platformBaseUrl } from './links'
import { platformEmailConfig } from './platformConfig'
import { summarizeEmailResults } from './platform'
import { isPortalInmoTemplate, PORTAL_INMO_TEMPLATES, renderTemplateEmail } from './render'
import { sendTransactionalEmail } from './send'
import type { TemplateKey } from './templates'

/**
 * Vista previa de los emails propios de Portal INMO (plantilla maestra), sin
 * rutas nuevas: GET /api/admin/saas/email-health?view=preview y
 * POST /api/admin/saas/settings { section: 'email-preview' }. Sólo super_admin.
 *
 * Los datos son SINTÉTICOS (nunca de una empresa real) y los enlaces se
 * construyen con el origen real de la plataforma, como en un envío de verdad.
 * La vista previa no envía nada; el envío de prueba va únicamente al correo
 * del propio super admin y queda en la auditoría.
 */

export const PREVIEW_LABELS: Partial<Record<TemplateKey, string>> = {
  company_registration_welcome: 'Bienvenida (registro de empresa)',
  admin_company_registered: 'Super admin: nueva empresa registrada',
  company_admin_invite: 'Invitación al administrador de una empresa',
  demo_request_received: 'Solicitud de demo recibida (landing)',
  admin_demo_requested: 'Super admin: nueva solicitud de demo',
  company_status_changed: 'Empresa reactivada',
  company_deactivated: 'Empresa suspendida',
  admin_company_status_changed: 'Super admin: cambio de estado de una empresa',
  company_approved: 'Empresa aprobada',
  company_pending: 'Registro pendiente de revisión',
  user_welcome: 'Alta de usuario',
  password_reset: 'Restablecer contraseña',
  lead_created: 'Equipo: nuevo lead',
  contact_message: 'Equipo: nueva comunicación (formulario)',
  whatsapp_message_received: 'Equipo: nueva conversación de WhatsApp',
  complaint: 'Equipo: nueva reclamación',
  contract_accepted: 'Equipo: contrato aceptado',
  domain_check_failed: 'Tu web no responde',
  domain_check_recovered: 'Tu web vuelve a responder',
}

/** Datos de ejemplo de cada aviso: inventados, con enlaces al origen real. */
export function samplePreviewData(base: string): Record<string, any> {
  return {
    name: 'Lucía Martín',
    email: 'lucia.martin@example.com',
    companyName: 'Inmobiliaria Ejemplo',
    loginUrl: `${base}/admin/login`,
    setPasswordUrl: `${base}/reset-password/ejemplo`,
    resetUrl: `${base}/reset-password/ejemplo`,
    adminUrl: `${base}/admin`,
    inboxUrl: `${base}/admin/comunicaciones`,
    registeredAt: '07/10/2026 10:30',
    requestedAt: '07/10/2026 10:30',
    company: 'Inmobiliaria Ejemplo',
    teamSize: '2 a 5 personas',
    interest: 'Tener una web profesional',
    landingUrl: `${base}/`,
    changedAt: '07/10/2026 10:30',
    source: 'Registro web',
    accessStatus: 'Activa',
    previousStatus: 'Activa',
    newStatus: 'Suspendida',
    message: 'Hola, me interesa el piso de tres dormitorios. ¿Podemos verlo esta semana?',
    preview: 'Hola, ¿sigue disponible el ático?',
    contactName: 'Pablo Ruiz',
    phone: '+34 600 000 000',
    source_label: 'Web',
    propertyName: 'Ático con terraza',
    title: 'Contrato de reserva',
    clientName: 'Pablo Ruiz',
    acceptedAt: '07/10/2026',
    domain: 'inmobiliaria-ejemplo.example',
    organizationName: 'Inmobiliaria Ejemplo',
    error: 'El DNS no apunta a la plataforma',
    checkedAt: '10:30',
  }
}

function pickTemplate(raw: unknown): TemplateKey {
  const key = String(raw || 'company_registration_welcome') as TemplateKey
  if (!isPortalInmoTemplate(key)) throw createError({ statusCode: 422, statusMessage: 'Esa plantilla no es un email propio de Portal INMO' })
  return key
}

export async function handleEmailPreview(event: H3Event) {
  await requireSuperAdmin(event)
  const query = getQuery(event)
  const template = pickTemplate(query.template)
  const locale: EmailLocale = query.locale === 'en' ? 'en' : 'es'
  const env = cfEnv(event) as Record<string, any>
  const config = platformEmailConfig(env)
  const { subject, html } = renderTemplateEmail(template, samplePreviewData(platformBaseUrl(event)), locale, {
    branding: { companyName: config.fromName },
    contactEmail: config.contactAddress,
  })
  return {
    templates: PORTAL_INMO_TEMPLATES.map((key) => ({ key, label: PREVIEW_LABELS[key] || key })),
    template,
    locale,
    from: config.fromHeader,
    replyTo: config.replyTo,
    subject,
    html,
    text: htmlToText(html),
  }
}

/** Envío de prueba de una plantilla con los datos de ejemplo, al correo del propio super admin. */
export async function handleEmailPreviewSend(event: H3Event, body: Record<string, any>) {
  const user = await requireSuperAdmin(event)
  const { orgId } = await requireOrgScope(event)
  const template = pickTemplate(body?.template)
  const locale: EmailLocale = body?.locale === 'en' ? 'en' : 'es'
  const db = useDb(event)
  const results = await sendTransactionalEmail(db, cfEnv(event) as Record<string, any>, {
    organizationId: orgId,
    template,
    to: user.email,
    data: samplePreviewData(platformBaseUrl(event)),
    locale,
    requestId: getRequestId(event),
  })
  const delivery = summarizeEmailResults(results.map((r) => ({ recipient: r.recipient, status: r.status, logId: r.logId, connected: r.connected })))
  await logAdminAction(event, { user, orgId, action: 'run', resource: 'emails', resourceId: results[0]?.logId ?? null, detail: `Envío de prueba de la plantilla ${template} a su propio correo (${delivery})` })
  return { ok: true as const, delivery, to: user.email, message: results[0]?.message ?? null }
}
