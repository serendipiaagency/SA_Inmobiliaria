import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { acceptOffer, type OfferActorType } from '../../../../../utils/offers/service'
import { logAdminAction } from '../../../../../utils/audit'

interface AcceptBody {
  actorType?: OfferActorType
  /** El id de la revisión que se está aceptando — si mientras tanto llegó una contraoferta posterior, se rechaza con 409 (§85). */
  revisionId?: number
}

/** POST /api/admin/saas/offers/:id/accept — `submitted`/`countered` → `accepted`, sobre los términos actuales. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const offerId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(offerId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = (await readBody<AcceptBody>(event)) || {}
  const db = useDb(event)
  const actorType = body.actorType && body.actorType !== 'user' ? body.actorType : 'user'
  const offer = await acceptOffer(db, orgId, offerId, { actorType, actorId: actorType === 'user' ? user.id : null }, body.revisionId ? Number(body.revisionId) : undefined)

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'offer', resourceId: offerId, detail: 'accepted' })
  return offer
})
