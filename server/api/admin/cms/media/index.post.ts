import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { storeAndRegisterFile, mediaUrl } from '../../../../utils/media'
import { assertOwnedReference } from '../../../../utils/tenantPolicy'

/**
 * Upload endpoint for the Media Library. Reuses storeAndRegisterFile's
 * magic-byte + structural validation (same as every other upload in the
 * app) — image/PDF only; SVG is blocked platform-wide until a real
 * sanitizer is in place (see docs/media-security-audit.md §6).
 *
 * Registered `visibility: 'public'`: the Media Library exists to embed
 * images in published blog articles, so these are meant to be readable
 * without a session — but still tenant-owned and quota-counted like every
 * other tracked asset.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.data?.byteLength)
  if (!file) throw createError({ statusCode: 422, statusMessage: 'No file provided' })
  const folderPart = parts?.find((p) => p.name === 'folderId')
  const rawFolderId = folderPart ? parseInt(new TextDecoder().decode(folderPart.data), 10) : null

  const db = useDb(event)
  // A folder id from the form must be one of this tenant's own folders.
  const folderId =
    rawFolderId && Number.isInteger(rawFolderId)
      ? await assertOwnedReference(db, { table: schema.cmsMediaFolders, id: rawFolderId, orgId, label: 'Carpeta' })
      : null

  const stored = await storeAndRegisterFile(event, db, file, {
    organizationId: orgId,
    visibility: 'public',
    category: 'blog-image',
    entityType: 'cms_media',
    createdBy: user.id,
  })
  const url = mediaUrl(stored.key) as string
  const type = stored.mimeType === 'application/pdf' ? 'pdf' : 'image'

  const inserted = await db
    .insert(schema.cmsMedia)
    .values({
      organizationId: orgId,
      folderId,
      filename: file.filename || stored.key.split('/').pop() || stored.key,
      url,
      type,
      sizeBytes: stored.sizeBytes,
      createdAt: now(),
    })
    .returning({ id: schema.cmsMedia.id })
  const cmsMediaId = inserted[0]?.id

  // Backfill entityId onto the media_assets row now that the cms_media id exists.
  if (cmsMediaId) {
    await db.update(schema.mediaAssets).set({ entityId: cmsMediaId }).where(eq(schema.mediaAssets.id, stored.mediaAssetId))
  }

  return { ok: true, id: cmsMediaId, url, key: stored.key }
})
