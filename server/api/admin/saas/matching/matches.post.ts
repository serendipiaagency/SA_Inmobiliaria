import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { MatchStatusError, setMatchStatus, type MatchStatus } from '../../../../utils/matching/service'

/**
 * Guarda la decisión comercial sobre un match: seleccionarlo o descartarlo.
 *
 * El score y el desglose NO se aceptan del cliente — se recalculan en el
 * servidor con el motor. Si el navegador pudiera enviarlos, el histórico
 * diría lo que quisiera quien llamó a la API.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ buyerRequirementId: number; propertyId: number; status: MatchStatus; discardedReason?: string }>(event)

  if (!Number.isInteger(body?.buyerRequirementId) || !Number.isInteger(body?.propertyId)) {
    throw createError({ statusCode: 422, statusMessage: 'Faltan la necesidad y el inmueble' })
  }

  try {
    const match = await setMatchStatus(
      event,
      orgId,
      {
        buyerRequirementId: body.buyerRequirementId,
        propertyId: body.propertyId,
        status: body.status,
        discardedReason: body.discardedReason,
      },
      { userId: user.id },
    )

    await logAdminAction(event, {
      user,
      orgId,
      action: 'update',
      resource: 'property_match',
      resourceId: match.id,
      detail: `${body.status}${body.discardedReason ? `: ${body.discardedReason}` : ''}`,
    })

    return match
  } catch (error) {
    if (error instanceof MatchStatusError) throw createError({ statusCode: 422, statusMessage: error.message })
    throw error
  }
})
