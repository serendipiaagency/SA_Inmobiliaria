import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { submitOffer } from '../../../../../utils/offers/service'
import { logAdminAction } from '../../../../../utils/audit'

interface SubmitBody {
  amount?: number
  conditions?: string | null
  financeCondition?: string | null
  expiration?: string | null
}

/** POST /api/admin/saas/offers/:id/submit — `draft` → `submitted`. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const offerId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(offerId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = (await readBody<SubmitBody>(event)) || {}
  const db = useDb(event)
  const offer = await submitOffer(
    db,
    orgId,
    offerId,
    { amount: body.amount !== undefined ? Number(body.amount) : undefined, conditions: body.conditions, financeCondition: body.financeCondition, expiration: body.expiration },
    { actorType: 'user', actorId: user.id },
  )

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'offer', resourceId: offerId, detail: 'submitted' })
  return offer
})
