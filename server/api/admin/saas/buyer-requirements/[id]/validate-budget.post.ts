import { requireOrgScope } from '../../../../../utils/auth'
import { logAdminAction } from '../../../../../utils/audit'
import { validateBudget } from '../../../../../utils/buyerRequirements/service'

/**
 * Validar el presupuesto es una acción con autor y fecha, no un campo que se
 * marque solo porque el cliente haya dicho una cifra.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Id inválido' })

  const body = await readBody<{ validated?: boolean }>(event)
  const validated = body?.validated !== false

  const updated = await validateBudget(event, orgId, id, user.id, validated)
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Necesidad no encontrada' })

  await logAdminAction(event, {
    user,
    orgId,
    action: 'update',
    resource: 'buyer_requirement',
    resourceId: id,
    detail: validated ? 'presupuesto validado' : 'validación de presupuesto retirada',
  })
  return updated
})
