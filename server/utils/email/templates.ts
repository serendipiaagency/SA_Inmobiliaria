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
}
