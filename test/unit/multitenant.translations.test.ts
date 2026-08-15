import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { adminResources, syncTranslations } from '../../server/utils/adminResources'
import { authorizeRecord } from '../../server/utils/tenantPolicy'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * Translation sync used to be the sharpest edge in the admin CRUD.
 *
 * `syncTranslations(db, def, recordId, translations)` took a bare id and ran
 * `DELETE FROM property_translations WHERE property_id = ?` followed by fresh
 * inserts — with no tenant condition anywhere. The update handler called it
 * unconditionally after its org-scoped UPDATE, so `PUT /api/admin/properties/<B's id>`
 * with a `translations` array changed no columns (the UPDATE matched nothing,
 * correctly) but still wiped and rewrote tenant B's translation rows.
 *
 * The rewrite takes an `AuthorizedRecord` that only `authorizeRecord()` can
 * mint, and re-derives the parent tenant guard for the write itself.
 */

let db: any
let A: TenantFixture
let B: TenantFixture

const def = adminResources.properties
const T = schema.propertyTranslations

function translationsOf(propertyId: number) {
  return db.select().from(T).where(eq(T.propertyId, propertyId))
}

beforeEach(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'Alpha')
  B = await seedTenant(db, 'Beta')
})

describe('syncTranslations tenant isolation', () => {
  it('tenant A cannot mint an authorization for tenant B property', async () => {
    await expect(
      authorizeRecord(db, { resourceKey: 'properties', table: def.table, policy: def.tenantPolicy, id: B.propertyId, orgId: A.orgId }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('tenant B translations survive an attack that reuses a tenant A authorization', async () => {
    // The strongest form of the old bug: the caller IS authorized — for their
    // own record — and then aims the write at someone else's id.
    const { authorized } = await authorizeRecord(db, {
      resourceKey: 'properties',
      table: def.table,
      policy: def.tenantPolicy,
      id: A.propertyId,
      orgId: A.orgId,
    })
    const forgedForB = { ...authorized, id: B.propertyId }

    await expect(
      syncTranslations(db, def, forgedForB as any, [{ locale: 'en', title: 'INJECTED', description: 'INJECTED' }]),
    ).rejects.toMatchObject({ statusCode: 404 })

    const rows = await translationsOf(B.propertyId)
    expect(rows.length, 'tenant B translation rows were deleted').toBe(1)
    expect(rows[0].title).toBe('Beta original title')
  })

  it('a tenant can still replace its own translations', async () => {
    const { authorized } = await authorizeRecord(db, {
      resourceKey: 'properties',
      table: def.table,
      policy: def.tenantPolicy,
      id: A.propertyId,
      orgId: A.orgId,
    })
    await syncTranslations(db, def, authorized, [
      { locale: 'en', title: 'Updated EN', description: 'desc en' },
      { locale: 'ar', title: 'Updated AR', description: 'desc ar' },
    ])

    const rows = await translationsOf(A.propertyId)
    expect(rows.map((r: any) => r.locale).sort()).toEqual(['ar', 'en'])
    expect(rows.find((r: any) => r.locale === 'en').title).toBe('Updated EN')

    // …and doing so leaves the other tenant's rows untouched.
    const other = await translationsOf(B.propertyId)
    expect(other.length).toBe(1)
    expect(other[0].title).toBe('Beta original title')
  })

  it('an absent translations array is a no-op, not a silent wipe', async () => {
    const { authorized } = await authorizeRecord(db, {
      resourceKey: 'properties',
      table: def.table,
      policy: def.tenantPolicy,
      id: A.propertyId,
      orgId: A.orgId,
    })
    await syncTranslations(db, def, authorized, undefined)
    expect((await translationsOf(A.propertyId)).length).toBe(1)
  })

  it('blog translations follow the same rule', async () => {
    const blogDef = adminResources.blogs
    const ts = '2026-01-01 00:00:00'
    const [blogB] = await db
      .insert(schema.blogs)
      .values({ organizationId: B.orgId, slug: 'beta-post', createdAt: ts, updatedAt: ts })
      .returning({ id: schema.blogs.id })
    await db.insert(schema.blogTranslations).values({ blogId: blogB.id, locale: 'en', title: 'Beta post', description: 'Beta body' })

    await expect(
      authorizeRecord(db, { resourceKey: 'blogs', table: blogDef.table, policy: blogDef.tenantPolicy, id: blogB.id, orgId: A.orgId }),
    ).rejects.toMatchObject({ statusCode: 404 })

    const rows = await db.select().from(schema.blogTranslations).where(eq(schema.blogTranslations.blogId, blogB.id))
    expect(rows.length).toBe(1)
    expect(rows[0].title).toBe('Beta post')
  })
})
