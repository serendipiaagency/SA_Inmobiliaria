import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { normalizeBlocks, renderNewsletterHtml, orgBranding } from '../../../utils/newsletter/campaigns'

/**
 * POST /api/admin/newsletter/preview — renderiza unos bloques como el email que
 * se vería, con la marca de la agencia, sin guardar nada. El editor lo usa para
 * la vista previa en vivo. Devuelve `{ html }`.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  const body = (await readBody<{ subject?: unknown; blocks?: unknown }>(event)) || {}
  const branding = await orgBranding(useDb(event), orgId)
  const html = renderNewsletterHtml(normalizeBlocks(body.blocks), {
    branding,
    subject: String(body.subject ?? '').slice(0, 200),
  })
  return { html }
})
