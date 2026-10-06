/**
 * Estado comercial común de una propiedad (cierre D1p) y cómo convive con lo
 * que ya tenía cada catálogo. Compartido por el servidor (PUT/POST del motor
 * genérico, acciones masivas, cierre de una operación) y el panel (editor,
 * listado, edición inline), para que las dos partes apliquen la MISMA regla.
 *
 * Tres datos distintos, con tres rótulos que no se confunden:
 *
 * - «Estado comercial» (`property_details.commercial_status`, igual en los dos
 *   catálogos): disponible, reservada, vendida, alquilada, retirada o
 *   borrador. Es el que la agencia gestiona: se filtra, se ve en la fila, se
 *   cambia en bloque y desde la fila.
 * - «Estado de la obra» (obra nueva, `developer_properties.status`): obra
 *   nueva, en construcción o lista. Es la fase de construcción, no si se
 *   puede vender; no se toca nunca desde el estado comercial.
 * - «Disponibilidad» (2ª mano, `agent_properties.status`): disponible o
 *   vendida. Es la que lee el matching y la que cambian «Marcar vendida» y el
 *   cierre de una operación.
 *
 * Y la casilla «Reservada» (`is_reserved`), que es lo que enseña la web.
 *
 * Las reglas sólo se aplican AL CAMBIAR uno de estos datos (nunca se
 * reescriben fichas existentes en bloque ni al guardar sin tocarlos):
 *
 * 1. Cambiar el estado comercial ajusta la casilla «Reservada»: la marca si
 *    pasa a «Reservada» y la quita con cualquier otro estado.
 * 2. En 2ª mano, cambiar el estado comercial a «Vendida» o «Disponible» —los
 *    dos únicos valores que comparte con la disponibilidad— pone la
 *    disponibilidad igual. Con reservada, alquilada, retirada o borrador, la
 *    disponibilidad no cambia.
 * 3. En 2ª mano, cambiar la disponibilidad a «Vendida» pasa a «Vendida» un
 *    estado comercial que ya estuviera indicado (uno vacío se queda vacío: no
 *    se inventa); volver a «Disponible» devuelve a «Disponible» un estado
 *    comercial «Vendida».
 */
import { PROPERTY_COMMERCIAL_STATUS_LABELS } from './propertySheet'

export type CommercialStatusKind = 'agent' | 'developer'

export const PROPERTY_COMMERCIAL_STATUSES = Object.keys(PROPERTY_COMMERCIAL_STATUS_LABELS)

/** Valor del filtro para «sin estado comercial indicado». */
export const COMMERCIAL_STATUS_NONE = 'none'

/** Rótulo del `status` propio de cada catálogo, para que nunca se lea como «el estado» a secas. */
export const CATALOG_STATUS_TITLES: Record<CommercialStatusKind, string> = {
  developer: 'Estado de la obra',
  agent: 'Disponibilidad',
}

export function isCommercialStatus(value: unknown): boolean {
  return typeof value === 'string' && value in PROPERTY_COMMERCIAL_STATUS_LABELS
}

export function commercialStatusLabel(value: string | null | undefined): string {
  if (!value) return 'Sin indicar'
  return PROPERTY_COMMERCIAL_STATUS_LABELS[value] || value
}

/** Tono del chip (mismos tonos cerrados que el listado: `ListChipTone`). */
export function commercialStatusTone(value: string | null | undefined): 'neutral' | 'muted' | 'positive' | 'strong' {
  if (value === 'available') return 'positive'
  if (value === 'sold' || value === 'rented') return 'strong'
  if (value === 'reserved') return 'neutral'
  return 'muted'
}

/** Reglas 1 y 2: lo que arrastra en la fila del catálogo un estado comercial NUEVO. */
export function rowChangesForCommercialStatus(kind: CommercialStatusKind, next: string | null): { isReserved: 0 | 1; status?: string } {
  const out: { isReserved: 0 | 1; status?: string } = { isReserved: next === 'reserved' ? 1 : 0 }
  if (kind === 'agent' && (next === 'sold' || next === 'available')) out.status = next
  return out
}

/** Regla 3: el estado comercial que corresponde tras cambiar la disponibilidad de 2ª mano, o `undefined` si no cambia. */
export function commercialStatusForAvailability(nextStatus: string | null | undefined, current: string | null | undefined): string | undefined {
  if (nextStatus === 'sold' && current && current !== 'sold') return 'sold'
  if (nextStatus === 'available' && current === 'sold') return 'available'
  return undefined
}
