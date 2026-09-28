import { requireOrgScope } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { getDealDetail } from '../../../../utils/deals/service'

/** GET /api/admin/saas/deal-operations/:id — ficha de la operación: histórico de etapa, vendedores, citas, tareas y su próxima acción derivada. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const dealId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(dealId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  return getDealDetail(db, orgId, dealId)
})
