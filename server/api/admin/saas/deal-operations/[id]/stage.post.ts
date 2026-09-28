import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { transitionDealStage, type DealStage } from '../../../../../utils/deals/service'
import { logAdminAction } from '../../../../../utils/audit'

/** POST /api/admin/saas/deal-operations/:id/stage — mover de etapa (nunca a "closed": esa es la acción "Cerrar"). */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const dealId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(dealId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = (await readBody<{ toStage?: string; reason?: string | null }>(event)) || {}
  if (!body.toStage) throw createError({ statusCode: 422, statusMessage: 'Falta la etapa destino' })

  const db = useDb(event)
  const deal = await transitionDealStage(db, orgId, dealId, body.toStage as DealStage, { actorType: 'user', actorId: user.id, reason: body.reason })
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'deal', resourceId: dealId, detail: `stage:${body.toStage}` })
  return deal
})
