import { requireOrgScope } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { getSlaSettings } from '../../../../utils/leads/sla'

/** GET /api/admin/saas/leads-routing/sla-settings — umbrales de SLA de la organización (con defaults si nunca se configuraron). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  return getSlaSettings(useDb(event), orgId)
})
