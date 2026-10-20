import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { listCampaigns } from '../../../../utils/newsletter/campaigns'

/** GET /api/admin/newsletter/campaigns — las campañas (borradores) de la empresa. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  return { items: await listCampaigns(useDb(event), orgId) }
})
