import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { createOffer, type CreateOfferInput } from '../../../utils/offers/service'
import { logAdminAction } from '../../../utils/audit'

/** POST /api/admin/saas/offers — crear una oferta en borrador (FASE 23), desde la ficha de Cliente, Compatibilidades o el resultado de una visita. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const body = (await readBody<CreateOfferInput>(event)) || ({} as CreateOfferInput)

  if (!body.propertyId || !body.propertyKind) throw createError({ statusCode: 422, statusMessage: 'Falta el inmueble' })
  if (!body.buyerContactId) throw createError({ statusCode: 422, statusMessage: 'Falta el comprador' })

  const offer = await createOffer(
    db,
    orgId,
    {
      propertyId: Number(body.propertyId),
      propertyKind: body.propertyKind,
      buyerContactId: Number(body.buyerContactId),
      sellerContactIds: (body.sellerContactIds || []).map(Number),
      leadId: body.leadId ? Number(body.leadId) : null,
      buyerRequirementId: body.buyerRequirementId ? Number(body.buyerRequirementId) : null,
      matchId: body.matchId ? Number(body.matchId) : null,
      commercialId: body.commercialId ? Number(body.commercialId) : null,
      amount: Number(body.amount),
      currency: body.currency,
      conditions: body.conditions || null,
      financeCondition: body.financeCondition || null,
      expiration: body.expiration || null,
    },
    { createdBy: user.id },
  )

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'offer', resourceId: offer.id })
  return offer
})
