import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { recordVisitOutcome } from '../../../../../utils/appointments/outcome'
import { logAdminAction } from '../../../../../utils/audit'

interface RecordOutcomeBody {
  outcome?: string
  notes?: string | null
}

/** POST /api/admin/saas/visits/:id/outcome — anota (o corrige) el resultado de una visita ya completada. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const visitId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(visitId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = (await readBody<RecordOutcomeBody>(event)) || {}
  const db = useDb(event)
  const result = await recordVisitOutcome(db, orgId, visitId, { outcome: String(body.outcome || ''), notes: body.notes })

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'visit-outcome', resourceId: visitId, detail: result.outcome })
  return result
})
