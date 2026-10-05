import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { counterOffer, newOffer, type OfferActorType } from '../../../../../utils/offers/service'
import { logAdminAction } from '../../../../../utils/audit'

interface CounterBody {
  amount?: number
  conditions?: string | null
  financeCondition?: string | null
  expiration?: string | null
  /** Quién hace la contraoferta — el comercial la registra en nombre de comprador o vendedor cuando llega por teléfono/presencial. */
  actorType?: OfferActorType
  /**
   * `counter` (por defecto): contraoferta — `submitted`/`countered` → `countered`.
   * `new_offer`: nueva oferta del comprador en respuesta a una contraoferta —
   * `countered` → `submitted` (bloque N6). Comparten ruta: el presupuesto de
   * rutas de Nitro está agotado y los dos son «nuevos términos sin perder
   * los anteriores».
   */
  kind?: 'counter' | 'new_offer'
}

/** POST /api/admin/saas/offers/:id/counter — nuevos términos completos (importe, condiciones, financiación, vencimiento), sin perder los anteriores (quedan en su revisión). */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const offerId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(offerId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = (await readBody<CounterBody>(event)) || {}
  if (body.amount === undefined || body.amount === null || (body.amount as any) === '') throw createError({ statusCode: 422, statusMessage: 'Falta el importe' })
  if (body.kind !== undefined && body.kind !== 'counter' && body.kind !== 'new_offer') throw createError({ statusCode: 422, statusMessage: 'Tipo de movimiento no válido' })

  const db = useDb(event)
  const isNewOffer = body.kind === 'new_offer'
  // Una nueva oferta la hace el comprador; una contraoferta, quien diga el comercial (por defecto, él mismo).
  const actorType: OfferActorType = isNewOffer ? (body.actorType === 'user' ? 'user' : 'buyer') : body.actorType && body.actorType !== 'user' ? body.actorType : 'user'
  const terms = { amount: Number(body.amount), conditions: body.conditions, financeCondition: body.financeCondition, expiration: body.expiration }
  const actor = { actorType, actorId: actorType === 'user' ? user.id : null }
  const offer = isNewOffer ? await newOffer(db, orgId, offerId, terms, actor) : await counterOffer(db, orgId, offerId, terms, actor)

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'offer', resourceId: offerId, detail: `${isNewOffer ? 'new_offer' : 'countered'}:${body.amount}` })
  return offer
})
