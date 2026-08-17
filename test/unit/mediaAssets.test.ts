import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import {
  findOwnedMediaAsset,
  registerGeneratedFile,
  registerMediaAsset,
  restoreMediaAssetByKey,
  softDeleteMediaAsset,
  softDeleteMediaAssetByKey,
} from '../../server/utils/mediaAssets'
import { assertQuotaAvailable, reconcileStorageUsage } from '../../server/utils/mediaQuota'
import { buildStructuredKey } from '../../server/utils/media'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

let db: any
let A: TenantFixture
let B: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'Alpha')
  B = await seedTenant(db, 'Beta')
})

async function orgUsage(orgId: number): Promise<number> {
  const [row] = await db.select({ used: schema.organizations.storageBytesUsed }).from(schema.organizations).where(eq(schema.organizations.id, orgId))
  return row.used
}

describe('buildStructuredKey', () => {
  it('never lets the caller-controlled category leak the client into the path', () => {
    // Every prefix is derived from server-known values (orgId, category) —
    // nothing here comes from a client-supplied filename or folder string.
    expect(buildStructuredKey(7, 'kyc-document', 'pdf')).toMatch(/^tenants\/7\/documents\/[0-9a-f-]{36}\.pdf$/)
    expect(buildStructuredKey(7, 'contract', 'pdf')).toMatch(/^tenants\/7\/contracts\/[0-9a-f-]{36}\.pdf$/)
    expect(buildStructuredKey(7, 'export', 'pdf')).toMatch(/^tenants\/7\/exports\/[0-9a-f-]{36}\.pdf$/)
    expect(buildStructuredKey(7, 'catalog', 'pdf')).toMatch(/^tenants\/7\/catalogs\/[0-9a-f-]{36}\.pdf$/)
    expect(buildStructuredKey(7, 'property-photo', 'jpg')).toMatch(/^public\/7\/properties\/[0-9a-f-]{36}\.jpg$/)
    expect(buildStructuredKey(7, 'blog-image', 'jpg')).toMatch(/^public\/7\/blog\/[0-9a-f-]{36}\.jpg$/)
    expect(buildStructuredKey(7, 'logo', 'png')).toMatch(/^public\/7\/branding\/[0-9a-f-]{36}\.png$/)
    expect(buildStructuredKey(7, 'upload', 'jpg')).toMatch(/^tenants\/7\/uploads\/[0-9a-f-]{36}\.jpg$/)
  })

  it('generates a fresh key on every call', () => {
    expect(buildStructuredKey(1, 'upload', 'jpg')).not.toBe(buildStructuredKey(1, 'upload', 'jpg'))
  })
})

describe('registerMediaAsset', () => {
  it('creates a row and applies its size to the organization storage counter atomically', async () => {
    const before = await orgUsage(A.orgId)
    const id = await registerMediaAsset(db, {
      organizationId: A.orgId,
      r2Key: 'tenants/1/uploads/a.jpg',
      mimeType: 'image/jpeg',
      extension: 'jpg',
      sizeBytes: 12_345,
      visibility: 'public',
      category: 'upload',
    })
    expect(id).toBeGreaterThan(0)
    expect(await orgUsage(A.orgId)).toBe(before + 12_345)
  })

  it('never touches another tenant storage counter', async () => {
    const beforeB = await orgUsage(B.orgId)
    await registerMediaAsset(db, {
      organizationId: A.orgId,
      r2Key: 'tenants/1/uploads/b.jpg',
      mimeType: 'image/jpeg',
      extension: 'jpg',
      sizeBytes: 999,
      visibility: 'public',
      category: 'upload',
    })
    expect(await orgUsage(B.orgId)).toBe(beforeB)
  })
})

describe('findOwnedMediaAsset', () => {
  it('returns the asset for its owning tenant', async () => {
    await registerMediaAsset(db, { organizationId: A.orgId, r2Key: 'tenants/1/documents/x.pdf', mimeType: 'application/pdf', extension: 'pdf', sizeBytes: 100, visibility: 'confidential', category: 'kyc-document' })
    const found = await findOwnedMediaAsset(db, A.orgId, 'tenants/1/documents/x.pdf')
    expect(found?.organizationId).toBe(A.orgId)
  })

  it('returns null for a different tenant, even with the exact right key', async () => {
    await registerMediaAsset(db, { organizationId: A.orgId, r2Key: 'tenants/1/documents/y.pdf', mimeType: 'application/pdf', extension: 'pdf', sizeBytes: 100, visibility: 'confidential', category: 'kyc-document' })
    const found = await findOwnedMediaAsset(db, B.orgId, 'tenants/1/documents/y.pdf')
    expect(found).toBeNull()
  })

  it('returns null for a soft-deleted asset even for its own tenant', async () => {
    const id = await registerMediaAsset(db, { organizationId: A.orgId, r2Key: 'tenants/1/documents/z.pdf', mimeType: 'application/pdf', extension: 'pdf', sizeBytes: 100, visibility: 'confidential', category: 'kyc-document' })
    await softDeleteMediaAsset(db, id)
    expect(await findOwnedMediaAsset(db, A.orgId, 'tenants/1/documents/z.pdf')).toBeNull()
  })

  it('returns null for a key nobody registered', async () => {
    expect(await findOwnedMediaAsset(db, A.orgId, 'tenants/1/documents/does-not-exist.pdf')).toBeNull()
  })
})

describe('softDeleteMediaAsset / restoreMediaAssetByKey', () => {
  it('releases the bytes from the quota on soft-delete and restores them on restore', async () => {
    const before = await orgUsage(A.orgId)
    const id = await registerMediaAsset(db, { organizationId: A.orgId, r2Key: 'tenants/1/uploads/c.jpg', mimeType: 'image/jpeg', extension: 'jpg', sizeBytes: 5_000, visibility: 'public', category: 'upload' })
    expect(await orgUsage(A.orgId)).toBe(before + 5_000)

    await softDeleteMediaAsset(db, id)
    expect(await orgUsage(A.orgId)).toBe(before)

    await restoreMediaAssetByKey(db, 'tenants/1/uploads/c.jpg')
    expect(await orgUsage(A.orgId)).toBe(before + 5_000)
  })

  it('never lets the quota counter go negative on a double soft-delete', async () => {
    const before = await orgUsage(A.orgId)
    const id = await registerMediaAsset(db, { organizationId: A.orgId, r2Key: 'tenants/1/uploads/d.jpg', mimeType: 'image/jpeg', extension: 'jpg', sizeBytes: 5_000, visibility: 'public', category: 'upload' })
    await softDeleteMediaAsset(db, id)
    await softDeleteMediaAsset(db, id) // no-op, already deleted
    expect(await orgUsage(A.orgId)).toBe(before)
  })

  it('does not restore an asset that has already been purged', async () => {
    const before = await orgUsage(A.orgId)
    const id = await registerMediaAsset(db, { organizationId: A.orgId, r2Key: 'tenants/1/uploads/e.jpg', mimeType: 'image/jpeg', extension: 'jpg', sizeBytes: 5_000, visibility: 'public', category: 'upload' })
    await softDeleteMediaAsset(db, id)
    await db.update(schema.mediaAssets).set({ purgedAt: '2026-01-01 00:00:00' }).where(eq(schema.mediaAssets.id, id))

    await restoreMediaAssetByKey(db, 'tenants/1/uploads/e.jpg')
    // Bytes are actually gone from R2 by this point — the counter must stay at "released".
    expect(await orgUsage(A.orgId)).toBe(before)
  })

  it('softDeleteMediaAssetByKey is a no-op for a key with no row (legacy object)', async () => {
    await expect(softDeleteMediaAssetByKey(db, 'uploads/legacy-not-tracked.jpg')).resolves.toBeUndefined()
  })
})

describe('registerGeneratedFile', () => {
  it('computes a real checksum and registers the row', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 fake contract bytes')
    const id = await registerGeneratedFile(db, {
      organizationId: A.orgId,
      r2Key: 'tenants/1/contracts/gen.pdf',
      bytes,
      mimeType: 'application/pdf',
      extension: 'pdf',
      visibility: 'confidential',
      category: 'contract',
    })
    const [row] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, id))
    expect(row.checksum).toHaveLength(64)
    expect(row.sizeBytes).toBe(bytes.byteLength)
    expect(row.visibility).toBe('confidential')
  })
})

describe('assertQuotaAvailable', () => {
  it('allows an upload within the limit', async () => {
    await expect(assertQuotaAvailable(db, A.orgId, 1_000)).resolves.toBeUndefined()
  })

  it('rejects an upload that would exceed the tenant limit, with 413', async () => {
    await db.update(schema.organizations).set({ storageBytesLimit: 10_000, storageBytesUsed: 9_500 }).where(eq(schema.organizations.id, A.orgId))
    await expect(assertQuotaAvailable(db, A.orgId, 1_000)).rejects.toMatchObject({ statusCode: 413 })
  })

  it('a tenant near its limit does not affect another tenant quota', async () => {
    await db.update(schema.organizations).set({ storageBytesLimit: 10_000, storageBytesUsed: 9_999 }).where(eq(schema.organizations.id, A.orgId))
    await expect(assertQuotaAvailable(db, B.orgId, 1_000_000)).resolves.toBeUndefined()
  })

  it('allows an upload that lands exactly at the limit', async () => {
    await db.update(schema.organizations).set({ storageBytesLimit: 10_000, storageBytesUsed: 9_000 }).where(eq(schema.organizations.id, A.orgId))
    await expect(assertQuotaAvailable(db, A.orgId, 1_000)).resolves.toBeUndefined()
  })
})

describe('reconcileStorageUsage', () => {
  it('recomputes the counter from the real sum of non-deleted assets', async () => {
    await registerMediaAsset(db, { organizationId: A.orgId, r2Key: 'tenants/1/uploads/f1.jpg', mimeType: 'image/jpeg', extension: 'jpg', sizeBytes: 100, visibility: 'public', category: 'upload' })
    await registerMediaAsset(db, { organizationId: A.orgId, r2Key: 'tenants/1/uploads/f2.jpg', mimeType: 'image/jpeg', extension: 'jpg', sizeBytes: 200, visibility: 'public', category: 'upload' })
    // Drift: something external clobbers the counter without going through registerMediaAsset.
    await db.update(schema.organizations).set({ storageBytesUsed: 999_999 }).where(eq(schema.organizations.id, A.orgId))

    const total = await reconcileStorageUsage(db, A.orgId)
    expect(total).toBeGreaterThanOrEqual(300)
    expect(await orgUsage(A.orgId)).toBe(total)
  })

  it('excludes soft-deleted assets from the recomputed total', async () => {
    const id = await registerMediaAsset(db, { organizationId: A.orgId, r2Key: 'tenants/1/uploads/g.jpg', mimeType: 'image/jpeg', extension: 'jpg', sizeBytes: 500, visibility: 'public', category: 'upload' })
    const before = await reconcileStorageUsage(db, A.orgId)
    await softDeleteMediaAsset(db, id)
    const after = await reconcileStorageUsage(db, A.orgId)
    expect(after).toBe(before - 500)
  })
})
