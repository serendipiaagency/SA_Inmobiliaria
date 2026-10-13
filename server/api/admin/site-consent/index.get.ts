import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { getConsentDraft, loadConsentProfile } from '../../../utils/siteConsent'

/**
 * GET /api/admin/site-consent — la presentación del aviso de cookies y del
 * aviso de demostración en el Constructor Web: su borrador, si hay cambios
 * sin publicar, y lo que el aviso toma de la empresa (logo, color, nombre,
 * datos legales que faltan, si es una demo).
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  const db = useDb(event)
  const [draft, profile] = await Promise.all([getConsentDraft(db, orgId), loadConsentProfile(db, orgId)])
  return { ...draft, profile }
})
