/**
 * Catálogo de citas (núcleo inmobiliario, FASES 17-20): tipos, canales,
 * estados, confirmación, recordatorio y el resultado estructurado de una
 * visita, con su etiqueta en castellano. Una sola lista para el servidor
 * (validación en server/utils/appointments/*) y para el panel (etiquetas y
 * selectores en pages/admin/visitas.vue y sus componentes).
 */

/**
 * PARA QUÉ es la cita — eje distinto del canal (el CÓMO). `notary` existía
 * desde la operación (FASE 24); `signing` es la firma que no es en notaría
 * (arras, reserva, encargo). Los valores antiguos siguen siendo válidos.
 */
export const APPOINTMENT_TYPES = ['property_viewing', 'call', 'video_call', 'meeting', 'valuation', 'listing', 'signing', 'notary', 'open_house', 'other'] as const
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number]
export const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  property_viewing: 'Visita a inmueble',
  call: 'Llamada',
  video_call: 'Videollamada',
  meeting: 'Reunión',
  valuation: 'Tasación',
  listing: 'Captación',
  signing: 'Firma',
  notary: 'Notaría',
  open_house: 'Open house',
  other: 'Otro',
}

/**
 * Tipos en los que la cita es CON un cliente al que hay que poder avisar:
 * exigen email o teléfono (o un contacto/lead que los aporte). Una reunión,
 * una tasación, una captación, una firma o un open house pueden no tener un
 * único cliente con datos de contacto.
 */
export const CLIENT_FACING_TYPES: readonly string[] = ['property_viewing', 'call', 'video_call']

export const APPOINTMENT_CHANNELS = ['in_person', 'video', 'phone'] as const
export type AppointmentChannel = (typeof APPOINTMENT_CHANNELS)[number]
export const APPOINTMENT_CHANNEL_LABELS: Record<string, string> = { in_person: 'Presencial', video: 'Videollamada', phone: 'Teléfono' }

/** Canal por defecto de cada tipo cuando no se elige ninguno. Una videollamada sólo puede ser por vídeo. */
export function defaultChannelFor(type: string): AppointmentChannel {
  if (type === 'video_call') return 'video'
  if (type === 'call') return 'phone'
  return 'in_person'
}

export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]
export const APPOINTMENT_STATUS_LABELS: Record<string, string> = { scheduled: 'Agendada', completed: 'Completada', cancelled: 'Cancelada', no_show: 'No asistió' }

/**
 * Confirmación de asistencia. `confirmed` es la del CLIENTE (desde su enlace
 * de gestión) y sólo la da él; `confirmed_internal` la anota la agencia
 * (confirmada por teléfono, WhatsApp…). Si después confirma el cliente, su
 * confirmación prevalece. Mover la cita devuelve las dos a `pending`.
 */
export const CONFIRMATION_STATUSES = ['pending', 'confirmed', 'confirmed_internal'] as const
export const CONFIRMATION_STATUS_LABELS: Record<string, string> = {
  pending: 'Sin confirmar',
  confirmed: 'Confirmada por el cliente',
  confirmed_internal: 'Confirmada por la agencia',
}
/** Lo que el panel puede fijar: la confirmación del cliente no se puede dar en su nombre. */
export const INTERNAL_CONFIRMATION_STATUSES: readonly string[] = ['pending', 'confirmed_internal']

export const REMINDER_STATUSES = ['pending', 'sent', 'failed', 'not_applicable'] as const
export const REMINDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  failed: 'Falló el envío',
  not_applicable: 'Sin recordatorio',
}

/**
 * Qué se le dice al panel sobre los recordatorios de una cita, a partir de
 * lo que de verdad ha pasado (las marcas de envío de 24 h y 1 h) y de si hay
 * a quién avisar.
 */
export function reminderSummary(v: { status?: string | null; reminderStatus?: string | null; reminder24hSentAt?: string | null; reminder1hSentAt?: string | null; clientEmail?: string | null; clientPhone?: string | null }): string {
  if (v.reminder24hSentAt && v.reminder1hSentAt) return 'Enviados (24 h y 1 h antes)'
  if (v.reminder1hSentAt) return 'Enviado el de 1 h antes'
  if (v.reminder24hSentAt) return v.status === 'scheduled' ? 'Enviado el de 24 h; falta el de 1 h' : 'Enviado el de 24 h antes'
  if (v.reminderStatus === 'failed') return REMINDER_STATUS_LABELS.failed
  if (!v.clientEmail && !v.clientPhone) return 'Sin recordatorio: la cita no tiene email ni teléfono'
  if (v.status && v.status !== 'scheduled') return 'No se enviaron'
  return 'Pendientes (24 h y 1 h antes)'
}

/** Resultado global de la visita (FASE 19, migración 0074). */
export const VISIT_OUTCOMES = ['interested', 'wants_to_think', 'not_interested'] as const
export const VISIT_OUTCOME_LABELS: Record<string, string> = {
  interested: 'Interesado',
  wants_to_think: 'Se lo piensa',
  not_interested: 'No le convenció',
}

/** Percepción del precio (migración 0086). */
export const PRICE_PERCEPTIONS = ['cheap', 'fair', 'expensive'] as const
export const PRICE_PERCEPTION_LABELS: Record<string, string> = { cheap: 'Barato', fair: 'Ajustado', expensive: 'Caro' }

/** Valoraciones 1-5 de la visita, con su columna en `visits`. */
export const VISIT_RATINGS = [
  { key: 'locationRating', label: 'Ubicación' },
  { key: 'conditionRating', label: 'Estado' },
  { key: 'layoutRating', label: 'Distribución' },
] as const

/** Motivos de cancelación sugeridos. El motivo es texto libre: estos sólo se ofrecen como atajo. */
export const CANCELLATION_REASON_SUGGESTIONS = [
  'El cliente no puede asistir',
  'El cliente ya no está interesado',
  'El inmueble ya no está disponible',
  'Indisponibilidad del comercial',
  'Se cambia por otra cita',
]

/**
 * Motivo con el que queda cancelada una cita AGENDADA al mandarla a la
 * papelera (cierre D3a). Se cancela para liberar su hueco: el índice único
 * `visits_agent_slot_unique` (migración 0050) sólo excluye las canceladas, y
 * sin esto no se podría volver a dar de alta la cita correcta a la misma
 * hora. Restaurarla la devuelve a «agendada» (server/utils/appointments/trash.ts).
 */
export const APPOINTMENT_TRASH_REASON = 'Eliminada: enviada a la papelera'

/**
 * El estado que tenía una cita de la papelera ANTES de eliminarla: si la
 * cancelación la puso la propia papelera (mismo instante y su motivo), era
 * una cita agendada; si no, el que tiene. Fuera de la papelera, su estado.
 */
export function trashedFromStatus(v: { status: string; deletedAt?: string | null; cancelledAt?: string | null; cancellationReason?: string | null }): string {
  if (v.deletedAt && v.status === 'cancelled' && v.cancelledAt === v.deletedAt && v.cancellationReason === APPOINTMENT_TRASH_REASON) return 'scheduled'
  return v.status
}

/** Duración mínima y máxima de una cita (minutos). */
export const APPOINTMENT_MIN_MINUTES = 5
export const APPOINTMENT_MAX_MINUTES = 720

/**
 * Zona horaria que el panel muestra para una agencia que nunca la ha
 * configurado (Sistema → Configuración). Es la última opción al resolver la
 * zona de una cita: la de la cita, la de su oficina, la de la oficina del
 * comercial y la de la agencia van antes.
 */
export const DEFAULT_AGENCY_TIMEZONE = 'Asia/Dubai'

/** ¿Es una zona horaria IANA que el motor reconoce (Europe/Madrid, Atlantic/Canary…)? */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim() || !tz.includes('/')) return tz === 'UTC'
  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Zonas que el selector ofrece de entrada; se puede escribir cualquier otra IANA. */
export const COMMON_TIMEZONES = ['Europe/Madrid', 'Atlantic/Canary', 'Europe/Lisbon', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'America/Mexico_City', 'America/Bogota', 'America/Argentina/Buenos_Aires', 'UTC']

export function appointmentTypeLabel(t: string | null | undefined): string {
  if (!t) return '—'
  return APPOINTMENT_TYPE_LABELS[t] || t
}
export function appointmentChannelLabel(c: string | null | undefined): string {
  if (!c) return '—'
  return APPOINTMENT_CHANNEL_LABELS[c] || c
}
export function appointmentStatusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return APPOINTMENT_STATUS_LABELS[s] || s
}
export function confirmationLabel(s: string | null | undefined): string {
  return CONFIRMATION_STATUS_LABELS[s || 'pending'] || s || '—'
}
export function visitOutcomeLabel(o: string | null | undefined): string {
  if (!o) return '—'
  return VISIT_OUTCOME_LABELS[o] || o
}

/** Lo que eligen los buscadores del panel (contacto, lead o inmueble) en los formularios de citas y tours. */
export interface PickedEntity {
  id: number
  label: string
  /** Sólo inmuebles: 'agent' (2ª mano) o 'developer' (obra nueva). */
  kind?: 'agent' | 'developer'
}
