import { atClock } from '../utils/clock'
import { DEMO_TIMEZONE, wallAt, type DemoContext } from './context'
import { zonedWallTimeToUtc } from '../utils/appointments/timezone'

/**
 * La historia de la cuenta demo como una línea de tiempo de eventos.
 *
 * Cada evento es una acción del escenario (captar una propiedad, entrar un
 * lead, una visita, una contraoferta, el SLA de cada mañana…) y se ejecuta
 * con los servicios reales DENTRO de su fecha (`atClock`): lo que esos
 * servicios escriben —altas, actividad, historiales, alertas— queda fechado
 * en el escenario y en el orden en que ocurrió. Así la demo es una
 * reproducción de meses de uso, no una carga de filas.
 *
 * La lista se reconstruye igual en cada invocación (es determinista), y el
 * ejecutor guarda por qué evento va: una invocación sigue donde lo dejó la
 * anterior.
 *
 * Los eventos de HOY con hora posterior a la real se adelantan a «hace un
 * momento» (conservando su orden): nada queda fechado en el futuro.
 */

export interface DemoEvent {
  /** Instante UTC (ms) en el que ocurre. */
  t: number
  seq: number
  label: string
  run: (ctx: DemoContext) => Promise<void>
}

export class TimelineBuilder {
  private events: DemoEvent[] = []
  private seq = 0
  constructor(
    readonly anchorDay: string,
    private readonly nowMs: number,
  ) {}

  /** Añade un evento a `days` del anclaje, a la hora de pared `hhmm` (Madrid). */
  add(days: number, hhmm: string, label: string, run: (ctx: DemoContext) => Promise<void>): void {
    const t = zonedWallTimeToUtc(wallAt(this.anchorDay, days, hhmm), DEMO_TIMEZONE).getTime()
    this.events.push({ t, seq: this.seq++, label, run })
  }

  /**
   * Los eventos en orden. El orden (y por tanto el índice de cada evento, que
   * es lo que guarda el ejecutor entre invocaciones) sólo depende del anclaje,
   * nunca de la hora a la que se construye: los que caerían en el futuro se
   * reparten, en su mismo orden, entre el último evento ya pasado y «ahora».
   */
  build(): DemoEvent[] {
    const sorted = [...this.events].sort((a, b) => a.t - b.t || a.seq - b.seq)
    const limit = this.nowMs - 60_000
    const firstLate = sorted.findIndex((e) => e.t > limit)
    if (firstLate === -1) return sorted
    const floor = firstLate > 0 ? sorted[firstLate - 1].t : limit - 3_600_000
    const late = sorted.length - firstLate
    const step = Math.max(1, Math.floor((limit - floor) / (late + 1)))
    for (let i = firstLate; i < sorted.length; i++) sorted[i] = { ...sorted[i], t: Math.min(limit, floor + step * (i - firstLate + 1)) }
    return sorted
  }
}

/** Ejecuta un evento en su fecha. */
export function runEvent(ctx: DemoContext, event: DemoEvent): Promise<void> {
  return atClock(event.t, () => event.run(ctx))
}
