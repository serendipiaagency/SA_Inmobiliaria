import { useDb, schema, now } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { storeFile, mediaUrl } from '../../../../utils/media'

/**
 * Upload endpoint for the Media Library. Reuses storeFile's magic-byte
 * validation (same as every other upload in the app) — image/PDF/SVG only
 * for now; video/doc support is a documented follow-up (Fase 4 polish:
 * transcoding, thumbnails) rather than an unvalidated pass-through.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.data?.byteLength)
  if (!file) throw createError({ statusCode: 422, statusMessage: 'No file provided' })
  const folderPart = parts?.find((p) => p.name === 'folderId')
  const folderId = folderPart ? parseInt(new TextDecoder().decode(folderPart.data), 10) : null

  const key = await storeFile(event, file, `cms/${orgId}`)
  const url = mediaUrl(key) as string
  const type = (file.type || '').startsWith('image/svg') ? 'svg' : (file.type || '').startsWith('image/') ? 'image' : 'pdf'

  const db = useDb(event)
  const inserted = await db
    .insert(schema.cmsMedia)
    .values({
      organizationId: orgId,
      folderId: folderId && Number.isInteger(folderId) ? folderId : null,
      filename: file.filename || key.split('/').pop() || key,
      url,
      type,
      sizeBytes: file.data.byteLength,
      createdAt: now(),
    })
    .returning({ id: schema.cmsMedia.id })

  return { ok: true, id: inserted[0]?.id, url, key }
})
