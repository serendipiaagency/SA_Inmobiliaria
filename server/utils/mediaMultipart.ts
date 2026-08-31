import { createHash } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, now } from './db'
import { assertQuotaAvailable } from './mediaQuota'
import { registerMediaAsset, type MediaCategory } from './mediaAssets'
import { buildStructuredKey, contentMatchesType, ALLOWED_VIDEO_TYPES, MAX_VIDEO_UPLOAD_BYTES } from './media'

/**
 * Direct-to-R2 chunked upload for video (P1-8, docs/production-hardening-audit.md).
 * A single-request upload has to hold the whole file (up to 100MB) in the
 * Worker's memory at once; this splits it into parts uploaded across
 * multiple small requests via R2's own multipart API (server/utils/db.ts's
 * `cfEnv().MEDIA` binding — no new credentials needed), each one bounded to
 * `MULTIPART_PART_MAX_BYTES`. Orchestration lives here so it's usable both
 * from the admin upload endpoints (server/api/admin/upload/multipart/) and
 * from the stale-upload sweep (server/tasks/system/media-lifecycle.ts).
 */

// R2/S3 multipart requires every part but the last to be at least 5MB; 10MB
// keeps a 100MB video to ~10 parts (well under R2's 10,000-part ceiling)
// while keeping each request's buffered chunk small.
export const MULTIPART_PART_MAX_BYTES = 10 * 1024 * 1024

// A multipart upload nobody finishes (closed tab, crashed browser, network
// loss) leaves an open R2 upload and a 'pending' row forever unless
// something sweeps it — see sweepStaleMultipartUploads, run daily from
// media-lifecycle. Cloudflare R2 also supports a bucket-level
// AbortIncompleteMultipartUpload lifecycle rule as a second backstop; that's
// dashboard/API configuration outside this codebase, not set up here (see
// docs/production-hardening-audit.md, P1-8 — "Requiere configuración manual externa").
export const STALE_UPLOAD_HOURS = 24

export interface PendingMultipartUpload {
  id: number
  organizationId: number
  uploadId: string
  r2Key: string
  mimeType: string
  extension: string
  category: MediaCategory
  entityType: string | null
  entityId: number | null
  originalFilename: string | null
  createdBy: number | null
}

export interface InitMultipartUploadInput {
  organizationId: number
  createdBy: number | null
  category: MediaCategory
  entityType?: string | null
  entityId?: number | null
  mimeType: string
  originalFilename?: string | null
  declaredSizeBytes: number
}

/**
 * Opens the R2 multipart upload and records ownership in D1. The declared
 * size is only a pre-check (same honesty as `storeFile`'s size check) — the
 * real limit is enforced again in `completeMultipartUpload` against the
 * object's actual assembled size, since nothing stops a client from
 * declaring one size and sending more parts than that.
 */
export async function initMultipartUpload(db: any, bucket: R2Bucket, input: InitMultipartUploadInput): Promise<{ uploadId: string; key: string; partMaxBytes: number }> {
  const ext = ALLOWED_VIDEO_TYPES[input.mimeType]
  if (!ext) throw createError({ statusCode: 415, statusMessage: `Unsupported file type: ${input.mimeType}` })
  if (!Number.isFinite(input.declaredSizeBytes) || input.declaredSizeBytes <= 0) {
    throw createError({ statusCode: 422, statusMessage: 'El archivo está vacío.' })
  }
  if (input.declaredSizeBytes > MAX_VIDEO_UPLOAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: `File too large (max ${Math.round(MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024))} MB)` })
  }
  await assertQuotaAvailable(db, input.organizationId, input.declaredSizeBytes)

  const key = buildStructuredKey(input.organizationId, input.category, ext)
  const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: input.mimeType } })

  await db.insert(schema.mediaMultipartUploads).values({
    organizationId: input.organizationId,
    uploadId: upload.uploadId,
    r2Key: key,
    mimeType: input.mimeType,
    extension: ext,
    category: input.category,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    originalFilename: input.originalFilename ?? null,
    declaredSizeBytes: input.declaredSizeBytes,
    createdBy: input.createdBy,
    status: 'pending',
    createdAt: now(),
  })

  return { uploadId: upload.uploadId, key, partMaxBytes: MULTIPART_PART_MAX_BYTES }
}

/** The one query every part/complete/abort request runs before touching an upload — never trust the uploadId string alone. */
export async function findOwnedPendingUpload(db: any, organizationId: number, uploadId: string): Promise<PendingMultipartUpload | null> {
  const rows = await db
    .select()
    .from(schema.mediaMultipartUploads)
    .where(and(eq(schema.mediaMultipartUploads.uploadId, uploadId), eq(schema.mediaMultipartUploads.organizationId, organizationId), eq(schema.mediaMultipartUploads.status, 'pending')))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Uploads one part. The magic-byte check only ever needs part 1 — every
 * video signature this project recognizes (see `contentMatchesType`) lives
 * within the first ~8 bytes, so there's no need to wait for the whole file.
 */
export async function uploadMultipartPart(bucket: R2Bucket, row: Pick<PendingMultipartUpload, 'r2Key' | 'uploadId' | 'mimeType'>, partNumber: number, bytes: Uint8Array): Promise<{ partNumber: number; etag: string }> {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
    throw createError({ statusCode: 422, statusMessage: 'Número de parte inválido' })
  }
  if (bytes.byteLength === 0) throw createError({ statusCode: 422, statusMessage: 'Parte vacía' })
  if (bytes.byteLength > MULTIPART_PART_MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: `Parte demasiado grande (máx ${Math.round(MULTIPART_PART_MAX_BYTES / (1024 * 1024))} MB por parte)` })
  }
  if (partNumber === 1 && !contentMatchesType(bytes, row.mimeType)) {
    throw createError({ statusCode: 415, statusMessage: 'El contenido del archivo no coincide con el tipo declarado' })
  }
  const upload = bucket.resumeMultipartUpload(row.r2Key, row.uploadId)
  const uploaded = await upload.uploadPart(partNumber, bytes)
  return { partNumber: uploaded.partNumber, etag: uploaded.etag }
}

/**
 * SHA-256 of an R2 object computed by streaming its body through an
 * incremental Node hash (`nodejs_compat`, already enabled in wrangler.toml)
 * instead of buffering the whole object — the same "bounded memory, not
 * bounded feature" trade-off as the rest of this design. Only used for
 * multipart uploads: `sha256Hex` (server/utils/checksum.ts) stays the
 * one-shot version for every other (small, single-request) upload.
 */
export async function hashR2Object(bucket: R2Bucket, key: string): Promise<string> {
  const object = await bucket.get(key)
  if (!object?.body) throw createError({ statusCode: 500, statusMessage: 'No se pudo leer el archivo recién subido para calcular su checksum.' })
  const hash = createHash('sha256')
  const reader = object.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    hash.update(value)
  }
  return hash.digest('hex')
}

/** Best-effort R2 abort + terminal D1 status — safe to call on an already-aborted/completed upload. */
export async function abortMultipartUpload(db: any, bucket: R2Bucket, row: Pick<PendingMultipartUpload, 'id' | 'r2Key' | 'uploadId'>): Promise<void> {
  try {
    await bucket.resumeMultipartUpload(row.r2Key, row.uploadId).abort()
  } catch {
    // Already aborted/completed/expired on R2's side — our row still needs to land in a terminal state.
  }
  await db.update(schema.mediaMultipartUploads).set({ status: 'aborted' }).where(eq(schema.mediaMultipartUploads.id, row.id))
}

/**
 * Assembles the parts, re-validates the *actual* assembled size against the
 * limit (the init-time check only ever saw what the client declared),
 * hashes the result, and registers the same `media_assets` row a
 * single-request upload would get — same quota accounting, same
 * authorization story, from here on this is an ordinary tracked asset.
 */
export async function completeMultipartUpload(db: any, bucket: R2Bucket, row: PendingMultipartUpload, parts: { partNumber: number; etag: string }[]): Promise<{ key: string; sizeBytes: number; mediaAssetId: number }> {
  if (!parts.length) throw createError({ statusCode: 422, statusMessage: 'No se recibió ninguna parte.' })

  const upload = bucket.resumeMultipartUpload(row.r2Key, row.uploadId)
  let object: R2Object
  try {
    object = await upload.complete(parts)
  } catch {
    await db.update(schema.mediaMultipartUploads).set({ status: 'aborted' }).where(eq(schema.mediaMultipartUploads.id, row.id))
    throw createError({ statusCode: 400, statusMessage: 'No se pudo completar la subida — vuelve a intentarlo.' })
  }

  if (object.size > MAX_VIDEO_UPLOAD_BYTES) {
    await bucket.delete(row.r2Key)
    await db.update(schema.mediaMultipartUploads).set({ status: 'aborted' }).where(eq(schema.mediaMultipartUploads.id, row.id))
    throw createError({ statusCode: 413, statusMessage: `File too large (max ${Math.round(MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024))} MB)` })
  }

  // Re-check against the real final size — the init-time pre-check only ever saw the client-declared size.
  await assertQuotaAvailable(db, row.organizationId, object.size)

  const checksum = await hashR2Object(bucket, row.r2Key)

  const mediaAssetId = await registerMediaAsset(db, {
    organizationId: row.organizationId,
    r2Key: row.r2Key,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    extension: row.extension,
    sizeBytes: object.size,
    checksum,
    visibility: 'public',
    category: row.category,
    entityType: row.entityType,
    entityId: row.entityId,
    createdBy: row.createdBy,
  })

  await db.update(schema.mediaMultipartUploads).set({ status: 'completed', completedAt: now() }).where(eq(schema.mediaMultipartUploads.id, row.id))

  return { key: row.r2Key, sizeBytes: object.size, mediaAssetId }
}

/** Daily sweep (server/tasks/system/media-lifecycle.ts) for uploads nobody ever completed or explicitly cancelled. */
export async function sweepStaleMultipartUploads(db: any, bucket: R2Bucket, staleHours: number = STALE_UPLOAD_HOURS): Promise<{ aborted: number; failed: number }> {
  const cutoff = new Date(Date.now() - staleHours * 3_600_000).toISOString().replace('T', ' ').slice(0, 19)
  const rows = await db
    .select()
    .from(schema.mediaMultipartUploads)
    .where(and(eq(schema.mediaMultipartUploads.status, 'pending'), lt(schema.mediaMultipartUploads.createdAt, cutoff)))
    .limit(200) // bounded per run — a backlog just gets picked up again tomorrow, same pattern as the purge job

  let aborted = 0
  let failed = 0
  for (const row of rows) {
    try {
      await abortMultipartUpload(db, bucket, row)
      aborted++
    } catch (err) {
      console.error(`media-lifecycle: failed to abort stale multipart upload ${row.id}`, err)
      failed++
    }
  }
  return { aborted, failed }
}
