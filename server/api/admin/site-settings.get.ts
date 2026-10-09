import { requireOrgScope } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { getCookieProviders } from '../../utils/siteSettings'

/** GET /api/admin/site-settings — los proveedores del aviso de cookies de la web de la organización activa. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  return { cookies: await getCookieProviders(useDb(event), orgId) }
})
