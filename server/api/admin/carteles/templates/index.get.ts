import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { listPosterTemplates, POSTER_FORMAT_KEYS } from '../../../../utils/posters/service'
import { FORMAT_BY_KEY } from '../../../../utils/assetExport/formats'

/** GET /api/admin/carteles/templates — plantillas visibles (de sistema + propias) y los formatos de cartel. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  return {
    items: await listPosterTemplates(useDb(event), orgId),
    formats: POSTER_FORMAT_KEYS.map((key) => ({ key, label: FORMAT_BY_KEY[key]!.label, orientation: FORMAT_BY_KEY[key]!.orientation })),
  }
})
