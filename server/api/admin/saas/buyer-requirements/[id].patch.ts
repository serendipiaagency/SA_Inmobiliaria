import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { updateBuyerRequirement, BuyerRequirementValidationError, type BuyerRequirementInput } from '../../../../utils/buyerRequirements/service'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Id inválido' })

  const body = await readBody<Partial<BuyerRequirementInput>>(event)
  try {
    const updated = await updateBuyerRequirement(event, orgId, id, body)
    if (!updated) throw createError({ statusCode: 404, statusMessage: 'Necesidad no encontrada' })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'buyer_requirement', resourceId: id })
    return updated
  } catch (err) {
    if (err instanceof BuyerRequirementValidationError) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }
})
