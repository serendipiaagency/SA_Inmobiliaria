import type { H3Event } from 'h3'
import { cfEnv } from './db'
import { sha256Hex } from './checksum'
import { validateImageIntegrity } from './imageValidation'
import { validatePdfIntegrity } from './pdfValidation'
import { assertQuotaAvailable } from './mediaQuota'
import { registerMediaAsset, type MediaCategory, type MediaVisibility } from './mediaAssets'

/**
 * image/svg+xml is deliberately absent. SVG is an XML+script format — a
 * `<script>`, an event handler attribute (`onload=`), or a `javascript:` href
 * inside an uploaded "image" is live code the moment the file is opened in a
 * browser, not inert pixel data. The previous guard here only rejected an
 * obvious `<script` substring, which a trivially different payload
 * (`<image href="javascript:...">`, `onload=`, `<foreignObject>` embedding
 * HTML) walks straight past. Rather than ship a hand-rolled sanitizer with
 * unknown blind spots, SVG upload is blocked outright until either (a) a
 * proper sanitizer library is vetted and wired in, or (b) SVGs are converted
 * server-side to a raster format before storage. See
 * docs/media-security-audit.md §6 for the full reasoning and what "done"
 * looks like for re-enabling it.
 */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
}

// mp4/webm only — the two formats every modern browser plays natively via
// <video> with no transcoding step, and the two whose container headers are
// simple enough to fingerprint reliably below (see contentMatchesType).
export const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

// Property walkthrough clips need far more headroom than a photo, but a
// Cloudflare Worker request body still has to fit in memory end to end —
// 100 MB stays comfortably inside what a Workers Paid plan accepts and is
// enough for a couple of minutes of compressed 1080p footage.
export const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024 // 100 MB

function bytesStartWith(data: Uint8Array, sig: number[], offset = 0): boolean {
  if (data.length < offset + sig.length) return false
  for (let i = 0; i < sig.length; i++) if (data[offset + i] !== sig[i]) return false
  return true
}

/**
 * Confirms the file's actual content matches its declared Content-Type via magic bytes,
 * instead of trusting the client-supplied header. A client can label any binary as
 * application/pdf; without this, that mislabeled file gets stored and later re-served
 * with the trusted Content-Type, which is how a stored-XSS payload would slip through.
 * Exported for direct unit testing — see test/unit/mediaValidation.test.ts.
 */
export function contentMatchesType(data: Uint8Array, type: string): boolean {
  switch (type) {
    case 'application/pdf':
      return bytesStartWith(data, [0x25, 0x50, 0x44, 0x46]) // %PDF
    case 'image/jpeg':
      return bytesStartWith(data, [0xff, 0xd8, 0xff])
    case 'image/png':
      return bytesStartWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/gif':
      return bytesStartWith(data, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || bytesStartWith(data, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    case 'image/webp':
      return bytesStartWith(data, [0x52, 0x49, 0x46, 0x46]) && bytesStartWith(data, [0x57, 0x45, 0x42, 0x50], 8) // RIFF....WEBP
    case 'video/mp4':
      return bytesStartWith(data, [0x66, 0x74, 0x79, 0x70], 4) // ISO base media "....ftyp" box at offset 4
    case 'video/webm':
      return bytesStartWith(data, [0x1a, 0x45, 0xdf, 0xa3]) // EBML header (WebM/Matroska)
    default:
      return false
  }
}

export interface StoredFile {
  key: string
  mimeType: string
  extension: string
  sizeBytes: number
  checksum: string
  width?: number
  height?: number
}

/**
 * Structured key layout (Fase 3): human-readable and grouped by tenant and
 * purpose, but this is organizational, not a security boundary — nothing in
 * `/api/media` trusts this shape. Ownership always comes from the
 * `media_assets` row, so a key by itself proves nothing.
 */
export function buildStructuredKey(organizationId: number, category: MediaCategory, extension: string): string {
  const uuid = crypto.randomUUID()
  const prefix = (() => {
    switch (category) {
      case 'kyc-document':
        return `tenants/${organizationId}/documents`
      case 'contract':
        return `tenants/${organizationId}/contracts`
      case 'export':
        return `tenants/${organizationId}/exports`
      case 'catalog':
        return `tenants/${organizationId}/catalogs`
      case 'property-photo':
        return `public/${organizationId}/properties`
      case 'property-video':
        return `public/${organizationId}/properties/videos`
      case 'blog-image':
        return `public/${organizationId}/blog`
      case 'logo':
        return `public/${organizationId}/branding`
      default:
        return `tenants/${organizationId}/uploads`
    }
  })()
  return `${prefix}/${uuid}.${extension}`
}

/**
 * Validates a multipart file part (magic bytes, size, and format-specific
 * structural integrity) and uploads it to R2 under a structured key. Does
 * NOT touch `media_assets` or the storage quota — callers that need a
 * tracked, authorized asset should use `storeAndRegisterFile` below; this
 * lower-level function exists for the rare caller that manages its own
 * bookkeeping (none do today, kept for symmetry with `registerMediaAsset`
 * being usable standalone for generated files that never go through
 * multipart upload, e.g. rendered PDFs).
 */
export async function storeFile(
  event: H3Event,
  part: { data: Buffer | Uint8Array; type?: string; filename?: string },
  organizationId: number,
  category: MediaCategory,
  allowedTypes: Record<string, string> = ALLOWED_TYPES,
  maxBytes: number = MAX_UPLOAD_BYTES,
): Promise<StoredFile> {
  const type = part.type || 'application/octet-stream'
  const ext = allowedTypes[type]
  if (!ext) {
    throw createError({ statusCode: 415, statusMessage: `Unsupported file type: ${type}` })
  }
  if (part.data.byteLength === 0) {
    throw createError({ statusCode: 422, statusMessage: 'El archivo está vacío.' })
  }
  if (part.data.byteLength > maxBytes) {
    throw createError({ statusCode: 413, statusMessage: `File too large (max ${Math.round(maxBytes / (1024 * 1024))} MB)` })
  }
  const bytes = part.data as Uint8Array
  if (!contentMatchesType(bytes, type)) {
    throw createError({ statusCode: 415, statusMessage: 'File content does not match its declared type' })
  }

  // Structural integrity, beyond "the first few bytes look right": a truncated
  // or corrupted file, or one whose header claims dimensions the file doesn't
  // back up, is rejected here rather than failing later inside a PDF render
  // or an <img> tag. Video has no equivalent full-parse validator yet — the
  // magic-byte + size checks above are what guards it for now.
  let width: number | undefined
  let height: number | undefined
  if (type.startsWith('image/')) {
    const result = validateImageIntegrity(bytes, type)
    if (!result.ok) throw createError({ statusCode: 422, statusMessage: result.reason })
    width = result.dimensions?.width
    height = result.dimensions?.height
  } else if (type === 'application/pdf') {
    const result = await validatePdfIntegrity(bytes)
    if (!result.ok) throw createError({ statusCode: 422, statusMessage: result.reason })
  }

  const checksum = await sha256Hex(bytes)
  const key = buildStructuredKey(organizationId, category, ext)
  await cfEnv(event).MEDIA.put(key, bytes as Uint8Array<ArrayBuffer>, { httpMetadata: { contentType: type } })

  return { key, mimeType: type, extension: ext, sizeBytes: bytes.byteLength, checksum, width, height }
}

/**
 * The path every real upload endpoint should use: validates and stores the
 * file (see `storeFile`), checks the tenant's storage quota first, and
 * registers the resulting `media_assets` row with the given visibility and
 * category. One call, fully tracked, fully authorized from the moment it
 * returns.
 */
export async function storeAndRegisterFile(
  event: H3Event,
  db: any,
  part: { data: Buffer | Uint8Array; type?: string; filename?: string },
  opts: {
    organizationId: number
    visibility: MediaVisibility
    category: MediaCategory
    entityType?: string | null
    entityId?: number | null
    createdBy?: number | null
    allowedTypes?: Record<string, string>
    maxBytes?: number
  },
): Promise<StoredFile & { mediaAssetId: number }> {
  // Reject over-quota uploads before spending R2 storage or CPU on validation
  // of a file we're not going to keep.
  await assertQuotaAvailable(db, opts.organizationId, part.data.byteLength)

  const stored = await storeFile(event, part, opts.organizationId, opts.category, opts.allowedTypes, opts.maxBytes)

  const mediaAssetId = await registerMediaAsset(db, {
    organizationId: opts.organizationId,
    r2Key: stored.key,
    originalFilename: part.filename || null,
    mimeType: stored.mimeType,
    extension: stored.extension,
    sizeBytes: stored.sizeBytes,
    checksum: stored.checksum,
    visibility: opts.visibility,
    category: opts.category,
    entityType: opts.entityType,
    entityId: opts.entityId,
    createdBy: opts.createdBy,
    metadata: stored.width && stored.height ? { width: stored.width, height: stored.height } : null,
  })

  return { ...stored, mediaAssetId }
}

export function mediaUrl(key: string | null | undefined): string | null {
  return key ? `/api/media/${key}` : null
}
