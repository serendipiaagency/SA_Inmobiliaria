import { and, eq, isNull } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { transitionLeadStage, setLeadOutcome, LeadPipelineError, LOST_REASONS, STAGES, STAGE_REASON_MAX, requirePanelStageReason } from '../../../../utils/leads/pipeline'
import { schema, useDb } from '../../../../utils/db'
import { getLeadScoreDetail, recomputeLeadScore } from '../../../../utils/leads/score'

/**
 * Mueve un lead en el pipeline (drag&drop/dropdown del Kanban) o fija su
 * resultado (perdido/reactivado) — FASE 13, migración 0069.
 *
 * Las dos dimensiones son independientes: mandar `stage` mueve la posición y
 * queda en lead_stage_history; mandar `lost` fija el resultado sin tocar en
 * qué stage se quedó. `status` sigue aceptándose por compatibilidad con
 * peticiones antiguas — se traduce al stage equivalente más cercano.
 *
 * Es la ruta del panel, así que cada movimiento exige su motivo (422 sin
 * él): `reason` al cambiar de fase, `lostReason` del catálogo al perder y
 * `note` al reactivar.
 *
 * `{ score: 'recalculate' }` (FASE 32): recálculo manual del Lead Score con
 * las señales reales; devuelve el desglose y el historial.
 */
const LEGACY_STATUS_TO_STAGE: Record<string, string> = { new: 'new', contacted: 'contacted', qualified: 'qualified', proposal: 'offer', won: 'won' }

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = parseInt(String(getRouterParam(event, 'id')), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const body = await readBody<{ stage?: string; status?: string; reason?: string; lost?: boolean; lostReason?: string; note?: string; score?: 'recalculate' }>(event)

  // FASE 32 — «Recalcular» del Lead Score explicable, como rama de esta ruta
  // y no como una nueva (margen de claves de ruta = 0, ver
  // docs/property-schema-registry.md). Vuelve a leer las señales reales del
  // lead; el desglose sólo-lectura se pide por GET (leads.get.ts?scoreFor=).
  if (body?.score === 'recalculate') {
    const db = useDb(event)
    const r = await recomputeLeadScore(db, orgId, id, 'manual')
    if (!r) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'lead', resourceId: id, detail: `score recalculado: ${r.score}` })
    const detail = await getLeadScoreDetail(db, orgId, id)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })
    return detail
  }

  // Un lead de otra agencia (o borrado) no existe para esta: 404 antes de
  // mirar nada más (antes salía un 422 del servicio).
  const [owned] = await useDb(event)
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, id), eq(schema.leads.organizationId, orgId), isNull(schema.leads.deletedAt)))
    .limit(1)
  if (!owned) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })

  // Cierre del núcleo (FASE 13): desde el panel, TODO movimiento lleva motivo
  // y el servidor lo exige — cambiar de fase (`reason`), perder (motivo del
  // catálogo en `lostReason`, comentario opcional en `note`) y reactivar
  // (`note`, o `reason`). Antes sólo «perdido» lo pedía y el Kanban, la Tabla
  // y la ficha dejaban historial sin motivo. Las entradas automáticas no
  // pasan por aquí: llevan su propio motivo (ver requirePanelStageReason).
  try {
    if (body?.lost !== undefined) {
      let note = body.note
      if (body.lost) {
        if (!body.lostReason || !LOST_REASONS.includes(body.lostReason as any)) throw new LeadPipelineError('Elige el motivo de la pérdida (No responde, No interesado, Duplicado u otro)')
        if (note != null && String(note).length > STAGE_REASON_MAX) throw new LeadPipelineError(`El comentario admite como máximo ${STAGE_REASON_MAX} caracteres`)
      } else {
        note = requirePanelStageReason(body.note ?? body.reason, 'de la reactivación')
      }
      const updated = await setLeadOutcome(event, orgId, id, { lost: !!body.lost, lostReason: body.lostReason, note }, { userId: user.id })
      await logAdminAction(event, { user, orgId, action: 'update', resource: 'lead', resourceId: id, detail: body.lost ? `perdido: ${updated.lostReason}` : 'reactivado' })
      return { ok: true, id, status: updated.status, stage: updated.stage, lostReason: updated.lostReason }
    }

    const toStage = body?.stage && STAGES.includes(body.stage as any) ? body.stage : body?.status && LEGACY_STATUS_TO_STAGE[body.status]
    if (!toStage) throw createError({ statusCode: 400, statusMessage: 'Falta stage (o status/lost equivalente)' })
    const reason = requirePanelStageReason(body.reason)

    const updated = await transitionLeadStage(event, orgId, id, { toStage, reason }, { userId: user.id })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'lead', resourceId: id, detail: `stage → ${toStage}` })
    return { ok: true, id, status: updated.status, stage: updated.stage }
  } catch (err) {
    if (err instanceof LeadPipelineError) throw createError({ statusCode: 422, statusMessage: err.message })
    throw err
  }
})
