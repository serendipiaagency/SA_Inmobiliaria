import { useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { restorePageVersion, requireValidPageKey } from '../../../../utils/sitePages'

/**
 * Restores a published version **onto the draft**, never straight to the
 * public site. The editor then reviews it and publishes, which is what makes
 * this safe to expose: the worst outcome of a wrong click is a draft that has
 * to be undone, not a live site that changed under the visitors' feet.
 *
 * Audited like publish, because it overwrites work: the previous draft — any
 * unpublished changes included — is replaced by the snapshot.
 */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event)
  const pageKey = requireValidPageKey(getRouterParam(event, 'pageKey'))
  const db = useDb(event)

  const body = await readBody(event)
  const version = Number(body?.version)
  if (!Number.isInteger(version) || version < 1) {
    throw createError({ statusCode: 422, statusMessage: 'Versión inválida' })
  }

  const doc = await restorePageVersion(db, orgId, pageKey, version)
  await logAdminAction(event, {
    user,
    orgId,
    action: 'restore',
    resource: 'site-pages',
    resourceId: pageKey,
    detail: `restore v${version} al borrador`,
  })

  return { ok: true, version, blocks: doc.blocks, seo: doc.seo }
})
