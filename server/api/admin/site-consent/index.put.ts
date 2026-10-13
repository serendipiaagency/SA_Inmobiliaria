import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { saveConsentDraft, validateSiteConsent } from '../../../utils/siteConsent'

/**
 * PUT /api/admin/site-consent — autoguardado del Constructor: sólo el
 * borrador, normalizado (utils/siteConsent.ts). La web no cambia hasta
 * publicar. Como el pie, no deja fila de auditoría por guardado; la
 * publicación sí.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'write')
  const config = validateSiteConsent(await readBody(event))
  await saveConsentDraft(useDb(event), orgId, config)
  return { ok: true, config }
})
