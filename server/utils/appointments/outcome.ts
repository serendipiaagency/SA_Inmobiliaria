import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import { recordActivity } from '../activity/service'

/**
 * Resultado de visita (FASE 19, migración 0074).
 *
 * Es PERCEPCIÓN del comercial, nunca un hecho: que a un cliente no le
 * convenciera la cocina no cambia las características reales del inmueble,
 * y que reaccionara de una forma en una visita concreta no cambia lo que
 * dice buscar. Por eso este módulo, deliberadamente, no importa nada de
 * `agent_properties`, `developer_properties` ni `buyer_requirements` — sólo
 * escribe en `visits`, la cita canónica. `test/unit/visitOutcome.test.ts`
 * comprueba que esa frontera se mantiene, fila a fila, no por nombre de
 * columna (una comparación por columna confundiría `visits.status` con el
 * `status` de otra tabla).
 */

export const VISIT_OUTCOMES = ['interested', 'wants_to_think', 'not_interested'] as const
export type VisitOutcome = (typeof VISIT_OUTCOMES)[number]

export function isVisitOutcome(v: unknown): v is VisitOutcome {
  return typeof v === 'string' && (VISIT_OUTCOMES as readonly string[]).includes(v)
}

/**
 * Sólo tiene sentido anotar qué pasó en una visita que de verdad ocurrió —
 * por eso exige `status: 'completed'`. No es una acción obligatoria al
 * completar la visita (igual que el resultado de una llamada en Comunicaciones,
 * se añade después, cuando hay algo que decir, nunca a la fuerza).
 */
export async function recordVisitOutcome(db: any, orgId: number, visitId: number, input: { outcome: string; notes?: string | null }) {
  if (!isVisitOutcome(input.outcome)) throw createError({ statusCode: 422, statusMessage: 'Resultado no reconocido' })

  const rows = await db
    .select({ status: schema.visits.status, leadId: schema.visits.leadId, propertyId: schema.visits.propertyId, propertyKind: schema.visits.propertyKind })
    .from(schema.visits)
    .where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId)))
    .limit(1)
  const visit = rows[0]
  if (!visit) throw createError({ statusCode: 404, statusMessage: 'Visita no encontrada' })
  if (visit.status !== 'completed') throw createError({ statusCode: 422, statusMessage: 'Sólo se puede anotar el resultado de una visita completada' })

  const nowTs = now()
  await db
    .update(schema.visits)
    .set({ outcome: input.outcome, outcomeNotes: input.notes?.trim() || null, outcomeRecordedAt: nowTs })
    .where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId)))

  // El evento de Activity sólo dice que se anotó un resultado — nunca el
  // texto de las notas, que puede ser información sensible sobre el cliente
  // y no aporta nada a "qué ocurrió" a nivel de negocio.
  const contactId = visit.leadId ? ((await db.select({ contactId: schema.leads.contactId }).from(schema.leads).where(eq(schema.leads.id, visit.leadId)).limit(1))[0]?.contactId ?? null) : null
  await recordActivity(db, orgId, {
    eventType: 'VISIT_OUTCOME_RECORDED',
    entityType: 'visit',
    entityId: visitId,
    appointmentId: visitId,
    leadId: visit.leadId,
    contactId,
    propertyId: visit.propertyId,
    propertyKind: visit.propertyKind as any,
    actorType: 'user',
    metadata: { outcome: input.outcome },
  })

  return { outcome: input.outcome, outcomeNotes: input.notes?.trim() || null, outcomeRecordedAt: nowTs }
}
