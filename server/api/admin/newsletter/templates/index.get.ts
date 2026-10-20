import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { listTemplates } from '../../../../utils/newsletter/campaigns'

/** GET /api/admin/newsletter/templates — las plantillas reutilizables de la empresa. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  return { items: await listTemplates(useDb(event), orgId) }
})
