import { and, eq } from 'drizzle-orm'
import * as schema from '../db/schema'

/**
 * Estado del aprovisionamiento de la cuenta demo, en la tabla global
 * `settings` (una fila, JSON). Ahí vive lo que el seed necesita entre pasos:
 * en qué paso va, la empresa creada, el día al que se ancla la historia y el
 * mapa «clave estable del dataset → id real» con el que un paso encuentra lo
 * que creó otro (la propiedad `p03`, el contacto `c12`…).
 *
 * Cada paso corre en una invocación distinta (cron o botón del super admin),
 * así que el estado se escribe con un cerrojo optimista: se reemplaza sólo si
 * nadie lo cambió desde que se leyó. Dos invocaciones a la vez nunca ejecutan
 * el mismo paso dos veces.
 */
export const DEMO_STATE_KEY = 'demo:norte-astur:state'

export type DemoStatus = 'provisioning' | 'resetting' | 'ready' | 'failed'

export interface DemoState {
  status: DemoStatus
  orgId: number | null
  /** Índice del siguiente paso por ejecutar. */
  stepIndex: number
  /** Día (AAAA-MM-DD, Europe/Madrid) al que se ancla toda la historia: «hace 3 meses» es desde aquí. */
  anchorDay: string | null
  /** Clave estable del dataset → id real. */
  ids: Record<string, number>
  /** Imagen de la demo (ruta en public/demo-assets/norte-astur) → su clave en R2. */
  media: Record<string, string>
  /** Hasta cuándo (epoch ms) tiene el cerrojo la invocación en curso. */
  leaseUntil: number | null
  startedAt: string | null
  finishedAt: string | null
  /** Último paso completado (para la pantalla de progreso). */
  lastStep: string | null
  error: string | null
  /** Reintentos automáticos tras un fallo (el cron no reintenta sin límite). */
  attempts: number
  /** Quién lo pidió por última vez: el cron de producción o el super admin. */
  trigger: 'cron' | 'admin' | null
}

export function emptyDemoState(status: DemoStatus, trigger: DemoState['trigger']): DemoState {
  return { status, orgId: null, stepIndex: 0, anchorDay: null, ids: {}, media: {}, leaseUntil: null, startedAt: null, finishedAt: null, lastStep: null, error: null, attempts: 0, trigger }
}

export async function readDemoState(db: any): Promise<{ state: DemoState | null; raw: string | null }> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, DEMO_STATE_KEY)).limit(1)
  if (!row?.value) return { state: null, raw: null }
  try {
    return { state: { ...emptyDemoState('failed', null), ...JSON.parse(row.value) }, raw: row.value }
  } catch {
    return { state: null, raw: row.value }
  }
}

/**
 * Escribe el estado sólo si sigue siendo `expectedRaw` (null = no existía).
 * Devuelve el texto escrito, o null si otra invocación se adelantó.
 */
export async function writeDemoState(db: any, next: DemoState, expectedRaw: string | null): Promise<string | null> {
  const value = JSON.stringify(next)
  const updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19)
  if (expectedRaw == null) {
    try {
      await db.insert(schema.settings).values({ key: DEMO_STATE_KEY, value, updatedAt })
      return value
    } catch {
      return null
    }
  }
  const rows = await db
    .update(schema.settings)
    .set({ value, updatedAt })
    .where(and(eq(schema.settings.key, DEMO_STATE_KEY), eq(schema.settings.value, expectedRaw)))
    .returning({ key: schema.settings.key })
  return rows.length ? value : null
}
