import { emailButton, emailHeading, emailInfoTable, emailParagraph, type EmailLocale } from './layout'

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

export interface TemplateDef {
  kind: 'transactional' | 'commercial'
  /** Recipients this template is meant for — informational, not enforced. */
  audience: 'client' | 'internal' | 'user'
  subject: (data: any, locale: EmailLocale) => string
  body: (data: any, locale: EmailLocale) => string
}

const money = (n: number | null | undefined, locale: EmailLocale) =>
  n == null ? '—' : new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  lead_created: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (l === 'en' ? `New lead: ${d.name}` : `Nuevo lead: ${d.name}`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'New lead' : 'Nuevo lead') +
      emailParagraph(l === 'en' ? 'A new prospect just reached out.' : 'Un nuevo posible cliente acaba de contactar.') +
      emailInfoTable([
        [l === 'en' ? 'Name' : 'Nombre', d.name || '—'],
        ['Email', d.email || '—'],
        [l === 'en' ? 'Source' : 'Origen', d.source || '—'],
        ...(d.propertyName ? [[l === 'en' ? 'Property' : 'Propiedad', d.propertyName] as [string, string]] : []),
      ]),
  },

  contact_message: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (l === 'en' ? `New message: ${d.subject || d.name}` : `Nuevo mensaje: ${d.subject || d.name}`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'New contact message' : 'Nuevo mensaje de contacto') +
      emailInfoTable([
        [l === 'en' ? 'Name' : 'Nombre', d.name || '—'],
        ['Email', d.email || '—'],
        ...(d.phone ? [[l === 'en' ? 'Phone' : 'Teléfono', d.phone] as [string, string]] : []),
      ]) +
      emailParagraph(d.message || ''),
  },

  complaint: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (l === 'en' ? `New complaint from ${d.name}` : `Nueva reclamación de ${d.name}`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'New complaint' : 'Nueva reclamación') +
      emailInfoTable([
        [l === 'en' ? 'Name' : 'Nombre', d.name || '—'],
        ['Email', d.email || '—'],
        ...(d.phone ? [[l === 'en' ? 'Phone' : 'Teléfono', d.phone] as [string, string]] : []),
      ]) +
      emailParagraph(d.message || ''),
  },

  appointment_created: {
    kind: 'transactional',
    audience: 'client',
    subject: (d, l) => (l === 'en' ? 'Your appointment is confirmed' : 'Tu cita está confirmada'),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Appointment confirmed' : 'Cita confirmada') +
      emailParagraph(l === 'en' ? 'Here are the details of your appointment:' : 'Estos son los datos de tu cita:') +
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
    subject: (d, l) => (l === 'en' ? `Contract accepted: ${d.title}` : `Contrato aceptado: ${d.title}`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Contract accepted' : 'Contrato aceptado') +
      emailInfoTable([
        [l === 'en' ? 'Contract' : 'Contrato', d.title || '—'],
        [l === 'en' ? 'Client' : 'Cliente', d.clientName || '—'],
        [l === 'en' ? 'Accepted at' : 'Aceptado el', d.acceptedAt || '—'],
      ]),
  },

  deposit_received: {
    kind: 'transactional',
    audience: 'client',
    subject: (d, l) => (l === 'en' ? 'We received your payment' : 'Hemos recibido tu pago'),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Payment received' : 'Pago recibido') +
      emailParagraph(l === 'en' ? 'Thank you — your payment was confirmed.' : 'Gracias — tu pago se ha confirmado.') +
      emailInfoTable([[l === 'en' ? 'Amount' : 'Importe', money(d.amount, l)]]),
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
      emailInfoTable([[l === 'en' ? 'Amount' : 'Importe', money(d.amount, l)]]),
  },

  user_welcome: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (l === 'en' ? 'Your account is ready' : 'Tu cuenta está lista'),
    body: (d, l) =>
      emailHeading(l === 'en' ? `Welcome, ${d.name}` : `Bienvenido/a, ${d.name}`) +
      emailParagraph(
        l === 'en'
          ? `An account was created for you (${d.email}). Set your password to get started:`
          : `Se ha creado una cuenta para ti (${d.email}). Define tu contraseña para empezar:`,
      ) +
      (d.setPasswordUrl ? emailButton(l === 'en' ? 'Set password' : 'Definir contraseña', d.setPasswordUrl) : ''),
  },

  password_reset: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (l === 'en' ? 'Reset your password' : 'Restablece tu contraseña'),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Reset your password' : 'Restablece tu contraseña') +
      emailParagraph(
        l === 'en'
          ? 'We received a request to reset your password. This link expires in 1 hour. If you did not request this, you can ignore this email.'
          : 'Hemos recibido una solicitud para restablecer tu contraseña. Este enlace caduca en 1 hora. Si no lo has solicitado, puedes ignorar este mensaje.',
      ) +
      (d.resetUrl ? emailButton(l === 'en' ? 'Reset password' : 'Restablecer contraseña', d.resetUrl) : ''),
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
    subject: (d, l) => (l === 'en' ? `Your website is not responding: ${d.domain}` : `Tu web no responde: ${d.domain}`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Website not reachable' : 'La web no está accesible') +
      emailParagraph(
        l === 'en'
          ? `The automatic check of ${d.domain} failed. Visitors and your own team may not be able to reach the site or sign in until this is fixed.`
          : `La comprobación automática de ${d.domain} ha fallado. Puede que ni los visitantes ni tu equipo lleguen a la web ni puedan iniciar sesión hasta que se arregle.`,
      ) +
      emailInfoTable([
        [l === 'en' ? 'Domain' : 'Dominio', d.domain || '—'],
        [l === 'en' ? 'Organisation' : 'Agencia', d.organizationName || '—'],
        [l === 'en' ? 'What failed' : 'Qué ha fallado', d.error || '—'],
        [l === 'en' ? 'Checked at (UTC)' : 'Comprobado a las (UTC)', d.checkedAt || '—'],
      ]) +
      emailParagraph(
        l === 'en'
          ? 'Usual causes: the DNS record was changed, the custom domain was removed in Cloudflare, or the domain was edited in the platform. You will get one more email when it is back.'
          : 'Causas habituales: se cambió el registro DNS, se retiró el dominio personalizado en Cloudflare, o se editó el dominio en la plataforma. Recibirás un único correo más cuando vuelva a funcionar.',
      ),
  },
  domain_check_recovered: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (l === 'en' ? `Your website is back: ${d.domain}` : `Tu web vuelve a responder: ${d.domain}`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Website reachable again' : 'La web vuelve a estar accesible') +
      emailParagraph(
        l === 'en'
          ? `${d.domain} answered correctly again at ${d.checkedAt} UTC and serves ${d.organizationName}. No action needed.`
          : `${d.domain} ha vuelto a responder correctamente a las ${d.checkedAt} UTC y sirve ${d.organizationName}. No hace falta hacer nada.`,
      ),
  },

  // Centro de Comunicaciones: primera vez que un número escribe por WhatsApp
  // (sólo al abrirse la conversación, no por cada mensaje).
  whatsapp_message_received: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (l === 'en' ? `New WhatsApp conversation: ${d.contactName}` : `Nueva conversación de WhatsApp: ${d.contactName}`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'New WhatsApp message' : 'Nuevo mensaje de WhatsApp') +
      emailInfoTable([
        [l === 'en' ? 'From' : 'De', d.contactName || '—'],
        [l === 'en' ? 'Phone' : 'Teléfono', d.phone || '—'],
      ]) +
      emailParagraph(d.preview || '') +
      (d.inboxUrl ? emailButton(l === 'en' ? 'Open in Communications' : 'Abrir en Comunicaciones', d.inboxUrl) : ''),
  },

  // --- Email de plataforma (alta y estado de empresas) ----------------------

  company_registration_welcome: {
    kind: 'transactional',
    audience: 'user',
    subject: (_d, l) => (l === 'en' ? 'Welcome to INMO — your company is registered' : 'Bienvenido a INMO — Tu empresa ya está registrada'),
    body: (d, l) =>
      emailHeading(l === 'en' ? `Hello, ${d.companyName}` : `Hola, ${d.companyName}`) +
      emailParagraph(
        l === 'en'
          ? 'Your INMO registration is complete. Your company is ready to use the platform.'
          : 'Tu registro en INMO se ha completado correctamente. Tu empresa ya está preparada para acceder a la plataforma.',
      ) +
      emailInfoTable([[l === 'en' ? 'Company' : 'Empresa', d.companyName || '—']]) +
      emailParagraph(
        l === 'en'
          ? `Sign in with ${d.email} and the password you chose during registration.`
          : `Puedes iniciar sesión con ${d.email} y la contraseña que elegiste durante el registro.`,
      ) +
      (d.loginUrl ? emailButton(l === 'en' ? 'Go to INMO' : 'Acceder a INMO', d.loginUrl) : '') +
      emailParagraph(l === 'en' ? 'If you did not make this registration, please contact our team.' : 'Si no has realizado este registro, contacta con nuestro equipo.'),
  },

  admin_company_registered: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (l === 'en' ? `New company registered in INMO: ${d.companyName}` : 'Nueva empresa registrada en INMO'),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'New company registered' : 'Se ha registrado una nueva empresa en INMO') +
      emailInfoTable([
        [l === 'en' ? 'Company' : 'Empresa', d.companyName || '—'],
        ['Email', d.email || '—'],
        [l === 'en' ? 'Date' : 'Fecha', d.registeredAt || '—'],
        [l === 'en' ? 'Source' : 'Origen', d.source || '—'],
        [l === 'en' ? 'Current status' : 'Estado actual', d.accessStatus || '—'],
      ]) +
      (d.adminUrl ? emailButton(l === 'en' ? 'View company' : 'Ver empresa', d.adminUrl) : ''),
  },

  company_status_changed: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (l === 'en' ? `${d.companyName} is active again in INMO` : `${d.companyName} vuelve a estar activa en INMO`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Your company is active again' : 'Tu empresa vuelve a estar activa') +
      emailParagraph(
        l === 'en'
          ? `Access to INMO for ${d.companyName} has been restored. Your team can sign in again with their usual credentials.`
          : `Se ha restablecido el acceso de ${d.companyName} a INMO. Tu equipo puede volver a entrar con sus credenciales de siempre.`,
      ) +
      (d.loginUrl ? emailButton(l === 'en' ? 'Go to INMO' : 'Acceder a INMO', d.loginUrl) : ''),
  },

  company_deactivated: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (l === 'en' ? `Access to INMO suspended for ${d.companyName}` : `Acceso a INMO suspendido para ${d.companyName}`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Access suspended' : 'Acceso suspendido') +
      emailParagraph(
        l === 'en'
          ? `Access to INMO for ${d.companyName} has been suspended. Your data and accounts are kept; nothing has been deleted.`
          : `Se ha suspendido el acceso de ${d.companyName} a INMO. Tus datos y las cuentas de tu equipo se conservan: no se ha borrado nada.`,
      ) +
      emailParagraph(l === 'en' ? 'If you think this is a mistake, please contact our team.' : 'Si crees que es un error, contacta con nuestro equipo.'),
  },

  admin_company_status_changed: {
    kind: 'transactional',
    audience: 'internal',
    subject: (d, l) => (l === 'en' ? `Company status updated: ${d.companyName}` : `Estado de empresa actualizado: ${d.companyName}`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Company status updated' : 'Estado de empresa actualizado') +
      emailInfoTable([
        [l === 'en' ? 'Company' : 'Empresa', d.companyName || '—'],
        [l === 'en' ? 'Previous status' : 'Estado anterior', d.previousStatus || '—'],
        [l === 'en' ? 'New status' : 'Nuevo estado', d.newStatus || '—'],
        [l === 'en' ? 'Date' : 'Fecha', d.changedAt || '—'],
      ]) +
      (d.adminUrl ? emailButton(l === 'en' ? 'View company' : 'Ver empresa', d.adminUrl) : ''),
  },

  // Preparadas para la aprobación previa (SELF_REGISTRATION_POLICY): hoy
  // ningún flujo las envía porque todas las empresas quedan aprobadas.
  company_approved: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (l === 'en' ? `${d.companyName} has been approved` : `Tu empresa ${d.companyName} ha sido aprobada`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Your company has been approved' : 'Tu empresa ha sido aprobada') +
      emailParagraph(l === 'en' ? 'You can now sign in to INMO.' : 'Ya puedes acceder a INMO.') +
      (d.loginUrl ? emailButton(l === 'en' ? 'Go to INMO' : 'Acceder a INMO', d.loginUrl) : ''),
  },

  company_pending: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (l === 'en' ? `We have received ${d.companyName}'s registration` : `Hemos recibido el registro de ${d.companyName}`),
    body: (d, l) =>
      emailHeading(l === 'en' ? 'Registration received' : 'Registro recibido') +
      emailParagraph(
        l === 'en'
          ? 'Your registration is pending review. We will email you as soon as your company can access INMO.'
          : 'Tu registro está pendiente de revisión. Te escribiremos en cuanto tu empresa pueda acceder a INMO.',
      ),
  },

  company_admin_invite: {
    kind: 'transactional',
    audience: 'user',
    subject: (d, l) => (l === 'en' ? `Your access to ${d.companyName} in INMO` : `Tu acceso a ${d.companyName} en INMO`),
    body: (d, l) =>
      emailHeading(l === 'en' ? `Welcome, ${d.name}` : `Bienvenido/a, ${d.name}`) +
      emailParagraph(
        l === 'en'
          ? `You are the administrator of ${d.companyName} in INMO (${d.email}). Set your password to get started — the link expires in 1 hour; after that, use "Forgot password" on the sign-in page.`
          : `Eres administrador/a de ${d.companyName} en INMO (${d.email}). Define tu contraseña para empezar — el enlace caduca en 1 hora; después, usa «¿Olvidaste tu contraseña?» en la pantalla de acceso.`,
      ) +
      (d.setPasswordUrl ? emailButton(l === 'en' ? 'Set password' : 'Definir contraseña', d.setPasswordUrl) : ''),
  },
}
