import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from '../db'
import { recordActivity } from '../activity/service'

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

const LOST_REASON_TEXT: Record<string, string> = { no_response: 'No responde', not_interested: 'No interesado', duplicate: 'Duplicado', other: 'Otro motivo' }

/** Largo máximo de un motivo escrito a mano (lo que cabe en una línea del historial). */
export const STAGE_REASON_MAX = 300

/**
 * Motivo de un movimiento hecho por una PERSONA desde el panel (FASE 13:
 * «cada cambio registra usuario, fecha, fase anterior, fase nueva y
 * motivo»): obligatorio, sin espacios sobrantes y acotado. Lo exigen la ruta
 * del panel (PATCH /api/admin/saas/leads/:id: ficha, Kanban, Tabla) y la
 * acción masiva al crearse. `transitionLeadStage()` no lo exige a propósito:
 * las entradas automáticas (automatizaciones, workflows de INMO) llegan con
 * su propio motivo descriptivo y no deben romperse por esto.
 */
export function requirePanelStageReason(raw: unknown, what = 'del cambio de fase'): string {
  const reason = typeof raw === 'string' ? raw.trim() : ''
  if (!reason) throw new LeadPipelineError(`Indica el motivo ${what}: queda en el historial del lead`)
  if (reason.length > STAGE_REASON_MAX) throw new LeadPipelineError(`El motivo admite como máximo ${STAGE_REASON_MAX} caracteres`)
  return reason
}

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
      // Quien lo pasa a «Contactado» o más allá declara que hubo contacto
      // (una llamada desde su móvil no deja rastro en Comunicaciones).
      ...(opts.userId && !existing.firstContactAt && toStage !== 'new' ? { firstContactAt: nowTs } : {}),
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

  // Sólo la primera vez que se alcanza 'qualified' — igual que qualifiedAt arriba, es un hito, no cada paso del pipeline.
  if (toStage === 'qualified' && !existing.qualifiedAt) {
    await recordActivity(db, orgId, {
      eventType: 'LEAD_QUALIFIED',
      entityType: 'lead',
      entityId: leadId,
      leadId,
      contactId: existing.contactId,
      actorType: opts.userId ? 'user' : 'system',
      actorId: opts.userId ?? null,
    })
  }

  return (await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId))).limit(1))[0]
}

/**
 * Marca un lead como perdido (o lo reactiva). Es la dimensión de OUTCOME, no
 * de stage (FASE 13 §85: "no mantener stage=WON status=LOST sin reglas") —
 * el stage se queda donde estaba, para saber en qué punto del pipeline se
 * perdió. Sí queda en lead_stage_history (núcleo inmobiliario, FASE 13:
 * «cada cambio registra usuario, fecha, fase anterior, fase nueva y
 * motivo»): `to_stage` es 'lost' o 'reactivated' — no son etapas, son los dos
 * movimientos de resultado — y `from_stage` la etapa en la que estaba.
 */
export async function setLeadOutcome(
  event: H3Event,
  orgId: number,
  leadId: number,
  input: { lost: boolean; lostReason?: string | null; note?: string | null },
  opts: { userId?: number | null } = {},
) {
  const db = useDb(event)
  const existing = (await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId))).limit(1))[0]
  if (!existing) throw new LeadPipelineError('Lead no encontrado')

  if (input.lost && input.lostReason != null && !LOST_REASONS.includes(input.lostReason as LostReason)) {
    throw new LeadPipelineError(`Motivo de pérdida no reconocido: ${input.lostReason}`)
  }

  const nowTs = now()
  const wasLost = existing.status === 'lost'
  const lostReason = input.lost ? input.lostReason || 'other' : null
  await db
    .update(schema.leads)
    .set({
      // Reactivar vuelve al status que corresponde al stage actual — nunca a
      // 'new' a secas, que perdería en qué punto del pipeline estaba.
      status: input.lost ? 'lost' : STATUS_FOR_STAGE[(existing.stage as Stage) || 'new'],
      lostReason,
      updatedAt: nowTs,
    })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))

  // Sólo un cambio real de resultado deja fila (perder uno ya perdido con otro
  // motivo también: el motivo es parte de la decisión).
  if (input.lost || wasLost) {
    const reasonText = [lostReason ? LOST_REASON_TEXT[lostReason] || lostReason : null, input.note?.trim() || null].filter(Boolean).join(' — ') || null
    await db.insert(schema.leadStageHistory).values({
      organizationId: orgId,
      leadId,
      userId: opts.userId ?? null,
      fromStage: existing.stage,
      toStage: input.lost ? 'lost' : 'reactivated',
      reason: reasonText,
      createdAt: nowTs,
    })
  }

  return (await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId))).limit(1))[0]
}
