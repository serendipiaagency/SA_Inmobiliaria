import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { closeDeal } from '../../../../../utils/deals/service'
import { logAdminAction } from '../../../../../utils/audit'

/** POST /api/admin/saas/deal-operations/:id/close — cierra la operación y sincroniza el estado del inmueble cuando el catálogo lo soporta. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const dealId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(dealId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = (await readBody<{ reason?: string | null }>(event)) || {}
  const db = useDb(event)
  const deal = await closeDeal(db, orgId, dealId, { actorType: 'user', actorId: user.id, reason: body.reason })
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'deal', resourceId: dealId, detail: 'closed' })
  return deal
})
