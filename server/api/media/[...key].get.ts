import type { H3Event } from 'h3'
import { cfEnv, useDb } from '../../utils/db'
import { requireOrgScope } from '../../utils/auth'
import { findMediaAssetByKey } from '../../utils/mediaAssets'
import { isPrivateMediaKey, legacyVisibilityFor, ownsMediaObject as legacyOwnsMediaObject } from '../../utils/mediaAccess'
import { logMediaAccess } from '../../utils/mediaAccessLog'

/**
 * R2 read-through — the Media Asset Manager's serving boundary (Fase 4).
 *
 * For every key, the flow is: look up `media_assets` → decide from its
 * `visibility` + `organizationId` → only then touch R2. The key itself never
 * grants access; a tenant that knows another tenant's exact R2 key gets
 * exactly as far as a tenant that's only guessing, which is nowhere.
 *
 *  - `public`   → served unauthenticated, cacheable.
 *  - `private` / `confidential` → admin session required, AND the asset's
 *    `organizationId` must match the caller's active organization. A
 *    mismatch is a 404, never a 403 — a 403 would confirm the object exists
 *    in someone else's account. Every read of a `confidential` object is
 *    logged (`media_access_log`), successful or denied.
 *  - Soft-deleted (`deletedAt` set) → 404. It's in its purge grace period,
 *    not servable, whatever its visibility was.
 *  - No `media_assets` row at all → an object written before this table
 *    existed. Known-sensitive legacy prefixes still get the old per-table
 *    ownership check (`server/utils/mediaAccess.ts`) as a safety net;
 *    everything else is legacy public content, served as it always was.
 */
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key')
  if (!key || key.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid media key' })
  }

  const db = useDb(event)
  const asset = (await findMediaAssetByKey(db, key))[0]

  if (asset) {
    if (asset.deletedAt) throw createError({ statusCode: 404, statusMessage: 'Not found' })

    if (asset.visibility === 'public') {
      return serveObject(event, key, asset.mimeType, { cacheable: true, restricted: false })
    }

    // private or confidential: admin session + tenant ownership.
    const { user, orgId } = await requireOrgScope(event)
    const owned = asset.organizationId === orgId
    await logMediaAccess(db, event, {
      organizationId: orgId,
      userId: user.id,
      userEmail: user.email,
      mediaAssetId: asset.id,
      r2Key: key,
      action: owned ? 'download' : 'denied',
      visibility: asset.visibility,
    })
    // 404, not 403 — a 403 would confirm the object exists in another
    // tenant's account, which is itself a disclosure this caller shouldn't get.
    if (!owned) throw createError({ statusCode: 404, statusMessage: 'Not found' })

    return serveObject(event, key, asset.mimeType, { cacheable: false, restricted: true, noStore: asset.visibility === 'confidential' })
  }

  // No tracked row — a legacy object. Known-sensitive prefixes still require
  // proof of ownership, resolved from the real tables that reference the key
  // (never from the key itself); everything else is legacy public content.
  if (isPrivateMediaKey(key)) {
    const { user, orgId } = await requireOrgScope(event)
    const owned = await legacyOwnsMediaObject(db, orgId, key)
    await logMediaAccess(db, event, {
      organizationId: orgId,
      userId: user.id,
      userEmail: user.email,
      mediaAssetId: null,
      r2Key: key,
      action: owned ? 'download' : 'denied',
      visibility: legacyVisibilityFor(key),
    })
    if (!owned) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    return serveObject(event, key, undefined, { cacheable: false, restricted: true, noStore: true })
  }

  return serveObject(event, key, undefined, { cacheable: true, restricted: false })
})

async function serveObject(
  event: H3Event,
  key: string,
  knownMimeType: string | undefined,
  opts: { cacheable: boolean; restricted: boolean; noStore?: boolean },
) {
  const obj = await cfEnv(event).MEDIA.get(key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  setHeader(event, 'Content-Type', knownMimeType || obj.httpMetadata?.contentType || 'application/octet-stream')
  // Belt-and-braces even though upload validation already confirms magic
  // bytes match the declared type: a browser that ignores the declared
  // Content-Type and sniffs the body is exactly the MIME-confusion attack
  // that validation exists to prevent from working in the first place.
  setHeader(event, 'X-Content-Type-Options', 'nosniff')

  if (opts.cacheable) {
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  } else {
    setHeader(event, 'Cache-Control', opts.noStore ? 'no-store' : 'private, no-store')
  }
  if (opts.restricted) setHeader(event, 'Content-Disposition', 'attachment')
  if (obj.httpEtag) setHeader(event, 'ETag', obj.httpEtag)
  return obj.body
}
