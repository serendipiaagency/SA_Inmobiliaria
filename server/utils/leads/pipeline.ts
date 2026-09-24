import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from '../db'

/**
 * Pipeline de Leads (FASE 13, migración 0069).
 *
 * `stage` = posición real en el pipeline. `status` = situación general, que
 * 20+ rutas ya consultaban con su significado de antes de esta fase (new|
 * contacted|qualified|proposal|won|lost) — nunca se ha redefinido, así que
 * este servicio lo mantiene sincronizado en cada transición de stage en vez
 * de sustituirlo. Es el único sitio del código que escribe `leads.stage`:
 * ningún componente debe hacer `lead.stage = ...` directamente (FASE 13 §88).
 */

export const STAGES = ['new', 'contacted', 'qualifying', 'qualified', 'viewing', 'offer', 'negotiation', 'won'] as const
export type Stage = (typeof STAGES)[number]

export const LOST_REASONS = ['no_response', 'not_interested', 'duplicate', 'other'] as const
export type LostReason = (typeof LOST_REASONS)[number]

/** Deriva el `status` legacy desde el `stage` nuevo, para que los 20+ consumidores existentes sigan viendo un valor coherente. */
const STATUS_FOR_STAGE: Record<Stage, string> = {
  new: 'new',
  contacted: 'contacted',
  qualifying: 'qualified',
  qualified: 'qualified',
  viewing: 'proposal',
  offer: 'proposal',
  negotiation: 'proposal',
  won: 'won',
}

export class LeadPipelineError extends Error {}

/**
 * Mueve un lead a un stage nuevo (drag&drop del Kanban o un cambio manual).
 * Escribe `lead_stage_history` siempre — es la única forma de que exista
 * historial, y es inmutable: esta función nunca hace UPDATE/DELETE sobre esa
 * tabla, sólo INSERT.
 */
export async function transitionLeadStage(
  event: H3Event,
  orgId: number,
  leadId: number,
  input: { toStage: string; reason?: string | null },
  opts: { userId?: number | null } = {},
) {
  if (!STAGES.includes(input.toStage as Stage)) throw new LeadPipelineError(`Stage no reconocido: ${input.toStage}`)
  const db = useDb(event)

  const existing = (await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId))).limit(1))[0]
  if (!existing) throw new LeadPipelineError('Lead no encontrado')

  const nowTs = now()
  const toStage = input.toStage as Stage
  // FASE 16 (migración 0071): firstResponseAt sólo lo rellena un movimiento
  // real hecho por una persona (opts.userId), nunca el 'new' automático de
  // upsertLead() — así nunca cuenta como "respondido" algo que nadie ha
  // tocado. qualifiedAt es la primera vez que se alcanza 'qualified'; si el
  // lead retrocede después, no se recalcula (histórico, no estado actual).
  await db
    .update(schema.leads)
    .set({
      stage: toStage,
      status: STATUS_FOR_STAGE[toStage],
      updatedAt: nowTs,
      ...(opts.userId && !existing.firstResponseAt && existing.stage !== toStage ? { firstResponseAt: nowTs } : {}),
      ...(toStage === 'qualified' && !existing.qualifiedAt ? { qualifiedAt: nowTs } : {}),
    })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))

  await db.insert(schema.leadStageHistory).values({
    organizationId: orgId,
    leadId,
    userId: opts.userId ?? null,
    fromStage: existing.stage,
    toStage,
    reason: input.reason || null,
    createdAt: nowTs,
  })

  return (await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId))).limit(1))[0]
}

/**
 * Marca un lead como perdido (o lo reactiva). Es la dimensión de OUTCOME, no
 * de stage (FASE 13 §85: "no mantener stage=WON status=LOST sin reglas") —
 * el stage se queda donde estaba, para saber en qué punto del pipeline se
 * perdió. No escribe lead_stage_history: no es un movimiento de stage.
 */
export async function setLeadOutcome(
  event: H3Event,
  orgId: number,
  leadId: number,
  input: { lost: boolean; lostReason?: string | null },
) {
  const db = useDb(event)
  const existing = (await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId))).limit(1))[0]
  if (!existing) throw new LeadPipelineError('Lead no encontrado')

  if (input.lost && input.lostReason != null && !LOST_REASONS.includes(input.lostReason as LostReason)) {
    throw new LeadPipelineError(`Motivo de pérdida no reconocido: ${input.lostReason}`)
  }

  await db
    .update(schema.leads)
    .set({
      // Reactivar vuelve al status que corresponde al stage actual — nunca a
      // 'new' a secas, que perdería en qué punto del pipeline estaba.
      status: input.lost ? 'lost' : STATUS_FOR_STAGE[(existing.stage as Stage) || 'new'],
      lostReason: input.lost ? input.lostReason || 'other' : null,
      updatedAt: now(),
    })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))

  return (await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId))).limit(1))[0]
}
