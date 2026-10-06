import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { createTimezoneResolver, zonedWallTimeToUtc } from './timezone'

/**
 * Qué citas tienen un recordatorio pendiente AHORA (FASE 17).
 *
 * `visits.scheduledAt` es hora de pared de la agencia. Antes se comparaba
 * con el reloj UTC del servidor, así que en una agencia a UTC+2 el aviso de
 * «1 h antes» salía 3 h antes. Ahora:
 *   1. se buscan candidatas por hora de pared en una ventana ensanchada lo
 *      que pueden desviarse las zonas habitadas (de UTC−12 a UTC+14);
 *   2. cada candidata se convierte a su instante real con la zona de la
 *      cita, de su oficina, de la oficina de su comercial o de la agencia
 *      (`createTimezoneResolver`, la misma regla que el iCal);
 *   3. sólo quedan las que de verdad caen en [ahora + desde, ahora + hasta].
 */

const MAX_BEHIND_MS = 12 * 60 * 60 * 1000
const MAX_AHEAD_MS = 14 * 60 * 60 * 1000

function fmt(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

export type ReminderColumn = 'reminder24hSentAt' | 'reminder1hSentAt'

export async function dueReminderVisits(db: any, column: ReminderColumn, now: Date, fromMs: number, toMs: number) {
  const sent = schema.visits[column]
  const candidates: Array<typeof schema.visits.$inferSelect> = await db
    .select()
    .from(schema.visits)
    .where(
      and(
        eq(schema.visits.status, 'scheduled'),
        // Cierre D3a: una cita de la papelera nunca recibe recordatorio.
        isNull(schema.visits.deletedAt),
        isNull(sent),
        gte(schema.visits.scheduledAt, fmt(new Date(now.getTime() + fromMs - MAX_BEHIND_MS))),
        lte(schema.visits.scheduledAt, fmt(new Date(now.getTime() + toMs + MAX_AHEAD_MS))),
      ),
    )
  const resolvers = new Map<number, Awaited<ReturnType<typeof createTimezoneResolver>>>()
  const due: typeof candidates = []
  for (const visit of candidates) {
    let resolver = resolvers.get(visit.organizationId)
    if (!resolver) {
      resolver = await createTimezoneResolver(db, visit.organizationId)
      resolvers.set(visit.organizationId, resolver)
    }
    const tz = await resolver.resolve(visit)
    let instant: number
    try {
      instant = zonedWallTimeToUtc(visit.scheduledAt, tz).getTime()
    } catch {
      continue // una hora mal formada no tumba el resto de recordatorios
    }
    if (instant >= now.getTime() + fromMs && instant <= now.getTime() + toMs) due.push(visit)
  }
  return due
}
