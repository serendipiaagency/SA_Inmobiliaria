/**
 * Catálogo del trabajo comercial (núcleo inmobiliario, FASES 21-24):
 * actividad, tareas, próxima acción, ofertas y operaciones, con su etiqueta
 * en castellano. Una sola lista para el servidor (validación) y el panel
 * (etiquetas), igual que `utils/leadCatalog.ts`. Las claves son lo que se
 * guarda; lo que se lee es la etiqueta.
 *
 * Los servicios del servidor (`server/utils/{tasks,offers,deals}/service.ts`)
 * reexportan de aquí sus listas de valores válidos, y
 * `test/unit/nucleoN6.test.ts` comprueba que cada tipo de evento de
 * `ACTIVITY_EVENT_TYPES` tiene su etiqueta.
 */

// ---------------------------------------------------------------------------
// FASE 22 — Tareas
// ---------------------------------------------------------------------------

export const TASK_TYPES = ['call', 'whatsapp', 'email', 'follow_up', 'document', 'viewing', 'offer', 'signature', 'other'] as const
export const TASK_TYPE_LABELS: Record<string, string> = {
  call: 'Llamada',
  whatsapp: 'WhatsApp',
  email: 'Email',
  follow_up: 'Seguimiento',
  document: 'Documento',
  viewing: 'Visita',
  offer: 'Oferta',
  signature: 'Firma',
  other: 'Otra',
}

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export const TASK_PRIORITY_LABELS: Record<string, string> = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' }

export const TASK_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const
export const TASK_STATUS_LABELS: Record<string, string> = { open: 'Abierta', in_progress: 'En curso', completed: 'Completada', cancelled: 'Cancelada' }

/** Tipos de cita que pueden ser la próxima acción de un lead (`visits.type`). Uno desconocido se enseña como «Cita». */
export const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  property_viewing: 'Visita a inmueble',
  call: 'Llamada',
  notary: 'Notaría / firma',
  other: 'Cita',
}

/**
 * `leads.nextActionType` guarda `task:<tipo de tarea>` o
 * `appointment:<tipo de cita>` (server/utils/leads/nextAction.ts). Esto lo
 * convierte en texto: «Tarea · Llamada», «Cita · Visita a inmueble».
 */
export function nextActionLabel(value: string | null | undefined): string {
  if (!value) return '—'
  const [kind, sub = ''] = String(value).split(':')
  if (kind === 'appointment') return `Cita · ${APPOINTMENT_TYPE_LABELS[sub] || sub || 'Cita'}`
  if (kind === 'task') return `Tarea · ${TASK_TYPE_LABELS[sub] || sub || 'Tarea'}`
  return value
}

// ---------------------------------------------------------------------------
// FASE 23 — Ofertas
// ---------------------------------------------------------------------------

export const OFFER_STATUSES = ['draft', 'submitted', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired'] as const
export const OFFER_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Enviada',
  countered: 'Contraoferta',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  withdrawn: 'Retirada',
  expired: 'Vencida',
}
/** Estados en los que la negociación sigue viva (el filtro «Abiertas» del listado). */
export const OFFER_OPEN_STATUSES = ['draft', 'submitted', 'countered'] as const

/**
 * Tipos de revisión del historial inmutable (`offer_revisions.type`). Cada
 * movimiento real deja una fila con sus términos completos; nunca se
 * sobrescribe una anterior.
 */
export const OFFER_REVISION_TYPES = ['created', 'submitted', 'countered', 'new_offer', 'accepted', 'rejected', 'withdrawn', 'expired'] as const
export const OFFER_REVISION_LABELS: Record<string, string> = {
  created: 'Oferta (borrador)',
  submitted: 'Oferta enviada',
  countered: 'Contraoferta',
  new_offer: 'Nueva oferta',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  withdrawn: 'Retirada',
  expired: 'Vencida',
}

export const OFFER_ACTOR_LABELS: Record<string, string> = { buyer: 'Comprador', seller: 'Vendedor', user: 'Comercial', system: 'Sistema' }

/** Condición de financiación de una oferta (`offers.current_finance_condition`, `offer_revisions.finance_condition`). */
export const OFFER_FINANCE_CONDITIONS = ['cash', 'mortgage_subject', 'mortgage_preapproved', 'mortgage_approved', 'other'] as const
export const OFFER_FINANCE_LABELS: Record<string, string> = {
  cash: 'Sin financiación (al contado)',
  mortgage_subject: 'Sujeta a concesión de hipoteca',
  mortgage_preapproved: 'Hipoteca preaprobada',
  mortgage_approved: 'Hipoteca aprobada',
  other: 'Otra (ver condiciones)',
}

export function offerFinanceLabel(v: string | null | undefined): string {
  if (!v) return '—'
  return OFFER_FINANCE_LABELS[v] || v
}

// ---------------------------------------------------------------------------
// FASE 24 — Operaciones
// ---------------------------------------------------------------------------

export const DEAL_STAGES = ['accepted_offer', 'reservation', 'deposit_contract', 'financing', 'documentation', 'notary', 'signature', 'closed'] as const
export const DEAL_STAGE_LABELS: Record<string, string> = {
  accepted_offer: 'Oferta aceptada',
  reservation: 'Reserva',
  deposit_contract: 'Arras',
  financing: 'Financiación',
  documentation: 'Documentación',
  notary: 'Notaría',
  signature: 'Firma',
  closed: 'Cerrada',
}

export const DEAL_STATUSES = ['active', 'closed', 'cancelled'] as const
export const DEAL_STATUS_LABELS: Record<string, string> = { active: 'Activa', closed: 'Cerrada', cancelled: 'Cancelada' }

/** Lo que se puede vincular a una operación (columna `deal_operation_id` de cada tabla, migración 0086). */
export const DEAL_RECORD_KINDS = ['reservation', 'deposit', 'contract'] as const
export const DEAL_RECORD_KIND_LABELS: Record<string, string> = { reservation: 'Reserva', deposit: 'Arras / depósito', contract: 'Contrato' }

// ---------------------------------------------------------------------------
// FASE 21 — Actividad
// ---------------------------------------------------------------------------

/** Etiqueta de cada `activities.event_type`. La lista de tipos válidos vive en server/utils/activity/service.ts. */
export const ACTIVITY_EVENT_LABELS: Record<string, string> = {
  LEAD_CREATED: 'Lead recibido',
  LEAD_ASSIGNED: 'Lead asignado',
  LEAD_REASSIGNED: 'Lead reasignado',
  LEAD_QUALIFIED: 'Lead cualificado',
  BUYER_REQUIREMENT_CREATED: 'Necesidad registrada',
  MATCH_SELECTED: 'Coincidencia seleccionada',
  MATCH_DISCARDED: 'Coincidencia descartada',
  PROPERTY_SELECTION_CREATED: 'Selección de propiedades',
  APPOINTMENT_CREATED: 'Cita agendada',
  APPOINTMENT_RESCHEDULED: 'Cita reprogramada',
  APPOINTMENT_CANCELLED: 'Cita cancelada',
  VIEWING_COMPLETED: 'Visita completada',
  VIEWING_NO_SHOW: 'El cliente no se presentó a la visita',
  VISIT_OUTCOME_RECORDED: 'Resultado de visita anotado',
  TASK_CREATED: 'Tarea creada',
  TASK_COMPLETED: 'Tarea completada',
  TASK_CANCELLED: 'Tarea cancelada',
  OFFER_CREATED: 'Oferta creada (borrador)',
  OFFER_SUBMITTED: 'Oferta enviada',
  OFFER_COUNTERED: 'Contraoferta',
  OFFER_RESUBMITTED: 'Nueva oferta',
  OFFER_ACCEPTED: 'Oferta aceptada',
  OFFER_REJECTED: 'Oferta rechazada',
  OFFER_WITHDRAWN: 'Oferta retirada',
  OFFER_EXPIRED: 'Oferta vencida',
  DEAL_CREATED: 'Operación abierta',
  DEAL_STAGE_CHANGED: 'Operación: cambio de etapa',
  DEAL_CLOSED: 'Operación cerrada',
  DEAL_CANCELLED: 'Operación cancelada',
  DEAL_RECORD_LINKED: 'Documento vinculado a la operación',
  DEAL_RECORD_UNLINKED: 'Documento desvinculado de la operación',
  PROPERTY_SENT: 'Ficha enviada por WhatsApp',
  PROPERTY_SHARE_OPENED: 'El cliente abrió la ficha enviada',
  CALL_COMPLETED: 'Llamada atendida',
  CONTACT_MERGED: 'Contactos unificados',
}

/** Grupos para filtrar una cronología (chips del componente ActivityTimeline). */
export const ACTIVITY_GROUPS: { key: string; label: string; types: string[] }[] = [
  { key: 'leads', label: 'Leads', types: ['LEAD_CREATED', 'LEAD_ASSIGNED', 'LEAD_REASSIGNED', 'LEAD_QUALIFIED'] },
  { key: 'matching', label: 'Necesidades y matching', types: ['BUYER_REQUIREMENT_CREATED', 'MATCH_SELECTED', 'MATCH_DISCARDED', 'PROPERTY_SELECTION_CREATED'] },
  { key: 'citas', label: 'Citas y visitas', types: ['APPOINTMENT_CREATED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED', 'VIEWING_COMPLETED', 'VIEWING_NO_SHOW', 'VISIT_OUTCOME_RECORDED'] },
  { key: 'tareas', label: 'Tareas', types: ['TASK_CREATED', 'TASK_COMPLETED', 'TASK_CANCELLED'] },
  { key: 'ofertas', label: 'Ofertas', types: ['OFFER_CREATED', 'OFFER_SUBMITTED', 'OFFER_COUNTERED', 'OFFER_RESUBMITTED', 'OFFER_ACCEPTED', 'OFFER_REJECTED', 'OFFER_WITHDRAWN', 'OFFER_EXPIRED'] },
  { key: 'operacion', label: 'Operación', types: ['DEAL_CREATED', 'DEAL_STAGE_CHANGED', 'DEAL_CLOSED', 'DEAL_CANCELLED', 'DEAL_RECORD_LINKED', 'DEAL_RECORD_UNLINKED'] },
  { key: 'comunicaciones', label: 'Comunicaciones', types: ['PROPERTY_SENT', 'PROPERTY_SHARE_OPENED', 'CALL_COMPLETED'] },
  { key: 'contacto', label: 'Contacto', types: ['CONTACT_MERGED'] },
]

export const ACTIVITY_ACTOR_LABELS: Record<string, string> = { user: 'Usuario', contact: 'Cliente', system: 'Sistema', ai: 'IA' }

/** Importe con su moneda («450.000 €»). Una moneda desconocida se enseña con su código. */
export function formatAmount(n: number | null | undefined, currency: string | null | undefined = 'eur'): string {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const code = String(currency || 'eur').toUpperCase()
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(Number(n))
  } catch {
    return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Number(n))} ${code}`
  }
}

/** Un registro elegido en un selector del panel (contacto, lead, inmueble, cita u operación). */
export interface PickedRecord {
  id: number
  label: string
  kind?: 'agent' | 'developer' | null
  sub?: string | null
}

/** Los términos de una oferta tal como los edita el panel (oferta, contraoferta y nueva oferta). */
export interface OfferTerms {
  amount: number | null
  conditions: string
  financeCondition: string
  expiration: string
}

/** Términos vacíos, o los actuales de una oferta para partir de ellos en una contraoferta. */
export function offerTermsFrom(offer?: { currentAmount?: number | null; currentConditions?: string | null; currentFinanceCondition?: string | null; expiration?: string | null } | null): OfferTerms {
  return {
    amount: offer?.currentAmount ?? null,
    conditions: offer?.currentConditions || '',
    financeCondition: offer?.currentFinanceCondition || '',
    expiration: offer?.expiration ? String(offer.expiration).slice(0, 10) : '',
  }
}
