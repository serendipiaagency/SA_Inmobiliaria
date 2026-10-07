import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Reloj de la petición en curso.
 *
 * Todos los servicios de dominio fechan con `now()` (server/utils/db.ts), que
 * lee la hora de aquí. Fuera de `atClock()` es la hora real, siempre. Dentro,
 * es la hora que se le indique, y SOLO para el código que corre dentro de esa
 * llamada: AsyncLocalStorage la ata a la cadena asíncrona de quien la abrió,
 * así que una petición concurrente de otra empresa en el mismo isolate sigue
 * viendo la hora real.
 *
 * Para qué existe: la cuenta demo (server/demo/) crea su historia con
 * los servicios reales —actividad, historial de fases, revisiones de ofertas,
 * historial de precios— y esa historia tiene que estar repartida en los
 * últimos meses, no fechada toda en el minuto en que se sembró. Con el reloj
 * de la petición los propios servicios escriben la fecha del escenario, sin
 * repasos a mano por detrás que se salten sus invariantes.
 *
 * Cada lectura avanza un segundo dentro del escenario: dos eventos escritos
 * por la misma llamada conservan su orden en el timeline.
 */
interface ClockState {
  at: number
  ticks: number
}

const clockStore = new AsyncLocalStorage<ClockState>()

export function atClock<T>(at: Date | string | number, fn: () => Promise<T>): Promise<T> {
  const ms = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(String(at).replace(' ', 'T') + (String(at).includes('Z') ? '' : 'Z'))
  if (!Number.isFinite(ms)) throw new Error(`atClock: fecha no válida (${String(at)})`)
  return clockStore.run({ at: ms, ticks: 0 }, fn)
}

/** La hora de la petición: la del escenario dentro de `atClock()`, la real fuera. */
export function clockNow(): Date {
  const state = clockStore.getStore()
  if (!state) return new Date()
  return new Date(state.at + state.ticks++ * 1000)
}

/** true sólo dentro de `atClock()`. */
export function clockIsShifted(): boolean {
  return clockStore.getStore() !== undefined
}
