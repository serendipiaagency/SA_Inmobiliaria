import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { createDeal, transitionDealStage, closeDeal, cancelDeal, type DealStage } from '../../../utils/deals/service'
import { logAdminAction } from '../../../utils/audit'

interface DealOperationPostBody {
  /** Sin `action`: "Crear operación" — única forma de nacer un Deal, siempre sobre una Offer ya `accepted` (§94, nunca automático). */
  acceptedOfferId?: number
  /** Con `action`: transición sobre una operación ya existente. */
  action?: 'stage' | 'close' | 'cancel'
  id?: number
  toStage?: string
  reason?: string
}

/**
 * POST /api/admin/saas/deal-operations — crea la operación (sin `action`) o
 * transiciona una existente (`action: 'stage'|'close'|'cancel'` + `id`).
 *
 * Todo bajo una única clave de ruta a propósito — ver el comentario en
 * `deal-operations.get.ts` sobre el margen agotado de `npm run typecheck`
 * frente al TS2589 de Nitro (docs/production-hardening-audit.md, P1-14).
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = (await readBody<DealOperationPostBody>(event)) || {}
  const db = useDb(event)

  if (!body.action) {
    if (!body.acceptedOfferId) throw createError({ statusCode: 422, statusMessage: 'Falta la oferta aceptada' })
    const deal = await createDeal(db, orgId, { acceptedOfferId: Number(body.acceptedOfferId) }, { createdBy: user.id })
    await logAdminAction(event, { user, orgId, action: 'create', resource: 'deal', resourceId: deal.id })
    return deal
  }

  const dealId = Number(body.id)
  if (!Number.isFinite(dealId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  if (body.action === 'stage') {
    if (!body.toStage) throw createError({ statusCode: 422, statusMessage: 'Falta la etapa destino' })
    const deal = await transitionDealStage(db, orgId, dealId, body.toStage as DealStage, { actorType: 'user', actorId: user.id, reason: body.reason })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'deal', resourceId: dealId, detail: `stage:${body.toStage}` })
    return deal
  }

  if (body.action === 'close') {
    const deal = await closeDeal(db, orgId, dealId, { actorType: 'user', actorId: user.id, reason: body.reason })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'deal', resourceId: dealId, detail: 'closed' })
    return deal
  }

  if (body.action === 'cancel') {
    if (!body.reason?.trim()) throw createError({ statusCode: 422, statusMessage: 'Indica el motivo de la cancelación' })
    const deal = await cancelDeal(db, orgId, dealId, { actorType: 'user', actorId: user.id, reason: body.reason.trim() })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'deal', resourceId: dealId, detail: 'cancelled' })
    return deal
  }

  throw createError({ statusCode: 422, statusMessage: 'Acción no reconocida' })
})
