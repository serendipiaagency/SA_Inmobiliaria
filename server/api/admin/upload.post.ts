import { requireOrgScope } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { storeAndRegisterFile, ALLOWED_VIDEO_TYPES, MAX_VIDEO_UPLOAD_BYTES } from '../../utils/media'
import type { MediaCategory } from '../../utils/mediaAssets'

const PROPERTY_PHOTO_FOLDERS = new Set(['developer-properties', 'properties', 'floor-plans', 'project-images', 'gallery-images', 'social-media'])
const LOGO_FOLDERS = new Set(['brand-kit', 'developers', 'agents', 'team'])
// Only these folders may opt into a video upload (via kind=video below) — an
// arbitrary folder accepting 100 MB files instead of 10 MB images would be a
// quota/storage surprise for anything that doesn't actually need video.
const VIDEO_FOLDERS = new Set(['developer-properties'])

function categoryFor(folder: string): MediaCategory {
  if (PROPERTY_PHOTO_FOLDERS.has(folder)) return 'property-photo'
  if (LOGO_FOLDERS.has(folder)) return 'logo'
  return 'upload'
}

/**
 * Generic image upload for the admin catalog forms (logos, cover photos,
 * floor-plan images, master plans, community imagery…). Everything here ends
 * up embedded on the public site, so it's registered `visibility: 'public'` —
 * cacheable, no auth required to read back — but it's still a real,
 * quota-counted, tenant-owned `media_assets` row, not an anonymous R2 write.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.data?.byteLength)
  if (!file) throw createError({ statusCode: 422, statusMessage: 'No file provided' })
  const folderPart = parts?.find((p) => p.name === 'folder')
  const folder = (folderPart ? new TextDecoder().decode(folderPart.data) : 'uploads').replace(/[^a-z0-9_-]/gi, '') || 'uploads'
  const kindPart = parts?.find((p) => p.name === 'kind')
  const isVideo = kindPart ? new TextDecoder().decode(kindPart.data) === 'video' : false
  if (isVideo && !VIDEO_FOLDERS.has(folder)) {
    throw createError({ statusCode: 422, statusMessage: `Video uploads aren't supported for folder "${folder}"` })
  }

  const db = useDb(event)
  const stored = await storeAndRegisterFile(event, db, file, {
    organizationId: orgId,
    visibility: 'public',
    category: isVideo ? 'property-video' : categoryFor(folder),
    entityType: folder,
    createdBy: user.id,
    ...(isVideo ? { allowedTypes: ALLOWED_VIDEO_TYPES, maxBytes: MAX_VIDEO_UPLOAD_BYTES } : {}),
  })
  return { key: stored.key, url: `/api/media/${stored.key}` }
})
