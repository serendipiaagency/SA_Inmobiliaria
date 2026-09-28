import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { counterOffer, type OfferActorType } from '../../../../../utils/offers/service'
import { logAdminAction } from '../../../../../utils/audit'

interface CounterBody {
  amount?: number
  conditions?: string | null
  financeCondition?: string | null
  expiration?: string | null
  /** Quién hace la contraoferta — el comercial la registra en nombre de comprador o vendedor cuando llega por teléfono/presencial. */
  actorType?: OfferActorType
}

/** POST /api/admin/saas/offers/:id/counter — nueva cantidad, sin perder la anterior (queda en su revisión). */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const offerId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(offerId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = (await readBody<CounterBody>(event)) || {}
  if (body.amount === undefined) throw createError({ statusCode: 422, statusMessage: 'Falta el importe de la contraoferta' })

  const db = useDb(event)
  const actorType = body.actorType && body.actorType !== 'user' ? body.actorType : 'user'
  const offer = await counterOffer(
    db,
    orgId,
    offerId,
    { amount: Number(body.amount), conditions: body.conditions, financeCondition: body.financeCondition, expiration: body.expiration },
    { actorType, actorId: actorType === 'user' ? user.id : null },
  )

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'offer', resourceId: offerId, detail: `countered:${body.amount}` })
  return offer
})
