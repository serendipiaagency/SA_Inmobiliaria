import { emailButton, emailHeading, emailInfoTable, emailParagraph, escapeHtml, type EmailLocale } from './layout'
import type { MasterEmailContent } from './master'

export type TemplateKey =
  | 'lead_created'
  | 'contact_message'
  | 'complaint'
  | 'appointment_created'
  | 'appointment_modified'
  | 'appointment_cancelled'
  | 'appointment_reminder_24h'
  | 'appointment_reminder_1h'
  | 'contract_sent'
  | 'contract_accepted'
  | 'deposit_received'
  | 'payment_failed'
  | 'user_welcome'
  | 'password_reset'
  | 'saved_search_alert'
  | 'domain_check_failed'
  | 'domain_check_recovered'
  | 'whatsapp_message_received'
  // Núcleo N8a: respuesta del equipo a un hilo web (formulario o chat) desde Comunicaciones.
  | 'web_thread_reply'
  // Email de plataforma (server/utils/email/platform.ts): salen siempre con el
  // remitente corporativo central, nunca con la identidad de una empresa.
  | 'company_registration_welcome'
  | 'admin_company_registered'
  | 'company_status_changed'
  | 'company_deactivated'
  | 'admin_company_status_changed'
  | 'company_approved'
  | 'company_pending'
  | 'company_admin_invite'

interface TemplateBase {
  kind: 'transactional' | 'commercial'
  /** Recipients this template is meant for — informational, not enforced. */
  audience: 'client' | 'internal' | 'user'
  subject: (data: any, locale: EmailLocale) => string
}

/**
 * Dos familias, una sola por template:
 *
 *  - `master`: email PROPIO de Portal INMO (alta y estado de empresas, cuenta
 *    de usuario, avisos del sistema y notificaciones al equipo de cada
 *    inmobiliaria). Sólo aporta el contenido; la presentación es la plantilla
 *    maestra (master.ts) y el remitente, el de la plataforma.
 *  - `body`: email que la inmobiliaria manda a SUS clientes (citas, contratos,
 *    cobros, alertas, respuestas). Lleva su identidad y su marca (layout.ts).
 */
export type TemplateDef = TemplateBase &
  ({ master: (data: any, locale: EmailLocale) => MasterEmailContent; body?: never } | { body: (data: any, locale: EmailLocale) => string; master?: never })

/**
 * Importe de un cobro con SU moneda (`d.currency`, la del depósito de Stripe):
 * un registro con moneda propia se enseña con ella, no con la de la agencia
 * (utils/currency.ts, regla 4). Sin moneda, `eur`, la de siempre de los depósitos.
 */
const money = (n: number | null | undefined, locale: EmailLocale, currency?: string | null) => {
  if (n == null) return '—'
  const code = String(currency || 'eur').toUpperCase()
  try {
    return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES', { maximumFractionDigits: 0 }).format(n)} ${code}`
  }
}

const en = (l: EmailLocale) => l === 'en'
/** Antetítulos de la plantilla maestra (se pintan en mayúsculas). */
const EYEBROW = {
  activity: (l: EmailLocale) => (en(l) ? 'Connected to your activity' : 'Conectados con tu actividad'),
  platform: (l: EmailLocale) => (en(l) ? 'New activity in Portal INMO' : 'Nueva actividad en Portal INMO'),
  company: (l: EmailLocale) => (en(l) ? 'Your company' : 'Estado de tu empresa'),
  security: (l: EmailLocale) => (en(l) ? 'Your account security' : 'Seguridad de tu cuenta'),
  website: (l: EmailLocale) => (en(l) ? 'Your website' : 'Estado de tu web'),
}
const ACTIVITY_LINE = (l: EmailLocale) => (en(l) ? 'You will find everything related to your activity in Portal INMO.' : 'Aquí encontrarás la información relacionada con tu actividad en Portal INMO.')
const GO_PLATFORM = (l: EmailLocale) => (en(l) ? 'Go to the platform' : 'Acceder a la plataforma')
const GO_ACCOUNT = (l: EmailLocale) => (en(l) ? 'Go to my account' : 'Acceder a mi cuenta')
const cta = (label: string, url: unknown) => (typeof url === 'string' && /^https?:\/\//i.test(url) ? { label, url } : null)

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  lead_created: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (en(l) ? `New lead: ${d.name}` : `Nuevo lead: ${d.name}`),
    master: (d, l) => ({
      eyebrow: EYEBROW.activity(l),
      title: en(l) ? 'You have a\nnew lead' : 'Tienes un\nnuevo lead',
      paragraphs: [en(l) ? 'A new prospect just reached out.' : 'Un nuevo posible cliente acaba de contactar.'],
      details: [
        [en(l) ? 'Name' : 'Nombre', d.name],
        ['Email', d.email],
        [en(l) ? 'Source' : 'Origen', d.source],
        [en(l) ? 'Property' : 'Propiedad', d.propertyName],
      ],
      cta: cta(GO_PLATFORM(l), d.adminUrl),
    }),
  },

  contact_message: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (en(l) ? `New message: ${d.subject || d.name}` : `Nuevo mensaje: ${d.subject || d.name}`),
    master: (d, l) => ({
      eyebrow: EYEBROW.activity(l),
      title: en(l) ? 'You have a new\nmessage' : 'Tienes una nueva\ncomunicación',
      paragraphs: [String(d.message || ''), ACTIVITY_LINE(l)],
      details: [
        [en(l) ? 'From' : 'De', d.name],
        ['Email', d.email],
        [en(l) ? 'Phone' : 'Teléfono', d.phone],
      ],
      cta: cta(GO_PLATFORM(l), d.adminUrl),
    }),
  },

  complaint: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (en(l) ? `New complaint from ${d.name}` : `Nueva reclamación de ${d.name}`),
    master: (d, l) => ({
      eyebrow: EYEBROW.activity(l),
      title: en(l) ? 'You have a new\ncomplaint' : 'Tienes una nueva\nreclamación',
      paragraphs: [String(d.message || ''), ACTIVITY_LINE(l)],
      details: [
        [en(l) ? 'From' : 'De', d.name],
        ['Email', d.email],
        [en(l) ? 'Phone' : 'Teléfono', d.phone],
      ],
      cta: cta(GO_PLATFORM(l), d.adminUrl),
    }),
  },

  appointment_created: {
    kind: 'transactional',
    audience: 'client',
    // «Reservada», no «confirmada» (#110): el hueco queda guardado en la agenda,
    // pero la asistencia la confirma el cliente desde su enlace (estado
    // `confirmation_status`); el email no promete más de lo que hay.
    subject: (d, l) => (l === 'en' ? 'Your appointment is booked' : 'Tu cita está reservada'),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Appointment booked' : 'Cita reservada') +
      emailParagraph(l === 'en' ? 'Here are the details of your appointment. Please confirm you can attend from the link below.' : 'Estos son los datos de tu cita. Confirma tu asistencia desde el enlace de abajo.') +
      emailInfoTable([
        [l === 'en' ? 'Date & time' : 'Fecha y hora', d.scheduledAt || '—'],
        ...(d.agentName ? [[l === 'en' ? 'Agent' : 'Agente', d.agentName] as [string, string]] : []),
        ...(d.propertyName ? [[l === 'en' ? 'Property' : 'Propiedad', d.propertyName] as [string, string]] : []),
      ]) +
      (d.videoLink ? emailParagraph(`${l === 'en' ? 'Video call' : 'Videollamada'}: <a href="${d.videoLink}">${d.videoLink}</a>`) : '') +
      (d.manageUrl ? emailButton(l === 'en' ? 'Manage appointment' : 'Gestionar cita', d.manageUrl) : ''),
  },

  appointment_modified: {
    kind: 'transactional',
    audience: 'client',
    subject: (d, l) => (l === 'en' ? 'Your appointment was updated' : 'Tu cita ha sido modificada'),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Appointment updated' : 'Cita modificada') +
      emailParagraph(l === 'en' ? 'Your appointment now has a new date and time:' : 'Tu cita ahora tiene una nueva fecha y hora:') +
      emailInfoTable([[l === 'en' ? 'New date & time' : 'Nueva fecha y hora', d.scheduledAt || '—']]),
  },

  appointment_cancelled: {
    kind: 'transactional',
    audience: 'client',
    subject: (d, l) => (l === 'en' ? 'Your appointment was cancelled' : 'Tu cita ha sido cancelada'),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Appointment cancelled' : 'Cita cancelada') +
      emailParagraph(l === 'en' ? 'The following appointment was cancelled:' : 'Se ha cancelado la siguiente cita:') +
      emailInfoTable([[l === 'en' ? 'Date & time' : 'Fecha y hora', d.scheduledAt || '—']]),
  },

  appointment_reminder_24h: {
    kind: 'transactional',
    audience: 'client',
    subject: (d, l) => (l === 'en' ? 'Reminder: your appointment is tomorrow' : 'Recordatorio: tu cita es mañana'),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'See you tomorrow' : 'Nos vemos mañana') +
      emailParagraph(l === 'en' ? 'This is a reminder for your appointment tomorrow:' : 'Este es un recordatorio de tu cita de mañana:') +
      emailInfoTable([[l === 'en' ? 'Date & time' : 'Fecha y hora', d.scheduledAt || '—']]),
  },

  appointment_reminder_1h: {
    kind: 'transactional',
    audience: 'client',
    subject: (d, l) => (l === 'en' ? 'Reminder: your appointment is in 1 hour' : 'Recordatorio: tu cita es en 1 hora'),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'See you soon' : 'Nos vemos pronto') +
      emailParagraph(l === 'en' ? 'Your appointment starts in about an hour:' : 'Tu cita empieza en aproximadamente una hora:') +
      emailInfoTable([[l === 'en' ? 'Date & time' : 'Fecha y hora', d.scheduledAt || '—']]),
  },

  contract_sent: {
    kind: 'transactional',
    audience: 'client',
    subject: (d, l) => (l === 'en' ? `Contract ready for review: ${d.title}` : `Contrato listo para revisar: ${d.title}`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Your contract is ready' : 'Tu contrato está listo') +
      emailParagraph(l === 'en' ? 'Review and accept it whenever you\'re ready:' : 'Revísalo y acéptalo cuando quieras:') +
      (d.url ? emailButton(l === 'en' ? 'Review contract' : 'Revisar contrato', d.url) : ''),
  },

  contract_accepted: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (en(l) ? `Contract accepted: ${d.title}` : `Contrato aceptado: ${d.title}`),
    master: (d, l) => ({
      eyebrow: EYEBROW.activity(l),
      title: en(l) ? 'A contract has\nbeen accepted' : 'Se ha aceptado\nun contrato',
      paragraphs: [ACTIVITY_LINE(l)],
      details: [
        [en(l) ? 'Contract' : 'Contrato', d.title],
        [en(l) ? 'Client' : 'Cliente', d.clientName],
        [en(l) ? 'Accepted at' : 'Aceptado el', d.acceptedAt],
      ],
      cta: cta(GO_PLATFORM(l), d.adminUrl),
    }),
  },

  deposit_received: {
    kind: 'transactional',
    audience: 'client',
    subject: (d, l) => (l === 'en' ? 'We received your payment' : 'Hemos recibido tu pago'),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Payment received' : 'Pago recibido') +
      emailParagraph(l === 'en' ? 'Thank you — your payment was confirmed.' : 'Gracias — tu pago se ha confirmado.') +
      emailInfoTable([[l === 'en' ? 'Amount' : 'Importe', money(d.amount, l, d.currency)]]),
  },

  payment_failed: {
    kind: 'transactional',
    audience: 'client',
    subject: (d, l) => (l === 'en' ? 'Your payment did not go through' : 'Tu pago no se ha podido procesar'),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Payment failed' : 'Pago fallido') +
      emailParagraph(
        l === 'en'
          ? 'We were unable to process your payment. Please try again or contact us if the problem continues.'
          : 'No hemos podido procesar tu pago. Inténtalo de nuevo o contacta con nosotros si el problema continúa.',
      ) +
      emailInfoTable([[l === 'en' ? 'Amount' : 'Importe', money(d.amount, l, d.currency)]]),
  },

  user_welcome: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (en(l) ? 'Your account is ready' : 'Tu cuenta está lista'),
    master: (d, l) => ({
      eyebrow: EYEBROW.activity(l),
      title: en(l) ? 'Welcome to\nPortal INMO' : 'Te damos la bienvenida a\nPortal INMO',
      greetingName: d.name,
      paragraphs: [
        en(l)
          ? `An account was created for you (${d.email}). Set your password to start managing your real estate activity.`
          : `Se ha creado una cuenta para ti (${d.email}). Define tu contraseña para empezar a gestionar tu actividad inmobiliaria.`,
      ],
      cta: cta(en(l) ? 'Set my password' : 'Definir mi contraseña', d.setPasswordUrl),
    }),
  },

  password_reset: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (en(l) ? 'Reset your password' : 'Restablece tu contraseña'),
    master: (d, l) => ({
      eyebrow: EYEBROW.security(l),
      title: en(l) ? 'Reset your\npassword' : 'Restablece tu\ncontraseña',
      greetingName: d.name,
      paragraphs: [en(l) ? 'We received a request to reset your password. The link expires in 1 hour.' : 'Hemos recibido una solicitud para restablecer tu contraseña. El enlace caduca en 1 hora.'],
      cta: cta(en(l) ? 'Reset password' : 'Restablecer contraseña', d.resetUrl),
      footnote: en(l) ? 'If you did not request this, you can ignore this email: your password stays the same.' : 'Si no lo has solicitado, puedes ignorar este mensaje: tu contraseña no cambia.',
    }),
  },

  saved_search_alert: {
    kind: 'commercial',
    audience: 'client',
    subject: (d, l) =>
      l === 'en'
        ? `${d.count} new ${d.count === 1 ? 'property matches' : 'properties match'} your search`
        : `${d.count} propiedad${d.count === 1 ? '' : 'es'} nueva${d.count === 1 ? '' : 's'} que coincide${d.count === 1 ? '' : 'n'} con tu búsqueda`,
    body: (d, l) =>
      emailHeading(l === 'en' ? 'New matches for your saved search' : 'Novedades en tu búsqueda guardada') +
      emailParagraph(
        l === 'en'
          ? `${d.count} new ${d.count === 1 ? 'property matches' : 'properties match'} the search you saved:`
          : `Han aparecido ${d.count} propiedad${d.count === 1 ? '' : 'es'} nueva${d.count === 1 ? '' : 's'} que coincide${d.count === 1 ? '' : 'n'} con tu búsqueda guardada:`,
      ) +
      `<ul style="margin:0 0 20px;padding-left:20px;">${(d.items || []).map((i: string) => `<li style="margin-bottom:4px;">${i}</li>`).join('')}</ul>`,
  },

  // Monitorización de dominios personalizados (server/tasks/system/check-custom-domains.ts).
  // Sólo al cambiar de estado: uno al caer, uno al recuperarse.
  domain_check_failed: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (en(l) ? `Your website is not responding: ${d.domain}` : `Tu web no responde: ${d.domain}`),
    master: (d, l) => ({
      eyebrow: EYEBROW.website(l),
      title: en(l) ? 'Your website is\nnot responding' : 'Tu web no\nresponde',
      paragraphs: [
        en(l)
          ? `The automatic check of ${d.domain} failed. Visitors and your own team may not be able to reach the site or sign in until this is fixed.`
          : `La comprobación automática de ${d.domain} ha fallado. Puede que ni los visitantes ni tu equipo lleguen a la web ni puedan iniciar sesión hasta que se arregle.`,
      ],
      details: [
        [en(l) ? 'Domain' : 'Dominio', d.domain],
        [en(l) ? 'Agency' : 'Agencia', d.organizationName],
        [en(l) ? 'What failed' : 'Qué ha fallado', d.error],
        [en(l) ? 'Checked at (UTC)' : 'Comprobado a las (UTC)', d.checkedAt],
      ],
      footnote: en(l)
        ? 'Usual causes: the DNS record was changed, the custom domain was removed in Cloudflare, or the domain was edited in the platform. You will get one more email when it is back.'
        : 'Causas habituales: se cambió el registro DNS, se retiró el dominio personalizado en Cloudflare o se editó el dominio en la plataforma. Recibirás un único correo más cuando vuelva a funcionar.',
    }),
  },
  domain_check_recovered: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (en(l) ? `Your website is back: ${d.domain}` : `Tu web vuelve a responder: ${d.domain}`),
    master: (d, l) => ({
      eyebrow: EYEBROW.website(l),
      title: en(l) ? 'Your website is\nback online' : 'Tu web vuelve a\nresponder',
      paragraphs: [
        en(l)
          ? `${d.domain} answered correctly again at ${d.checkedAt} UTC and serves ${d.organizationName}. No action needed.`
          : `${d.domain} ha vuelto a responder correctamente a las ${d.checkedAt} UTC y sirve ${d.organizationName}. No hace falta hacer nada.`,
      ],
    }),
  },

  // Centro de Comunicaciones: primera vez que un número escribe por WhatsApp
  // (sólo al abrirse la conversación, no por cada mensaje).
  whatsapp_message_received: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (en(l) ? `New WhatsApp conversation: ${d.contactName}` : `Nueva conversación de WhatsApp: ${d.contactName}`),
    master: (d, l) => ({
      eyebrow: EYEBROW.activity(l),
      title: en(l) ? 'You have a new\nmessage' : 'Tienes una nueva\ncomunicación',
      paragraphs: [String(d.preview || ''), ACTIVITY_LINE(l)],
      details: [
        [en(l) ? 'From' : 'De', d.contactName],
        [en(l) ? 'Phone' : 'Teléfono', d.phone],
      ],
      cta: cta(en(l) ? 'Open in Communications' : 'Abrir en Comunicaciones', d.inboxUrl),
    }),
  },

  // Núcleo N8a — el comercial responde por email a quien escribió por un
  // formulario o por el chat de la web (server/utils/comms/web.ts). El texto
  // lo escribe una persona del equipo: se escapa entero, nunca se interpreta
  // como HTML. Con una ficha compartida, el botón lleva el enlace personal.
  web_thread_reply: {
    kind: 'transactional',
    audience: 'client',
    subject: (d, l) => String(d.subject || (l === 'en' ? 'Reply to your enquiry' : 'Respuesta a tu consulta')),
    body: (d, l) =>
      emailParagraph(escapeHtml(String(d.body || '')).replace(/\r?\n/g, '<br>')) +
      (d.propertyUrl ? emailButton(d.propertyName ? `${l === 'en' ? 'View' : 'Ver'} ${d.propertyName}` : l === 'en' ? 'View property' : 'Ver la propiedad', d.propertyUrl) : ''),
  },

  // --- Email de plataforma (alta y estado de empresas) ----------------------

  company_registration_welcome: {
    kind: 'transactional',
    audience: 'user',
    subject: (_d, l) => (en(l) ? 'Welcome to Portal INMO — your company is registered' : 'Te damos la bienvenida a Portal INMO'),
    master: (d, l) => ({
      eyebrow: EYEBROW.activity(l),
      title: en(l) ? 'Welcome to\nPortal INMO' : 'Te damos la bienvenida a\nPortal INMO',
      greetingName: d.name,
      paragraphs: [
        en(l)
          ? 'Your account is ready. Go to the platform to start managing your real estate activity.'
          : 'Tu cuenta ya está preparada. Accede a la plataforma para empezar a gestionar tu actividad inmobiliaria.',
      ],
      details: [
        [en(l) ? 'Company' : 'Empresa', d.companyName],
        [en(l) ? 'Your user' : 'Tu usuario', d.email],
      ],
      cta: cta(GO_ACCOUNT(l), d.loginUrl),
      footnote: en(l) ? 'If you did not make this registration, please contact our team.' : 'Si no has realizado este registro, contacta con nuestro equipo.',
    }),
  },

  admin_company_registered: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (en(l) ? `New company registered in Portal INMO: ${d.companyName}` : 'Nueva empresa registrada en Portal INMO'),
    master: (d, l) => ({
      eyebrow: EYEBROW.platform(l),
      title: en(l) ? 'New company\nregistered' : 'Nueva empresa\nregistrada',
      paragraphs: [en(l) ? 'A new company has registered in Portal INMO.' : 'Se ha registrado una nueva empresa en Portal INMO.'],
      details: [
        [en(l) ? 'Company' : 'Empresa', d.companyName],
        [en(l) ? 'Email' : 'Correo', d.email],
        [en(l) ? 'Date' : 'Fecha', d.registeredAt],
        [en(l) ? 'Source' : 'Origen', d.source],
        [en(l) ? 'Status' : 'Estado', d.accessStatus],
      ],
      cta: cta(en(l) ? 'View company' : 'Ver empresa', d.adminUrl),
    }),
  },

  company_status_changed: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (en(l) ? `${d.companyName} is active again in Portal INMO` : `${d.companyName} vuelve a estar activa en Portal INMO`),
    master: (d, l) => ({
      eyebrow: EYEBROW.company(l),
      title: en(l) ? 'Your company is\nactive again' : 'Tu empresa vuelve a\nestar activa',
      paragraphs: [
        en(l)
          ? `Access to Portal INMO for ${d.companyName} has been restored. Your team can sign in again with their usual credentials.`
          : `Se ha restablecido el acceso de ${d.companyName} a Portal INMO. Tu equipo puede volver a entrar con sus credenciales de siempre.`,
      ],
      cta: cta(GO_ACCOUNT(l), d.loginUrl),
    }),
  },

  company_deactivated: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (en(l) ? `Access to Portal INMO suspended for ${d.companyName}` : `Acceso a Portal INMO suspendido para ${d.companyName}`),
    master: (d, l) => ({
      eyebrow: EYEBROW.company(l),
      title: en(l) ? 'Access\nsuspended' : 'Acceso\nsuspendido',
      paragraphs: [
        en(l)
          ? `Access to Portal INMO for ${d.companyName} has been suspended. Your data and accounts are kept; nothing has been deleted.`
          : `Se ha suspendido el acceso de ${d.companyName} a Portal INMO. Tus datos y las cuentas de tu equipo se conservan: no se ha borrado nada.`,
      ],
      footnote: en(l) ? 'If you think this is a mistake, please contact our team.' : 'Si crees que es un error, contacta con nuestro equipo.',
    }),
  },

  admin_company_status_changed: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (en(l) ? `Company status updated: ${d.companyName}` : `Estado de empresa actualizado: ${d.companyName}`),
    master: (d, l) => ({
      eyebrow: EYEBROW.platform(l),
      title: en(l) ? 'Company status\nupdated' : 'Estado de empresa\nactualizado',
      paragraphs: [en(l) ? 'The status of a company in Portal INMO has changed.' : 'Ha cambiado el estado de una empresa en Portal INMO.'],
      details: [
        [en(l) ? 'Company' : 'Empresa', d.companyName],
        [en(l) ? 'Previous status' : 'Estado anterior', d.previousStatus],
        [en(l) ? 'New status' : 'Nuevo estado', d.newStatus],
        [en(l) ? 'Date' : 'Fecha', d.changedAt],
      ],
      cta: cta(en(l) ? 'View company' : 'Ver empresa', d.adminUrl),
    }),
  },

  // Preparadas para la aprobación previa (SELF_REGISTRATION_POLICY): hoy
  // ningún flujo las envía porque todas las empresas quedan aprobadas.
  company_approved: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (en(l) ? `${d.companyName} has been approved` : `Tu empresa ${d.companyName} ha sido aprobada`),
    master: (d, l) => ({
      eyebrow: EYEBROW.company(l),
      title: en(l) ? 'Your company is\nnow active' : 'Tu empresa ya está\nactiva',
      paragraphs: [en(l) ? `${d.companyName} has been approved. You can now sign in to Portal INMO.` : `${d.companyName} ha sido aprobada. Ya puedes acceder a Portal INMO.`],
      cta: cta(GO_ACCOUNT(l), d.loginUrl),
    }),
  },

  company_pending: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (en(l) ? `We have received ${d.companyName}'s registration` : `Hemos recibido el registro de ${d.companyName}`),
    master: (d, l) => ({
      eyebrow: EYEBROW.company(l),
      title: en(l) ? 'We have received\nyour registration' : 'Hemos recibido\ntu registro',
      paragraphs: [
        en(l)
          ? 'Your registration is pending review. We will email you as soon as your company can access Portal INMO.'
          : 'Tu registro está pendiente de revisión. Te escribiremos en cuanto tu empresa pueda acceder a Portal INMO.',
      ],
    }),
  },

  company_admin_invite: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (en(l) ? `Your access to ${d.companyName} in Portal INMO` : `Tu acceso a ${d.companyName} en Portal INMO`),
    master: (d, l) => ({
      eyebrow: EYEBROW.activity(l),
      title: en(l) ? 'Welcome to\nPortal INMO' : 'Te damos la bienvenida a\nPortal INMO',
      greetingName: d.name,
      paragraphs: [
        en(l)
          ? `You are the administrator of ${d.companyName} in Portal INMO (${d.email}). Set your password to get started.`
          : `Eres administrador/a de ${d.companyName} en Portal INMO (${d.email}). Define tu contraseña para empezar.`,
      ],
      cta: cta(en(l) ? 'Set my password' : 'Definir mi contraseña', d.setPasswordUrl),
      footnote: en(l)
        ? 'The link expires in 1 hour; after that, use "Forgot password" on the sign-in page.'
        : 'El enlace caduca en 1 hora; después, usa «¿Olvidaste tu contraseña?» en la pantalla de acceso.',
    }),
  },
}
