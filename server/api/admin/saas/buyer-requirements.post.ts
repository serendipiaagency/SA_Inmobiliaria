import { requireOrgScope } from '../../../utils/auth'
import { logAdminAction } from '../../../utils/audit'
import { createBuyerRequirement, BuyerRequirementValidationError, type BuyerRequirementInput } from '../../../utils/buyerRequirements/service'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<BuyerRequirementInput>(event)

  try {
    const requirement = await createBuyerRequirement(event, orgId, body, { createdBy: user.id })
    await logAdminAction(event, { user, orgId, action: 'create', resource: 'buyer_requirement', resourceId: requirement.id })
    return requirement
  } catch (err) {
    // Las reglas del dominio se traducen a 422 con el mensaje real, para que
    // el formulario pueda enseñárselo a quien lo rellena.
    if (err instanceof BuyerRequirementValidationError) {
      // 422 para un dato inválido; 404 para un contacto que no es de esta agencia.
      throw createError({ statusCode: err.statusCode, statusMessage: err.message })
    }
    throw err
  }
})
