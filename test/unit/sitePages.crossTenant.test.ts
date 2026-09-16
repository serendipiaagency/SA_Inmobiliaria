import { beforeEach, describe, expect, it } from 'vitest'
import {
  getOrCreateSitePage,
  saveDraft,
  publishPage,
  getPublishedPage,
  listPageVersions,
  restorePageVersion,
  validatePageDocument,
  type SitePageDocument,
} from '../../server/utils/sitePages'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * The Constructor Web has no id-in-URL for its `site_pages` row at all — every
 * admin endpoint resolves the row purely from the session's own orgId plus a
 * fixed pageKey ('home'). That removes the classic IDOR shape (no id to
 * tamper with), but it only holds if every helper here actually threads
 * orgId through instead of e.g. resolving the first row with a matching
 * pageKey regardless of tenant. This suite proves that against a real
 * migrated schema, the same way multitenant.crossTenant.test.ts does for the
 * generic admin CRUD.
 */

let db: any
let A: TenantFixture
let B: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'Alpha')
  B = await seedTenant(db, 'Beta')
})

function doc(title: string): SitePageDocument {
  return { blocks: [{ id: 'hero', type: 'hero', version: 1, content: { title1: title } }], seo: { title } }
}

describe('site_pages tenant isolation', () => {
  it('lazily creates independent rows per organization', async () => {
    const pageA = await getOrCreateSitePage(db, A.orgId, 'home')
    const pageB = await getOrCreateSitePage(db, B.orgId, 'home')
    expect(pageA.id).not.toBe(pageB.id)
    expect(pageA.organizationId).toBe(A.orgId)
    expect(pageB.organizationId).toBe(B.orgId)
  })

  it('saving tenant A draft never touches tenant B draft', async () => {
    await saveDraft(db, A.orgId, 'home', doc('Alpha draft'))
    await saveDraft(db, B.orgId, 'home', doc('Beta draft'))

    const pageA = await getOrCreateSitePage(db, A.orgId, 'home')
    const pageB = await getOrCreateSitePage(db, B.orgId, 'home')
    expect(JSON.parse(pageA.draftJson).seo.title).toBe('Alpha draft')
    expect(JSON.parse(pageB.draftJson).seo.title).toBe('Beta draft')
  })

  it('publishing tenant A never publishes or exposes tenant B content', async () => {
    await saveDraft(db, A.orgId, 'home', doc('Alpha published'))
    await saveDraft(db, B.orgId, 'home', doc('Beta draft only'))
    await publishPage(db, A.orgId, 'home', A.userId)

    const publishedA = await getPublishedPage(db, A.orgId, 'home')
    const publishedB = await getPublishedPage(db, B.orgId, 'home')
    expect(publishedA.seo.title).toBe('Alpha published')
    // B never published — its public read must stay empty, never fall back
    // to A's content or to B's own unpublished draft.
    expect(publishedB.blocks).toEqual([])
  })

  it('each organization gets its own version counter and version history', async () => {
    await saveDraft(db, A.orgId, 'home', doc('A v1'))
    const vA1 = await publishPage(db, A.orgId, 'home', A.userId)
    await saveDraft(db, A.orgId, 'home', doc('A v2'))
    const vA2 = await publishPage(db, A.orgId, 'home', A.userId)

    await saveDraft(db, B.orgId, 'home', doc('B v1'))
    const vB1 = await publishPage(db, B.orgId, 'home', B.userId)

    expect(vA1).toBe(1)
    expect(vA2).toBe(2)
    // B's counter starts fresh at 1 regardless of how many times A published.
    expect(vB1).toBe(1)
  })

  it('a request with no resolvable org can never fall through to an unfiltered read', async () => {
    await expect(getOrCreateSitePage(db, null as any, 'home')).rejects.toThrow()
  })
})

/**
 * Version history is the one place in the Constructor Web where a number from
 * the request reaches the database — `site_page_versions` has no
 * organizationId of its own, so the row is found by (pageId, version), and
 * pageId has to come from the session's org rather than from the caller.
 *
 * The dangerous case is specific and easy to get wrong: **every org's history
 * starts at version 1**, so a query that forgot the pageId would happily hand
 * Alpha whichever "version 1" it found first. These tests publish on both
 * tenants precisely so those numbers collide.
 */
describe('site_page_versions tenant isolation', () => {
  it('lists only this organization’s own history', async () => {
    await saveDraft(db, A.orgId, 'home', doc('A v1'))
    await publishPage(db, A.orgId, 'home', A.userId)
    await saveDraft(db, A.orgId, 'home', doc('A v2'))
    await publishPage(db, A.orgId, 'home', A.userId)

    await saveDraft(db, B.orgId, 'home', doc('B v1'))
    await publishPage(db, B.orgId, 'home', B.userId)

    const historyA = await listPageVersions(db, A.orgId, 'home')
    const historyB = await listPageVersions(db, B.orgId, 'home')

    expect(historyA.map((v) => v.version)).toEqual([2, 1]) // newest first
    expect(historyA.map((v) => v.seoTitle)).toEqual(['A v2', 'A v1'])
    expect(historyB.map((v) => v.version)).toEqual([1])
    expect(historyB[0].seoTitle).toBe('B v1')
  })

  it('summarises each version without reading the whole snapshot back', async () => {
    const twoBlocks: SitePageDocument = {
      blocks: [
        { id: 'hero', type: 'hero', version: 1, content: {} },
        { id: 'cta', type: 'cta', version: 1, content: {} },
      ],
      seo: { title: 'Portada' },
    }
    await saveDraft(db, A.orgId, 'home', twoBlocks)
    await publishPage(db, A.orgId, 'home', A.userId)

    const [v1] = await listPageVersions(db, A.orgId, 'home')
    expect(v1.blockCount).toBe(2)
    expect(v1.seoTitle).toBe('Portada')
    expect(v1.publishedByName).toBe('Alpha Admin')
    // The live site is serving exactly this version.
    expect(v1.isCurrent).toBe(true)
  })

  it('restoring "version 1" restores THIS tenant’s version 1, never the other’s', async () => {
    // B publishes FIRST on purpose: its version 1 is then the lower id, so a
    // lookup that forgot the pageId would return B's row to A and this test
    // would fail. Seeding A first would let that bug pass unnoticed.
    await saveDraft(db, B.orgId, 'home', doc('B v1'))
    await publishPage(db, B.orgId, 'home', B.userId)
    await saveDraft(db, A.orgId, 'home', doc('A v1'))
    await publishPage(db, A.orgId, 'home', A.userId)

    // Both tenants now have a version 1. Move each draft away from it first,
    // so a restore that did nothing would be indistinguishable from a pass.
    await saveDraft(db, A.orgId, 'home', doc('A borrador nuevo'))
    await saveDraft(db, B.orgId, 'home', doc('B borrador nuevo'))

    const restoredA = await restorePageVersion(db, A.orgId, 'home', 1)
    expect(restoredA.seo.title).toBe('A v1')

    const pageA = await getOrCreateSitePage(db, A.orgId, 'home')
    const pageB = await getOrCreateSitePage(db, B.orgId, 'home')
    expect(JSON.parse(pageA.draftJson).seo.title).toBe('A v1')
    // B's draft is untouched by A's restore.
    expect(JSON.parse(pageB.draftJson).seo.title).toBe('B borrador nuevo')
  })

  it('restores onto the draft and leaves the published site alone', async () => {
    await saveDraft(db, A.orgId, 'home', doc('v1'))
    await publishPage(db, A.orgId, 'home', A.userId)
    await saveDraft(db, A.orgId, 'home', doc('v2'))
    await publishPage(db, A.orgId, 'home', A.userId)

    await restorePageVersion(db, A.orgId, 'home', 1)

    const page = await getOrCreateSitePage(db, A.orgId, 'home')
    expect(JSON.parse(page.draftJson).seo.title).toBe('v1')
    // Restoring is not republishing: visitors still see v2, and the counter
    // has not moved, until someone presses Publicar.
    expect((await getPublishedPage(db, A.orgId, 'home')).seo.title).toBe('v2')
    expect(page.version).toBe(2)
  })

  it('rejects a version that belongs to another tenant, even though it exists', async () => {
    await saveDraft(db, A.orgId, 'home', doc('A v1'))
    await publishPage(db, A.orgId, 'home', A.userId)
    await saveDraft(db, A.orgId, 'home', doc('A v2'))
    await publishPage(db, A.orgId, 'home', A.userId)

    await saveDraft(db, B.orgId, 'home', doc('B v1'))
    await publishPage(db, B.orgId, 'home', B.userId)

    // Version 2 exists in the table — it is Alpha's. Beta must not reach it.
    await expect(restorePageVersion(db, B.orgId, 'home', 2)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('a request with no resolvable org can neither list nor restore', async () => {
    await expect(listPageVersions(db, null as any, 'home')).rejects.toThrow()
    await expect(restorePageVersion(db, null as any, 'home', 1)).rejects.toThrow()
  })
})

describe('validatePageDocument', () => {
  it('accepts a well-formed document', () => {
    const result = validatePageDocument({ blocks: [{ id: 'hero', type: 'hero', content: {} }], seo: { title: 'x' } })
    expect(result.blocks).toHaveLength(1)
  })

  it('rejects a non-array blocks field', () => {
    expect(() => validatePageDocument({ blocks: 'nope' })).toThrow()
  })

  it('rejects a block missing id or type', () => {
    expect(() => validatePageDocument({ blocks: [{ id: 'hero' }] })).toThrow()
    expect(() => validatePageDocument({ blocks: [{ type: 'hero' }] })).toThrow()
  })

  it('rejects duplicate block ids', () => {
    expect(() =>
      validatePageDocument({ blocks: [{ id: 'a', type: 'hero' }, { id: 'a', type: 'hero' }] }),
    ).toThrow()
  })

  it('rejects more than the maximum number of blocks', () => {
    const blocks = Array.from({ length: 201 }, (_, i) => ({ id: `b${i}`, type: 'hero' }))
    expect(() => validatePageDocument({ blocks })).toThrow()
  })
})
