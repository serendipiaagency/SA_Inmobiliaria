import { and, asc, eq, gt, isNotNull, isNull, ne } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'
import { recomputeLeadScore } from './score'

/**
 * Next Action (FASE 22) — `leads.nextActionType`/`nextActionAt` son una
 * PROYECCIÓN sincronizada, nunca una segunda fuente de verdad: nada las
 * escribe a mano, sólo `syncLeadNextAction()`, y sólo a partir de datos
 * reales (Task abierta con `dueAt`, o Appointment futura) de ese lead.
 *
 * Las tareas de la papelera (`deletedAt`, bloque N6) nunca cuentan, ni las
 * citas de la papelera (cierre D3a).
 *
 * Sólo entran en el cálculo las Task con `dueAt` — una tarea "algún día" sin
 * fecha no tiene con qué competir por "la próxima acción" ni se puede
 * mostrar ordenada junto a una cita real; ver docs/tasks.md.
 *
 * Se llama tras cualquier escritura que pueda cambiar la próxima acción de
 * un lead: crear/completar/cancelar una Task, o crear/reprogramar/cancelar
 * una Appointment — siempre con el mismo criterio que `recordActivity()`:
 * nunca lanza, para no deshacer la acción real que la disparó.
 */
export async function syncLeadNextAction(db: any, orgId: number, leadId: number): Promise<void> {
  try {
    const nowTs = now()

    const [nextTask] = await db
      .select({ type: schema.tasks.type, dueAt: schema.tasks.dueAt })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.organizationId, orgId), eq(schema.tasks.leadId, leadId), isNull(schema.tasks.deletedAt), ne(schema.tasks.status, 'completed'), ne(schema.tasks.status, 'cancelled'), isNotNull(schema.tasks.dueAt)))
      .orderBy(asc(schema.tasks.dueAt))
      .limit(1)

    const [nextVisit] = await db
      .select({ type: schema.visits.type, scheduledAt: schema.visits.scheduledAt })
      .from(schema.visits)
      .where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.leadId, leadId), eq(schema.visits.status, 'scheduled'), gt(schema.visits.scheduledAt, nowTs), isNull(schema.visits.deletedAt)))
      .orderBy(asc(schema.visits.scheduledAt))
      .limit(1)

    let nextActionType: string | null = null
    let nextActionAt: string | null = null
    if (nextTask && (!nextVisit || nextTask.dueAt <= nextVisit.scheduledAt)) {
      nextActionType = `task:${nextTask.type}`
      nextActionAt = nextTask.dueAt
    } else if (nextVisit) {
      nextActionType = `appointment:${nextVisit.type}`
      nextActionAt = nextVisit.scheduledAt
    }

    await db.update(schema.leads).set({ nextActionType, nextActionAt, updatedAt: nowTs }).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))

    // FASE 32 — una cita creada, reprogramada o cancelada cambia la señal
    // «visita solicitada» del Lead Score; éste es el único punto por el que
    // pasan todos esos caminos (panel, reserva pública, enlace del cliente,
    // seguimiento desde Comunicaciones). Con una Task no cambia nada del
    // score y no se escribe historial (sólo se guarda si cambia).
    await recomputeLeadScore(db, orgId, leadId, 'signal')
  } catch {
    // Se recalculará en la próxima escritura real sobre este lead — nunca debe deshacer la acción que la disparó.
  }
}
