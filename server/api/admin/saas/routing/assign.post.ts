import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { RoutingError, assignLead } from '../../../../utils/leads/routingService'

/**
 * Asigna un lead. Sin `commercialId` lo decide el motor; con él es una
 * reasignación manual, que también queda registrada con quién y por qué.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ leadId: number; commercialId?: number; reason?: string }>(event)
  if (!Number.isInteger(body?.leadId)) throw createError({ statusCode: 422, statusMessage: 'Falta el lead' })

  try {
    const result = await assignLead(event, orgId, body.leadId, {
      userId: user.id,
      commercialId: body.commercialId,
      reason: body.reason,
    })
    await logAdminAction(event, {
      user,
      orgId,
      action: 'update',
      resource: 'lead',
      resourceId: body.leadId,
      detail: result.decision.explanation,
    })
    return result
  } catch (error) {
    if (error instanceof RoutingError) {
      throw createError({ statusCode: error.message.includes('no encontrado') ? 404 : 422, statusMessage: error.message })
    }
    throw error
  }
})
