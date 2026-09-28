import { requireOrgScope } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { getOfferWithRevisions } from '../../../../utils/offers/service'

/** GET /api/admin/saas/offers/:id — la oferta con su histórico de revisiones (timeline), §90. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const offerId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(offerId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  return getOfferWithRevisions(db, orgId, offerId)
})
