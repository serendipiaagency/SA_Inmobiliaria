import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { cancelDeal } from '../../../../../utils/deals/service'
import { logAdminAction } from '../../../../../utils/audit'

/** POST /api/admin/saas/deal-operations/:id/cancel — cancela sin borrar nada (§114): histórico, Offer, Appointments, Tasks y Activity quedan intactos. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const dealId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(dealId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = (await readBody<{ reason?: string }>(event)) || {}
  if (!body.reason?.trim()) throw createError({ statusCode: 422, statusMessage: 'Indica el motivo de la cancelación' })

  const db = useDb(event)
  const deal = await cancelDeal(db, orgId, dealId, { actorType: 'user', actorId: user.id, reason: body.reason.trim() })
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'deal', resourceId: dealId, detail: 'cancelled' })
  return deal
})
