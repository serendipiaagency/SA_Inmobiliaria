/**
 * La cita canónica (FASES 17-19, migración 0072).
 *
 * Una visita, una llamada agendada, una tasación y una firma son lo mismo:
 * tiempo reservado con alguien. Por eso comparten tabla y calendario. Este
 * archivo es puro — sólo vocabulario y reglas— para poder probarlo sin base de
 * datos.
 */

export const APPOINTMENT_TYPES = [
  'property_viewing',
  'call',
  'video_call',
  'meeting',
  'valuation',
  'capture',
  'signature',
  'open_house',
  'other',
] as const
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number]

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  property_viewing: 'Visita inmueble',
  call: 'Llamada',
  video_call: 'Videollamada',
  meeting: 'Reunión',
  valuation: 'Tasación',
  capture: 'Captación',
  signature: 'Firma',
  open_house: 'Open house',
  other: 'Otro',
}

export const CONFIRMATION_STATUSES = ['pending', 'confirmed', 'declined'] as const
export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number]

export const CONFIRMATION_LABELS: Record<ConfirmationStatus, string> = {
  pending: 'Sin confirmar',
  confirmed: 'Confirmada',
  declined: 'Rechazada',
}

export const TOUR_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const
export const STOP_STATUSES = ['planned', 'visited', 'skipped', 'cancelled'] as const

export const PRICE_PERCEPTIONS = ['too_expensive', 'fair', 'bargain'] as const
export type PricePerception = (typeof PRICE_PERCEPTIONS)[number]

export const PRICE_PERCEPTION_LABELS: Record<PricePerception, string> = {
  too_expensive: 'Le pareció caro',
  fair: 'Le pareció ajustado',
  bargain: 'Le pareció una oportunidad',
}

export class AppointmentError extends Error {}

/**
 * Los campos del inmueble y de la necesidad que el resultado de una visita NO
 * puede tocar nunca.
 *
 * Existe como lista para que haya un test que falle si alguien intenta
 * escribirlos desde el flujo de feedback. "La cocina está anticuada" es la
 * opinión de una persona sobre una tarde concreta: convertirla en el estado
 * oficial del inmueble dejaría la ficha a merced de quien peor humor tuviera
 * ese día, y el siguiente comprador vería un dato que nadie ha comprobado.
 */
export const FEEDBACK_MUST_NOT_TOUCH = [
  'agent_properties.condition',
  'agent_properties.price',
  'agent_properties.status',
  'agent_properties.year_built',
  'buyer_requirements.price_max',
  'buyer_requirements.area_min',
  'buyer_requirements.desired_zones_json',
] as const

export interface OutcomeInput {
  completed?: boolean | null
  interestScore?: number | null
  liked?: string | null
  disliked?: string | null
  pricePerception?: string | null
  locationFeedback?: string | null
  conditionFeedback?: string | null
  layoutFeedback?: string | null
  wantsSecondViewing?: boolean
  wantsOffer?: boolean
  discarded?: boolean
  discardReason?: string | null
  followUpRequired?: boolean
  followUpAt?: string | null
  notes?: string | null
}

/**
 * Valida el resultado de una visita.
 *
 * Deja pasar el resultado a medias: alguien puede anotar "no le gustó la
 * cocina" sin haber preguntado la puntuación. Exigirlo todo haría que la gente
 * rellenara cualquier cosa por salir del paso, que es peor que un hueco.
 */
export function validateOutcome(input: OutcomeInput): void {
  if (input.interestScore != null) {
    if (!Number.isInteger(input.interestScore) || input.interestScore < 0 || input.interestScore > 5) {
      throw new AppointmentError('El interés se puntúa de 0 a 5')
    }
  }
  if (input.pricePerception != null && !PRICE_PERCEPTIONS.includes(input.pricePerception as PricePerception)) {
    throw new AppointmentError('Percepción de precio no reconocida')
  }
  // Descartar sin decir por qué deja el dato inservible tres meses después.
  if (input.discarded && !String(input.discardReason || '').trim()) {
    throw new AppointmentError('Indica por qué se descarta el inmueble')
  }
  // Pedir seguimiento sin fecha es una intención que nadie ejecutará.
  if (input.followUpRequired && !input.followUpAt) {
    throw new AppointmentError('Indica cuándo hay que hacer el seguimiento')
  }
  // Querer ofertar y descartarlo a la vez no significa nada.
  if (input.discarded && (input.wantsOffer || input.wantsSecondViewing)) {
    throw new AppointmentError('Un inmueble descartado no puede tener oferta ni segunda visita')
  }
}

/** Reordena las paradas de un tour de forma estable, sin huecos ni empates. */
export function reorderStops(ids: number[]): { id: number; sortOrder: number }[] {
  const seen = new Set<number>()
  const unique = ids.filter((id) => {
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  return unique.map((id, index) => ({ id, sortOrder: index }))
}

/**
 * El resumen legible de un resultado, construido desde los datos estructurados
 * y no escrito a mano.
 */
export function summarizeOutcome(outcome: {
  completed?: number | boolean | null
  interestScore?: number | null
  wantsSecondViewing?: number | boolean
  wantsOffer?: number | boolean
  discarded?: number | boolean
  pricePerception?: string | null
}): string {
  if (outcome.completed === 0 || outcome.completed === false) return 'No se realizó'

  const parts: string[] = []
  if (outcome.interestScore != null) parts.push(`Interés ${outcome.interestScore}/5`)
  if (outcome.pricePerception) {
    parts.push(PRICE_PERCEPTION_LABELS[outcome.pricePerception as PricePerception] || outcome.pricePerception)
  }
  if (outcome.discarded) parts.push('Descartado')
  else if (outcome.wantsOffer) parts.push('Quiere ofertar')
  else if (outcome.wantsSecondViewing) parts.push('Quiere segunda visita')

  return parts.length ? parts.join(' · ') : 'Sin valorar'
}
