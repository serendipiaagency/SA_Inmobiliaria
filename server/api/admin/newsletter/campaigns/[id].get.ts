import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { getCampaign } from '../../../../utils/newsletter/campaigns'

/** GET /api/admin/newsletter/campaigns/:id — una campaña con su contenido. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Campaña no válida' })
  return await getCampaign(useDb(event), orgId, id)
})
