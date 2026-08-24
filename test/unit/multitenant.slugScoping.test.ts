import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'

/**
 * Migration 0042 rescoped agent_properties.slug, developer_properties.slug,
 * blogs.slug and team_members.slug from a single global UNIQUE constraint to
 * a composite unique(organization_id, slug) — two unrelated tenants can now
 * both use the same slug, but a tenant still can't reuse its own.
 */
describe('slug uniqueness is per-tenant, not global (migration 0042)', () => {
  it('developer_properties: two tenants can share a slug; one tenant cannot reuse it', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Alpha')
    const b = await seedTenant(db, 'Beta')

    const [aProject] = await db.select({ slug: schema.developerProperties.slug }).from(schema.developerProperties).where(eq(schema.developerProperties.id, a.projectId))
    const sharedSlug = aProject.slug as string

    // Cross-tenant reuse of the exact same slug succeeds.
    await expect(
      db.insert(schema.developerProperties).values({
        organizationId: b.orgId,
        developerId: b.developerId,
        name: 'Beta reuses Alpha slug',
        slug: sharedSlug,
        status: 'new',
        createdAt: '2026-01-01 00:00:00',
        updatedAt: '2026-01-01 00:00:00',
      }),
    ).resolves.not.toThrow()

    // Same-tenant reuse of its own slug still fails.
    await expect(
      db.insert(schema.developerProperties).values({
        organizationId: a.orgId,
        developerId: a.developerId,
        name: 'Alpha duplicate slug',
        slug: sharedSlug,
        status: 'new',
        createdAt: '2026-01-01 00:00:00',
        updatedAt: '2026-01-01 00:00:00',
      }),
    ).rejects.toThrow()
  })

  it('team_members: two tenants can share a slug; one tenant cannot reuse it', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Gamma')
    const b = await seedTenant(db, 'Delta')

    const [aMember] = await db.select({ slug: schema.teamMembers.slug }).from(schema.teamMembers).where(eq(schema.teamMembers.id, a.teamMemberId))
    const sharedSlug = aMember.slug as string

    await expect(
      db.insert(schema.teamMembers).values({
        organizationId: b.orgId,
        name: 'Delta reuses Gamma slug',
        slug: sharedSlug,
        email: `delta-reuse-${Date.now()}@example.com`,
        position: 'Broker',
        createdAt: '2026-01-01 00:00:00',
        updatedAt: '2026-01-01 00:00:00',
      }),
    ).resolves.not.toThrow()

    await expect(
      db.insert(schema.teamMembers).values({
        organizationId: a.orgId,
        name: 'Gamma duplicate slug',
        slug: sharedSlug,
        email: `gamma-dup-${Date.now()}@example.com`,
        position: 'Broker',
        createdAt: '2026-01-01 00:00:00',
        updatedAt: '2026-01-01 00:00:00',
      }),
    ).rejects.toThrow()
  })

  it('blogs: two tenants can share a slug; one tenant cannot reuse it', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Epsilon')
    const b = await seedTenant(db, 'Zeta')
    const ts = '2026-01-01 00:00:00'

    await db.insert(schema.blogs).values({ organizationId: a.orgId, slug: 'shared-blog-slug', targetAudience: 'UAE', createdAt: ts, updatedAt: ts })

    await expect(
      db.insert(schema.blogs).values({ organizationId: b.orgId, slug: 'shared-blog-slug', targetAudience: 'UAE', createdAt: ts, updatedAt: ts }),
    ).resolves.not.toThrow()

    await expect(
      db.insert(schema.blogs).values({ organizationId: a.orgId, slug: 'shared-blog-slug', targetAudience: 'UAE', createdAt: ts, updatedAt: ts }),
    ).rejects.toThrow()
  })

  it('agent_properties: two tenants can share a slug; one tenant cannot reuse it', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'Eta')
    const b = await seedTenant(db, 'Theta')
    const ts = '2026-01-01 00:00:00'

    await db.insert(schema.agentProperties).values({ organizationId: a.orgId, slug: 'shared-property-slug', status: 'available', createdAt: ts, updatedAt: ts })

    await expect(
      db.insert(schema.agentProperties).values({ organizationId: b.orgId, slug: 'shared-property-slug', status: 'available', createdAt: ts, updatedAt: ts }),
    ).resolves.not.toThrow()

    await expect(
      db.insert(schema.agentProperties).values({ organizationId: a.orgId, slug: 'shared-property-slug', status: 'available', createdAt: ts, updatedAt: ts }),
    ).rejects.toThrow()
  })
})
