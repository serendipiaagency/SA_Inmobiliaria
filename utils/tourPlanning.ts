/**
 * Planificación de un tour (FASE 18): el orden de las paradas y sus horas.
 * Puro y compartido: lo usa el servidor al reordenar un tour ya creado
 * (server/utils/appointments/tours.ts) y el formulario «Nuevo tour» del
 * panel para el botón «Recalcular horas».
 *
 * Qué hace HOY: dado un orden, encadena las paradas — cada una empieza
 * cuando acaba la anterior más un margen de desplazamiento que fija el
 * comercial — respetando la duración propia de cada parada.
 *
 * Qué NO hace, a propósito: inventar distancias o tiempos de trayecto. Sin
 * un proveedor de rutas real (con tráfico) el único dato honesto es el que
 * pone el comercial. El punto de extensión para una optimización real es
 * `RouteOptimizer`, más abajo: cuando exista uno, decide el ORDEN y el
 * trayecto entre cada par de paradas (`travelMinutesFromPrevious`), y
 * `planSequentialSchedule()` sigue calculando las horas exactamente igual.
 */

export interface PlannedStopInput {
  /** Duración propia de la parada (minutos). */
  durationMinutes: number
  /** Trayecto desde la parada anterior, si un optimizador lo conoce. Sin él se usa `gapMinutes`. */
  travelMinutesFromPrevious?: number | null
}

export interface PlannedStop {
  scheduledAt: string
  endsAt: string
}

/** Desplaza una hora de pared 'YYYY-MM-DD HH:MM:SS' `minutes` minutos (sin zona: aritmética de reloj). */
export function shiftWallTime(dateTime: string, minutes: number): string {
  return new Date(Date.parse(`${dateTime.replace(' ', 'T')}Z`) + minutes * 60_000).toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * Horas de cada parada en el orden dado: la primera empieza en `startAt`;
 * cada siguiente, al acabar la anterior más su trayecto (o `gapMinutes`).
 */
export function planSequentialSchedule(stops: PlannedStopInput[], opts: { startAt: string; gapMinutes: number }): PlannedStop[] {
  const out: PlannedStop[] = []
  let cursor = opts.startAt
  for (const [i, stop] of stops.entries()) {
    if (i > 0) cursor = shiftWallTime(cursor, stop.travelMinutesFromPrevious ?? opts.gapMinutes)
    const endsAt = shiftWallTime(cursor, stop.durationMinutes)
    out.push({ scheduledAt: cursor, endsAt })
    cursor = endsAt
  }
  return out
}

/** Margen por defecto entre paradas (minutos) y el máximo que se acepta. */
export const DEFAULT_TOUR_GAP_MINUTES = 15
export const MAX_TOUR_GAP_MINUTES = 240

/**
 * PUNTO DE EXTENSIÓN — optimización real de ruta (no implementada).
 *
 * Un proveedor (Google Routes, OSRM, Mapbox…) recibiría las paradas con sus
 * coordenadas (latitud/longitud de la ficha del inmueble, en los dos
 * catálogos) y devolvería el orden óptimo y el trayecto entre cada par.
 * Sin coordenadas en alguna parada debe devolver `null` en ese tramo, nunca
 * una estimación inventada. Ningún código lo llama todavía: hoy el orden lo
 * decide el comercial (subir/bajar paradas) y el trayecto es su margen.
 */
export interface RouteStopLocation {
  visitId: number
  latitude: number | null
  longitude: number | null
  durationMinutes: number
}

export interface RouteOptimizer {
  readonly name: string
  optimize(stops: RouteStopLocation[], opts: { startAt: string }): Promise<{ order: number[]; travelMinutes: Array<number | null> }>
}
