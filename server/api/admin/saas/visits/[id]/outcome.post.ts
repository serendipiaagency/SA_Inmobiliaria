import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { recordVisitOutcome, type RecordVisitOutcomeInput } from '../../../../../utils/appointments/outcome'
import { logAdminAction } from '../../../../../utils/audit'

/**
 * POST /api/admin/saas/visits/:id/outcome — anota (o corrige) el resultado
 * estructurado de una visita ya realizada (FASE 19): cómo quedó, interés
 * 1-5, qué le gustó y qué no, percepción del precio, valoraciones de
 * ubicación/estado/distribución, segunda visita, oferta y descarte. Con
 * `followUp` crea una tarea, con `secondVisit` agenda la segunda visita y con
 * `createOffer` una oferta en borrador (OfferService). `contactId` vincula al
 * comprador si la visita aún no tenía contacto.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const visitId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(visitId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const body = ((await readBody<RecordVisitOutcomeInput>(event)) || {}) as RecordVisitOutcomeInput
  const db = useDb(event)
  const result = await recordVisitOutcome(
    db,
    orgId,
    visitId,
    {
      outcome: String(body.outcome || ''),
      notes: body.notes,
      interestLevel: body.interestLevel,
      liked: body.liked,
      disliked: body.disliked,
      pricePerception: body.pricePerception,
      locationRating: body.locationRating,
      conditionRating: body.conditionRating,
      layoutRating: body.layoutRating,
      wantsSecondVisit: body.wantsSecondVisit,
      wantsToOffer: body.wantsToOffer,
      discarded: body.discarded,
      contactId: body.contactId,
      followUp: body.followUp,
      secondVisit: body.secondVisit,
      createOffer: body.createOffer,
    },
    { actorId: user.id },
  )

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'visit-outcome', resourceId: visitId, detail: result.outcome })
  return result
})
