import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { withdrawOffer, type OfferActorType } from '../../../../../utils/offers/service'
import { logAdminAction } from '../../../../../utils/audit'

/** POST /api/admin/saas/offers/:id/withdraw — `draft`/`submitted`/`countered` → `withdrawn`. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const offerId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(offerId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = (await readBody<{ actorType?: OfferActorType }>(event)) || {}
  const db = useDb(event)
  const actorType = body.actorType && body.actorType !== 'user' ? body.actorType : 'user'
  const offer = await withdrawOffer(db, orgId, offerId, { actorType, actorId: actorType === 'user' ? user.id : null })

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'offer', resourceId: offerId, detail: 'withdrawn' })
  return offer
})
