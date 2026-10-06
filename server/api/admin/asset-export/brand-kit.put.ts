import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'
import { saveBrandKit, type BrandKitBody } from '../../../utils/brandKit/save'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<BrandKitBody>(event)
  const { brandKit, created } = await saveBrandKit(useDb(event), orgId, user.id, body || {})
  await logAdminAction(event, { user, orgId, action: created ? 'create' : 'update', resource: 'brand-kit', resourceId: brandKit.id })
  return brandKit
})
