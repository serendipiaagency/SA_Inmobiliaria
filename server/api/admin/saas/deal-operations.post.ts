import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { createDeal } from '../../../utils/deals/service'
import { logAdminAction } from '../../../utils/audit'

/** POST /api/admin/saas/deal-operations — "Crear operación": única forma de nacer un Deal, siempre sobre una Offer ya `accepted` (§94, nunca automático). */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = (await readBody<{ acceptedOfferId?: number }>(event)) || {}
  if (!body.acceptedOfferId) throw createError({ statusCode: 422, statusMessage: 'Falta la oferta aceptada' })

  const db = useDb(event)
  const deal = await createDeal(db, orgId, { acceptedOfferId: Number(body.acceptedOfferId) }, { createdBy: user.id })
  await logAdminAction(event, { user, orgId, action: 'create', resource: 'deal', resourceId: deal.id })
  return deal
})
