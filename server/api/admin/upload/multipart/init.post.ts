import { requireOrgScope } from '../../../../utils/auth'
import { useDb, cfEnv } from '../../../../utils/db'
import { initMultipartUpload } from '../../../../utils/mediaMultipart'

// Only these folders may open a video multipart upload — an arbitrary
// folder accepting 100 MB files instead of a few MB of images would be a
// quota/storage surprise for anything that doesn't actually need video.
// Mirrors the same set server/api/admin/upload.post.ts used to gate its
// (now removed) video path.
const VIDEO_FOLDERS = new Set(['developer-properties'])

/** Step 1 of 3 (init → part → complete): opens the R2 multipart upload and records ownership in D1. See server/utils/mediaMultipart.ts. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ folder?: string; mimeType?: string; filename?: string; sizeBytes?: number }>(event)

  const folder = String(body?.folder || '').replace(/[^a-z0-9_-]/gi, '') || 'uploads'
  if (!VIDEO_FOLDERS.has(folder)) {
    throw createError({ statusCode: 422, statusMessage: `Video uploads aren't supported for folder "${folder}"` })
  }

  const db = useDb(event)
  const bucket = cfEnv(event).MEDIA
  return await initMultipartUpload(db, bucket, {
    organizationId: orgId,
    createdBy: user.id,
    category: 'property-video',
    entityType: folder,
    mimeType: String(body?.mimeType || ''),
    originalFilename: body?.filename || null,
    declaredSizeBytes: Number(body?.sizeBytes),
  })
})
