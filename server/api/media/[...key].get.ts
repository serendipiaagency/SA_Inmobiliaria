import { cfEnv, useDb } from '../../utils/db'
import { requireOrgScope } from '../../utils/auth'
import { isPrivateMediaKey, ownsMediaObject } from '../../utils/mediaAccess'

/**
 * R2 read-through.
 *
 * This route is the only thing standing between the public web and a bucket
 * that holds both public imagery and private tenant documents. Private objects
 * used to be reachable by *any* authenticated admin (`visitor-docs/`, gated by
 * `requireAdmin` alone) or by *anyone at all* (every other private prefix,
 * which no rule covered) — so one tenant's admin could pull another tenant's
 * client passport scans and signed contracts straight out of R2, bypassing
 * every org-scoped endpoint that guards the same files.
 *
 * Private prefixes now require an admin session AND ownership of the object by
 * the caller's active organization. Rules live in utils/mediaAccess.ts.
 */
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  if (!key || key.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid media key' })
  }

  const restricted = isPrivateMediaKey(key)
  if (restricted) {
    const { orgId } = await requireOrgScope(event)
    // 404, not 403: a 403 would confirm the object exists in another tenant's
    // account, which is itself information this caller shouldn't have.
    if (!(await ownsMediaObject(useDb(event), orgId, key))) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
  }

  const obj = await cfEnv(event).MEDIA.get(key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setHeader(event, 'Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream')
  setHeader(event, 'Cache-Control', restricted ? 'private, no-store' : 'public, max-age=31536000, immutable')
  if (restricted) setHeader(event, 'Content-Disposition', 'attachment')
  if (obj.httpEtag) setHeader(event, 'ETag', obj.httpEtag)
  return obj.body
})
