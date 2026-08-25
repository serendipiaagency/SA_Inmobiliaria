import { and, eq, isNull, sql } from 'drizzle-orm'
import { schema, now } from './db'
import { sha256Hex } from './checksum'

export type MediaVisibility = 'public' | 'private' | 'confidential'

/**
 * `category` describes what kind of file this is, independent of ownership.
 * Used for admin UI grouping and for choosing default visibility/key prefix
 * on upload — never for authorization, which is always `visibility` +
 * `organizationId`.
 */
export type MediaCategory =
  | 'property-photo'
  | 'property-video'
  | 'logo'
  | 'blog-image'
  | 'kyc-document'
  | 'contract'
  | 'export'
  | 'catalog'
  | 'upload'

export interface RegisterMediaAssetInput {
  organizationId: number
  r2Key: string
  originalFilename?: string | null
  mimeType: string
  extension: string
  sizeBytes: number
  checksum?: string | null
  visibility: MediaVisibility
  category: MediaCategory
  entityType?: string | null
  entityId?: number | null
  createdBy?: number | null
  metadata?: Record<string, unknown> | null
}

/**
 * Inserts the media_assets row for a just-uploaded object and applies its
 * size to the tenant's storage counter, in one D1 batch — the two writes
 * either both land or neither does, so `organizations.storage_bytes_used`
 * can never drift out of step with the rows that justify it purely from a
 * failure in the middle of this call. (It can still drift from an R2 object
 * that lands without ever reaching this function — see
 * `server/utils/mediaQuota.ts` `reconcileStorageUsage` for the backstop.)
 */
export async function registerMediaAsset(db: any, input: RegisterMediaAssetInput): Promise<number> {
  const nowTs = now()
  const [inserted] = await db.batch([
    db
      .insert(schema.mediaAssets)
      .values({
        organizationId: input.organizationId,
        r2Key: input.r2Key,
        originalFilename: input.originalFilename ?? null,
        mimeType: input.mimeType,
        extension: input.extension,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum ?? null,
        visibility: input.visibility,
        category: input.category,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        createdBy: input.createdBy ?? null,
        createdAt: nowTs,
        updatedAt: nowTs,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      })
      .returning({ id: schema.mediaAssets.id }),
    db
      .update(schema.organizations)
      .set({ storageBytesUsed: sql`${schema.organizations.storageBytesUsed} + ${input.sizeBytes}` })
      .where(eq(schema.organizations.id, input.organizationId)),
  ])
  return inserted[0].id
}

export function findMediaAssetByKey(db: any, r2Key: string) {
  return db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.r2Key, r2Key)).limit(1)
}

/**
 * Looks up ownership of `r2Key` for `organizationId` — the one query the
 * media-serving endpoint runs before it will stream a private or
 * confidential object. Deliberately keyed by the object's own row, never by
 * parsing the organization out of the key string: the key is a URL path
 * segment the caller fully controls.
 */
export async function findOwnedMediaAsset(db: any, organizationId: number, r2Key: string) {
  const rows = await db
    .select()
    .from(schema.mediaAssets)
    .where(and(eq(schema.mediaAssets.r2Key, r2Key), eq(schema.mediaAssets.organizationId, organizationId), isNull(schema.mediaAssets.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Registers a server-generated file (a rendered contract, export or catalog
 * PDF) that was already written to R2 outside the multipart-upload path —
 * these come from `pdf-lib`, not a form submission, so there's no
 * `storeAndRegisterFile` magic-byte dance to run, but they still get a real
 * `media_assets` row: same quota accounting, same authorization story as
 * anything a user uploaded by hand. Every private R2 write in this codebase
 * goes through either this or `storeAndRegisterFile` — there is no third
 * path that puts bytes in the bucket without a tracked owner.
 */
export async function registerGeneratedFile(
  db: any,
  input: {
    organizationId: number
    r2Key: string
    bytes: Uint8Array
    mimeType: string
    extension: string
    visibility: MediaVisibility
    category: MediaCategory
    entityType?: string | null
    entityId?: number | null
    createdBy?: number | null
    originalFilename?: string | null
  },
): Promise<number> {
  const checksum = await sha256Hex(input.bytes)
  return registerMediaAsset(db, {
    organizationId: input.organizationId,
    r2Key: input.r2Key,
    originalFilename: input.originalFilename ?? null,
    mimeType: input.mimeType,
    extension: input.extension,
    sizeBytes: input.bytes.byteLength,
    checksum,
    visibility: input.visibility,
    category: input.category,
    entityType: input.entityType,
    entityId: input.entityId,
    createdBy: input.createdBy,
  })
}

/**
 * Soft-deletes the asset row and releases its bytes from the tenant's quota
 * immediately — the R2 object itself stays put for the grace period (see
 * `server/tasks/system/purge-media.ts`), but a deleted file shouldn't keep
 * counting against the quota while it waits to be purged for real.
 */
export async function softDeleteMediaAsset(db: any, id: number): Promise<void> {
  const [asset] = await db.select({ organizationId: schema.mediaAssets.organizationId, sizeBytes: schema.mediaAssets.sizeBytes, deletedAt: schema.mediaAssets.deletedAt }).from(schema.mediaAssets).where(eq(schema.mediaAssets.id, id)).limit(1)
  if (!asset || asset.deletedAt) return
  const nowTs = now()
  await db.batch([
    db.update(schema.mediaAssets).set({ deletedAt: nowTs, updatedAt: nowTs }).where(eq(schema.mediaAssets.id, id)),
    db
      .update(schema.organizations)
      .set({ storageBytesUsed: sql`max(0, ${schema.organizations.storageBytesUsed} - ${asset.sizeBytes})` })
      .where(eq(schema.organizations.id, asset.organizationId)),
  ])
}

/**
 * Same as `softDeleteMediaAsset`, keyed by r2Key instead of id — for callers
 * (the catalog assembler's fragment cleanup) that already deleted the R2
 * object directly and just need the bookkeeping row to reflect that. Safe to
 * call on a key with no matching row (a no-op): not every R2 write in this
 * codebase predates the Media Asset Manager, and a legacy key is not an error
 * here.
 */
export async function softDeleteMediaAssetByKey(db: any, r2Key: string): Promise<void> {
  const [asset] = await db.select({ id: schema.mediaAssets.id }).from(schema.mediaAssets).where(eq(schema.mediaAssets.r2Key, r2Key)).limit(1)
  if (asset) await softDeleteMediaAsset(db, asset.id)
}

/**
 * Reverses `softDeleteMediaAsset` — restoring a row from Papelera puts its
 * bytes back on the tenant's quota and makes it servable again. A no-op if
 * the row was never soft-deleted (idempotent) or doesn't exist (legacy key).
 */
export async function restoreMediaAssetByKey(db: any, r2Key: string): Promise<void> {
  const [asset] = await db
    .select({
      id: schema.mediaAssets.id,
      organizationId: schema.mediaAssets.organizationId,
      sizeBytes: schema.mediaAssets.sizeBytes,
      deletedAt: schema.mediaAssets.deletedAt,
      purgedAt: schema.mediaAssets.purgedAt,
    })
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.r2Key, r2Key))
    .limit(1)
  // Once the purge job has actually removed the R2 object (purgedAt set),
  // there's nothing left to restore — the row would be reactivated pointing
  // at bytes that no longer exist.
  if (!asset || !asset.deletedAt || asset.purgedAt) return
  const nowTs = now()
  await db.batch([
    db.update(schema.mediaAssets).set({ deletedAt: null, purgedAt: null, updatedAt: nowTs }).where(eq(schema.mediaAssets.id, asset.id)),
    db
      .update(schema.organizations)
      .set({ storageBytesUsed: sql`${schema.organizations.storageBytesUsed} + ${asset.sizeBytes}` })
      .where(eq(schema.organizations.id, asset.organizationId)),
  ])
}
