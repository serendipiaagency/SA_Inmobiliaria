import { beforeEach, describe, expect, it } from 'vitest'
import {
  getOrCreateSitePage,
  saveDraft,
  publishPage,
  getPublishedPage,
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
