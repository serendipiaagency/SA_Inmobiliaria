import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { createCampaign } from '../../../../utils/newsletter/campaigns'

/** POST /api/admin/newsletter/campaigns — crea una campaña en borrador. */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const body = (await readBody<{ name?: unknown; subject?: unknown; blocks?: unknown }>(event)) || {}
  const campaign = await createCampaign(useDb(event), orgId, body, user.id)
  await logAdminAction(event, { user, orgId, action: 'create', resource: 'newsletter-campaigns', resourceId: campaign.id })
  return campaign
})
