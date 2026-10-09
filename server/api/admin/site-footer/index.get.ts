import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { getFooterDraft, loadFooterAvailability, loadFooterProfile } from '../../../utils/siteFooter'

/**
 * GET /api/admin/site-footer — el pie global en el Constructor Web: su
 * borrador, si hay cambios sin publicar, y los datos de la empresa que usa
 * cuando no se escriben a mano (para que el editor enseñe de dónde salen).
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  const db = useDb(event)
  const [draft, profile, available] = await Promise.all([getFooterDraft(db, orgId), loadFooterProfile(db, orgId), loadFooterAvailability(db, orgId)])
  return { ...draft, profile, available }
})
