import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { transitionLeadStage, setLeadOutcome, LeadPipelineError, STAGES } from '../../../../utils/leads/pipeline'

/**
 * Mueve un lead en el pipeline (drag&drop/dropdown del Kanban) o fija su
 * resultado (perdido/reactivado) — FASE 13, migración 0069.
 *
 * Las dos dimensiones son independientes: mandar `stage` mueve la posición y
 * queda en lead_stage_history; mandar `lost` fija el resultado sin tocar en
 * qué stage se quedó. `status` sigue aceptándose por compatibilidad con
 * peticiones antiguas — se traduce al stage equivalente más cercano.
 */
const LEGACY_STATUS_TO_STAGE: Record<string, string> = { new: 'new', contacted: 'contacted', qualified: 'qualified', proposal: 'offer', won: 'won' }

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = parseInt(String(getRouterParam(event, 'id')), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const body = await readBody<{ stage?: string; status?: string; reason?: string; lost?: boolean; lostReason?: string }>(event)

  try {
    if (body?.lost !== undefined) {
      const updated = await setLeadOutcome(event, orgId, id, { lost: !!body.lost, lostReason: body.lostReason })
      await logAdminAction(event, { user, orgId, action: 'update', resource: 'lead', resourceId: id, detail: body.lost ? `perdido: ${updated.lostReason}` : 'reactivado' })
      return { ok: true, id, status: updated.status, stage: updated.stage, lostReason: updated.lostReason }
    }

    const toStage = body?.stage && STAGES.includes(body.stage as any) ? body.stage : body?.status && LEGACY_STATUS_TO_STAGE[body.status]
    if (!toStage) throw createError({ statusCode: 400, statusMessage: 'Falta stage (o status/lost equivalente)' })

    const updated = await transitionLeadStage(event, orgId, id, { toStage, reason: body.reason }, { userId: user.id })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'lead', resourceId: id, detail: `stage → ${toStage}` })
    return { ok: true, id, status: updated.status, stage: updated.stage }
  } catch (err) {
    if (err instanceof LeadPipelineError) throw createError({ statusCode: 422, statusMessage: err.message })
    throw err
  }
})
