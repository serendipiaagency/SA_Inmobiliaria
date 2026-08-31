import { describe, expect, it } from 'vitest'
import { eq, and } from 'drizzle-orm'
import { getOrSetVisitorId } from '../../server/utils/visitor'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'
import { isUniqueConstraintError } from '../../server/utils/db'

/**
 * favorite.post.ts used to trust the client-supplied `on` boolean to
 * increment/decrement developer_properties.favorite_count directly, with no
 * identity behind it — a script could inflate or zero out any listing's
 * count by replaying the same request. view.post.ts had the same shape of
 * problem: no rate limit, no dedup, so a script could inflate view counts
 * too (docs/production-hardening-audit.md, P1-6/P1-7). Both now key off
 * server/utils/visitor.ts's anonymous per-browser cookie — these tests
 * cover that utility directly, plus the `favorites` table's real
 * per-visitor uniqueness (migration 0055).
 */

function fakeEvent(cookieHeader?: string) {
  const responseCookies: string[] = []
  return {
    _cookies: responseCookies,
    node: {
      req: { headers: { cookie: cookieHeader ?? '' } },
      res: {
        getHeader: () => undefined,
        setHeader: (_name: string, value: string) => responseCookies.push(value),
        appendHeader: (_name: string, value: string) => responseCookies.push(value),
      },
    },
  } as any
}

describe('getOrSetVisitorId', () => {
  it('returns the existing cookie value when it already looks like a valid visitor id', () => {
    const id = 'a'.repeat(32)
    const event = fakeEvent(`sa_visitor=${id}`)
    expect(getOrSetVisitorId(event)).toBe(id)
    expect(event._cookies).toHaveLength(0) // no new cookie set — nothing to do
  })

  it('mints and sets a new cookie when none is present', () => {
    const event = fakeEvent()
    const id = getOrSetVisitorId(event)
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(event._cookies.some((c: string) => c.includes(`sa_visitor=${id}`))).toBe(true)
  })

  it('mints a fresh id when the existing cookie is malformed (tampered or from an old format)', () => {
    const event = fakeEvent('sa_visitor=not-a-real-id')
    const id = getOrSetVisitorId(event)
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(id).not.toBe('not-a-real-id')
  })

  it('two different requests with no cookie get two different visitor ids', () => {
    const idA = getOrSetVisitorId(fakeEvent())
    const idB = getOrSetVisitorId(fakeEvent())
    expect(idA).not.toBe(idB)
  })
})

describe('favorites (migration 0055) — real per-visitor state, not a raw counter', () => {
  it('the same visitor cannot favorite the same property twice (unique constraint)', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'FavoriteDup')
    const ts = '2026-01-01 00:00:00'
    const visitorId = 'v'.repeat(32)

    await db.insert(schema.favorites).values({ organizationId: t.orgId, developerPropertyId: t.projectId, visitorId, createdAt: ts })

    let error: any
    try {
      await db.insert(schema.favorites).values({ organizationId: t.orgId, developerPropertyId: t.projectId, visitorId, createdAt: ts })
    } catch (e) {
      error = e
    }
    expect(error).toBeDefined()
    expect(isUniqueConstraintError(error)).toBe(true)
  })

  it('two different visitors can each favorite the same property', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'FavoriteMulti')
    const ts = '2026-01-01 00:00:00'

    await db.insert(schema.favorites).values({ organizationId: t.orgId, developerPropertyId: t.projectId, visitorId: 'a'.repeat(32), createdAt: ts })
    await expect(
      db.insert(schema.favorites).values({ organizationId: t.orgId, developerPropertyId: t.projectId, visitorId: 'b'.repeat(32), createdAt: ts }),
    ).resolves.not.toThrow()

    const rows = await db.select().from(schema.favorites).where(eq(schema.favorites.developerPropertyId, t.projectId))
    expect(rows).toHaveLength(2)
  })

  it('removing one visitor\'s favorite leaves another visitor\'s favorite for the same property untouched', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'FavoriteRemove')
    const ts = '2026-01-01 00:00:00'
    const visitorA = 'a'.repeat(32)
    const visitorB = 'b'.repeat(32)

    await db.insert(schema.favorites).values([
      { organizationId: t.orgId, developerPropertyId: t.projectId, visitorId: visitorA, createdAt: ts },
      { organizationId: t.orgId, developerPropertyId: t.projectId, visitorId: visitorB, createdAt: ts },
    ])

    await db.delete(schema.favorites).where(and(eq(schema.favorites.developerPropertyId, t.projectId), eq(schema.favorites.visitorId, visitorA)))

    const remaining = await db.select().from(schema.favorites).where(eq(schema.favorites.developerPropertyId, t.projectId))
    expect(remaining).toHaveLength(1)
    expect(remaining[0].visitorId).toBe(visitorB)
  })
})
