import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { saveFooterDraft, validateFooterConfig } from '../../../utils/siteFooter'

/**
 * PUT /api/admin/site-footer — autoguardado del pie en el Constructor: sólo
 * el borrador, normalizado (utils/siteFooter.ts). La web no cambia hasta
 * publicar. Como el autoguardado de las páginas, no deja una fila de
 * auditoría por guardado; la publicación sí.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'write')
  const config = validateFooterConfig(await readBody(event))
  await saveFooterDraft(useDb(event), orgId, config)
  return { ok: true, config }
})
