import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { sha256Hex } from '../../server/utils/checksum'
import {
  MULTIPART_PART_MAX_BYTES,
  abortMultipartUpload,
  completeMultipartUpload,
  findOwnedPendingUpload,
  hashR2Object,
  initMultipartUpload,
  sweepStaleMultipartUploads,
  uploadMultipartPart,
} from '../../server/utils/mediaMultipart'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * P1-8 (docs/production-hardening-audit.md): video used to travel through
 * the Worker as one buffered ~100MB request. This exercises the chunked
 * replacement — server/utils/mediaMultipart.ts — against a real D1 schema
 * (same node:sqlite harness every other multi-tenant test uses) and a small
 * in-memory fake standing in for the R2 multipart API, matching the
 * `fakeHealthyBucket`/`fakeD1` style already established in
 * test/unit/health.test.ts and test/unit/backup.streaming.test.ts.
 */

// Real MP4 "ftyp" box signature (see contentMatchesType in server/utils/media.ts) — enough bytes to pass the magic-byte check.
const MP4_HEADER = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])

function bytesOfLength(n: number, fill = 0x41): Uint8Array {
  return new Uint8Array(n).fill(fill)
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/** Minimal R2Bucket-shaped fake covering exactly the multipart surface mediaMultipart.ts calls. */
function fakeBucket(): any {
  const uploads = new Map<string, { key: string; parts: Map<number, Uint8Array> }>()
  const objects = new Map<string, Uint8Array>()
  let seq = 0

  return {
    async createMultipartUpload(key: string) {
      const uploadId = `up_${++seq}`
      uploads.set(uploadId, { key, parts: new Map() })
      return { key, uploadId }
    },
    resumeMultipartUpload(key: string, uploadId: string) {
      return {
        key,
        uploadId,
        async uploadPart(partNumber: number, value: Uint8Array) {
          const u = uploads.get(uploadId)
          if (!u) throw new Error('No such multipart upload (aborted or completed)')
          u.parts.set(partNumber, value)
          return { partNumber, etag: `etag-${partNumber}` }
        },
        async complete(parts: { partNumber: number; etag: string }[]) {
          const u = uploads.get(uploadId)
          if (!u) throw new Error('No such multipart upload (aborted or completed)')
          const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => u.parts.get(p.partNumber)!)
          const bytes = concat(ordered)
          objects.set(u.key, bytes)
          uploads.delete(uploadId)
          return { key: u.key, size: bytes.byteLength }
        },
        async abort() {
          if (!uploads.delete(uploadId)) throw new Error('No such multipart upload (already gone)')
        },
      }
    },
    async get(key: string) {
      const bytes = objects.get(key)
      if (!bytes) return null
      return {
        size: bytes.byteLength,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            // Split into two enqueues so hashR2Object's incremental reader loop is genuinely exercised, not a single-chunk no-op.
            const mid = Math.ceil(bytes.byteLength / 2) || 1
            if (bytes.byteLength) {
              controller.enqueue(bytes.subarray(0, mid))
              if (mid < bytes.byteLength) controller.enqueue(bytes.subarray(mid))
            }
            controller.close()
          },
        }),
      }
    },
    async delete(key: string) {
      objects.delete(key)
    },
  }
}

let db: any
let bucket: any
let tenant: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  bucket = fakeBucket()
  tenant = await seedTenant(db, 'MultipartOrg')
})

describe('initMultipartUpload', () => {
  it('opens an R2 multipart upload and records a pending ownership row', async () => {
    const result = await initMultipartUpload(db, bucket, {
      organizationId: tenant.orgId,
      createdBy: tenant.userId,
      category: 'property-video',
      entityType: 'developer-properties',
      mimeType: 'video/mp4',
      originalFilename: 'walkthrough.mp4',
      declaredSizeBytes: 50 * 1024 * 1024,
    })
    expect(result.uploadId).toMatch(/^up_/)
    expect(result.key).toMatch(/^public\/\d+\/properties\/videos\//)
    expect(result.partMaxBytes).toBe(MULTIPART_PART_MAX_BYTES)

    const [row] = await db.select().from(schema.mediaMultipartUploads).where(eq(schema.mediaMultipartUploads.uploadId, result.uploadId))
    expect(row.status).toBe('pending')
    expect(row.organizationId).toBe(tenant.orgId)
    expect(row.declaredSizeBytes).toBe(50 * 1024 * 1024)
  })

  it('rejects an unsupported mime type before touching R2 or D1', async () => {
    await expect(
      initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'application/pdf', declaredSizeBytes: 1000 }),
    ).rejects.toMatchObject({ statusCode: 415 })
  })

  it('rejects a declared size over the 100MB video cap', async () => {
    await expect(
      initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'video/mp4', declaredSizeBytes: 200 * 1024 * 1024 }),
    ).rejects.toMatchObject({ statusCode: 413 })
  })

  it('rejects an upload that would exceed the tenant storage quota', async () => {
    await db.update(schema.organizations).set({ storageBytesLimit: 10 * 1024 * 1024 }).where(eq(schema.organizations.id, tenant.orgId))
    await expect(
      initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'video/mp4', declaredSizeBytes: 20 * 1024 * 1024 }),
    ).rejects.toMatchObject({ statusCode: 413 })
  })
})

describe('findOwnedPendingUpload', () => {
  it('only matches the owning organization, a pending status, and the exact uploadId', async () => {
    const other = await seedTenant(db, 'OtherOrg')
    const { uploadId } = await initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'video/mp4', declaredSizeBytes: 1000 })

    expect(await findOwnedPendingUpload(db, tenant.orgId, uploadId)).toBeTruthy()
    expect(await findOwnedPendingUpload(db, other.orgId, uploadId)).toBeNull()
    expect(await findOwnedPendingUpload(db, tenant.orgId, 'up_does_not_exist')).toBeNull()
  })
})

describe('uploadMultipartPart', () => {
  async function initRow(sizeBytes = 20 * 1024 * 1024) {
    const { uploadId } = await initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'video/mp4', declaredSizeBytes: sizeBytes })
    return (await findOwnedPendingUpload(db, tenant.orgId, uploadId))!
  }

  it('validates the first part against the declared mime type via magic bytes', async () => {
    const row = await initRow()
    await expect(uploadMultipartPart(bucket, row, 1, new Uint8Array([1, 2, 3, 4]))).rejects.toMatchObject({ statusCode: 415 })
  })

  it('accepts a valid first part and returns its etag', async () => {
    const row = await initRow()
    const result = await uploadMultipartPart(bucket, row, 1, concat([MP4_HEADER, bytesOfLength(100)]))
    expect(result).toEqual({ partNumber: 1, etag: 'etag-1' })
  })

  it('does not re-check magic bytes on parts after the first', async () => {
    const row = await initRow()
    await uploadMultipartPart(bucket, row, 1, concat([MP4_HEADER, bytesOfLength(100)]))
    // Garbage content is fine for part 2+ — only the file's own header (part 1) proves its type.
    await expect(uploadMultipartPart(bucket, row, 2, new Uint8Array([9, 9, 9, 9]))).resolves.toEqual({ partNumber: 2, etag: 'etag-2' })
  })

  it.each([0, -1, 1.5, 10_001])('rejects an out-of-range part number (%s)', async (partNumber) => {
    const row = await initRow()
    await expect(uploadMultipartPart(bucket, row, partNumber, bytesOfLength(10))).rejects.toMatchObject({ statusCode: 422 })
  })

  it('rejects an empty part', async () => {
    const row = await initRow()
    await expect(uploadMultipartPart(bucket, row, 1, new Uint8Array(0))).rejects.toMatchObject({ statusCode: 422 })
  })

  it('rejects a part larger than MULTIPART_PART_MAX_BYTES', async () => {
    const row = await initRow()
    await expect(uploadMultipartPart(bucket, row, 1, bytesOfLength(MULTIPART_PART_MAX_BYTES + 1))).rejects.toMatchObject({ statusCode: 413 })
  })
})

describe('hashR2Object', () => {
  it('matches the one-shot sha256Hex over the same bytes, computed by streaming instead of buffering', async () => {
    const bytes = concat([MP4_HEADER, bytesOfLength(5000, 0x7a)])
    const upload = await bucket.createMultipartUpload('test/hash-check.mp4')
    const handle = bucket.resumeMultipartUpload('test/hash-check.mp4', upload.uploadId)
    await handle.uploadPart(1, bytes)
    await handle.complete([{ partNumber: 1, etag: 'etag-1' }])

    const streamed = await hashR2Object(bucket, 'test/hash-check.mp4')
    const oneShot = await sha256Hex(bytes)
    expect(streamed).toBe(oneShot)
  })
})

describe('abortMultipartUpload', () => {
  it('marks the row aborted and releases the R2 multipart upload', async () => {
    const { uploadId } = await initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'video/mp4', declaredSizeBytes: 1000 })
    const row = (await findOwnedPendingUpload(db, tenant.orgId, uploadId))!

    await abortMultipartUpload(db, bucket, row)

    const [updated] = await db.select().from(schema.mediaMultipartUploads).where(eq(schema.mediaMultipartUploads.id, row.id))
    expect(updated.status).toBe('aborted')
    expect(await findOwnedPendingUpload(db, tenant.orgId, uploadId)).toBeNull()
  })

  it('still lands the row in a terminal state even if R2 has already forgotten the upload', async () => {
    const { uploadId } = await initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'video/mp4', declaredSizeBytes: 1000 })
    const row = (await findOwnedPendingUpload(db, tenant.orgId, uploadId))!
    await abortMultipartUpload(db, bucket, row) // first abort really removes it from the fake bucket

    await expect(abortMultipartUpload(db, bucket, row)).resolves.toBeUndefined()
  })
})

describe('completeMultipartUpload', () => {
  async function uploadedRow(fileBytes: Uint8Array) {
    const { uploadId } = await initMultipartUpload(db, bucket, {
      organizationId: tenant.orgId,
      createdBy: tenant.userId,
      category: 'property-video',
      entityType: 'developer-properties',
      mimeType: 'video/mp4',
      originalFilename: 'walkthrough.mp4',
      declaredSizeBytes: fileBytes.byteLength,
    })
    const row = (await findOwnedPendingUpload(db, tenant.orgId, uploadId))!
    const half = Math.ceil(fileBytes.byteLength / 2)
    const p1 = await uploadMultipartPart(bucket, row, 1, fileBytes.subarray(0, half))
    const p2 = await uploadMultipartPart(bucket, row, 2, fileBytes.subarray(half))
    return { row, parts: [p1, p2] }
  }

  it('assembles the parts, registers a media_assets row, and marks the upload completed', async () => {
    const fileBytes = concat([MP4_HEADER, bytesOfLength(200_000, 0x5a)])
    const { row, parts } = await uploadedRow(fileBytes)

    const result = await completeMultipartUpload(db, bucket, row, parts)
    expect(result.key).toBe(row.r2Key)
    expect(result.sizeBytes).toBe(fileBytes.byteLength)

    const [asset] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, result.mediaAssetId))
    expect(asset.r2Key).toBe(row.r2Key)
    expect(asset.sizeBytes).toBe(fileBytes.byteLength)
    expect(asset.checksum).toBe(await sha256Hex(fileBytes))
    expect(asset.visibility).toBe('public')
    expect(asset.category).toBe('property-video')
    expect(asset.originalFilename).toBe('walkthrough.mp4')

    const [org] = await db.select({ used: schema.organizations.storageBytesUsed }).from(schema.organizations).where(eq(schema.organizations.id, tenant.orgId))
    expect(org.used).toBe(fileBytes.byteLength)

    const [upload] = await db.select().from(schema.mediaMultipartUploads).where(eq(schema.mediaMultipartUploads.id, row.id))
    expect(upload.status).toBe('completed')
    expect(upload.completedAt).toBeTruthy()
  })

  it('rejects (and deletes the R2 object) if the real assembled size exceeds the video cap', async () => {
    // Declare a small size at init (passes the pre-check) but actually upload
    // more than the 100MB cap, split into properly-sized (<= 10MB) parts.
    const { uploadId } = await initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'video/mp4', declaredSizeBytes: 1000 })
    const row = (await findOwnedPendingUpload(db, tenant.orgId, uploadId))!
    const oversized = concat([MP4_HEADER, bytesOfLength(101 * 1024 * 1024)])
    const parts = []
    for (let offset = 0, n = 1; offset < oversized.byteLength; offset += MULTIPART_PART_MAX_BYTES, n++) {
      parts.push(await uploadMultipartPart(bucket, row, n, oversized.subarray(offset, offset + MULTIPART_PART_MAX_BYTES)))
    }

    await expect(completeMultipartUpload(db, bucket, row, parts)).rejects.toMatchObject({ statusCode: 413 })

    expect(await bucket.get(row.r2Key)).toBeNull()
    const [upload] = await db.select().from(schema.mediaMultipartUploads).where(eq(schema.mediaMultipartUploads.id, row.id))
    expect(upload.status).toBe('aborted')
    // Never registered — quota must not have been charged for a rejected upload.
    const [org] = await db.select({ used: schema.organizations.storageBytesUsed }).from(schema.organizations).where(eq(schema.organizations.id, tenant.orgId))
    expect(org.used).toBe(0)
  })

  it('re-checks quota against the real final size, not just the declared one', async () => {
    // Declare a tiny size so init's pre-check passes, then actually upload
    // enough to bust a quota that was never breached by the declaration alone.
    await db.update(schema.organizations).set({ storageBytesLimit: 500_000 }).where(eq(schema.organizations.id, tenant.orgId))
    const { uploadId } = await initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'video/mp4', declaredSizeBytes: 1000 })
    const row = (await findOwnedPendingUpload(db, tenant.orgId, uploadId))!
    const bytes = concat([MP4_HEADER, bytesOfLength(600_000)])
    const part = await uploadMultipartPart(bucket, row, 1, bytes)

    await expect(completeMultipartUpload(db, bucket, row, [part])).rejects.toMatchObject({ statusCode: 413 })
  })

  it('rejects with no parts', async () => {
    const { uploadId } = await initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'video/mp4', declaredSizeBytes: 1000 })
    const row = (await findOwnedPendingUpload(db, tenant.orgId, uploadId))!
    await expect(completeMultipartUpload(db, bucket, row, [])).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('sweepStaleMultipartUploads', () => {
  it('aborts only pending uploads older than the cutoff, leaving recent ones alone', async () => {
    const { uploadId: staleId } = await initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'video/mp4', declaredSizeBytes: 1000 })
    const { uploadId: freshId } = await initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'video/mp4', declaredSizeBytes: 1000 })
    await db
      .update(schema.mediaMultipartUploads)
      .set({ createdAt: '2000-01-01 00:00:00' })
      .where(eq(schema.mediaMultipartUploads.uploadId, staleId))

    const result = await sweepStaleMultipartUploads(db, bucket, 24)
    expect(result).toEqual({ aborted: 1, failed: 0 })

    expect(await findOwnedPendingUpload(db, tenant.orgId, staleId)).toBeNull()
    expect(await findOwnedPendingUpload(db, tenant.orgId, freshId)).toBeTruthy()
  })

  it('never touches an already-completed or already-aborted row', async () => {
    const fileBytes = concat([MP4_HEADER, bytesOfLength(10)])
    const { row, parts } = await uploadedRow(fileBytes)
    await completeMultipartUpload(db, bucket, row, parts)
    await db.update(schema.mediaMultipartUploads).set({ createdAt: '2000-01-01 00:00:00' }).where(eq(schema.mediaMultipartUploads.id, row.id))

    const result = await sweepStaleMultipartUploads(db, bucket, 24)
    expect(result).toEqual({ aborted: 0, failed: 0 })

    const [unchanged] = await db.select().from(schema.mediaMultipartUploads).where(eq(schema.mediaMultipartUploads.id, row.id))
    expect(unchanged.status).toBe('completed')
  })

  async function uploadedRow(fileBytes: Uint8Array) {
    const { uploadId } = await initMultipartUpload(db, bucket, { organizationId: tenant.orgId, createdBy: null, category: 'property-video', mimeType: 'video/mp4', declaredSizeBytes: fileBytes.byteLength })
    const row = (await findOwnedPendingUpload(db, tenant.orgId, uploadId))!
    const part = await uploadMultipartPart(bucket, row, 1, fileBytes)
    return { row, parts: [part] }
  }
})
