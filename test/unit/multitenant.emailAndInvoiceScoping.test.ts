import { describe, expect, it } from 'vitest'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'

/**
 * Migration 0053 rescoped agents.email, developers.email, team_members.email
 * and invoices.number from a single global UNIQUE constraint to composite
 * unique(organization_id, X) — same pattern as migration 0042's slug
 * rescoping (test/unit/multitenant.slugScoping.test.ts). Two unrelated
 * tenants can now both use the same email/invoice number, but a tenant
 * still can't reuse its own.
 */
describe('email/invoice-number uniqueness is per-tenant, not global (migration 0053)', () => {
  it('agents: two tenants can share an email; one tenant cannot reuse it', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'AgentEmailA')
    const b = await seedTenant(db, 'AgentEmailB')
    const ts = '2026-01-01 00:00:00'
    const sharedEmail = 'shared-agent@example.com'

    await db.insert(schema.agents).values({ organizationId: a.orgId, name: 'Agent A', email: sharedEmail, status: 'active', createdAt: ts, updatedAt: ts })

    await expect(
      db.insert(schema.agents).values({ organizationId: b.orgId, name: 'Agent B reuses A email', email: sharedEmail, status: 'active', createdAt: ts, updatedAt: ts }),
    ).resolves.not.toThrow()

    await expect(
      db.insert(schema.agents).values({ organizationId: a.orgId, name: 'Agent A duplicate', email: sharedEmail, status: 'active', createdAt: ts, updatedAt: ts }),
    ).rejects.toThrow()
  })

  it('developers: two tenants can share an email; one tenant cannot reuse it (nullable email unaffected)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'DevEmailA')
    const b = await seedTenant(db, 'DevEmailB')
    const ts = '2026-01-01 00:00:00'
    const sharedEmail = 'shared-developer@example.com'

    await db.insert(schema.developers).values({ organizationId: a.orgId, name: 'Dev A', email: sharedEmail, status: 'active', createdAt: ts, updatedAt: ts })

    await expect(
      db.insert(schema.developers).values({ organizationId: b.orgId, name: 'Dev B reuses A email', email: sharedEmail, status: 'active', createdAt: ts, updatedAt: ts }),
    ).resolves.not.toThrow()

    await expect(
      db.insert(schema.developers).values({ organizationId: a.orgId, name: 'Dev A duplicate', email: sharedEmail, status: 'active', createdAt: ts, updatedAt: ts }),
    ).rejects.toThrow()

    // Multiple developers with no email at all (NULL) coexist fine within the same tenant.
    await expect(
      db.insert(schema.developers).values([
        { organizationId: a.orgId, name: 'Dev A no email 1', status: 'active', createdAt: ts, updatedAt: ts },
        { organizationId: a.orgId, name: 'Dev A no email 2', status: 'active', createdAt: ts, updatedAt: ts },
      ]),
    ).resolves.not.toThrow()
  })

  it('team_members: two tenants can share an email; one tenant cannot reuse it', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TeamEmailA')
    const b = await seedTenant(db, 'TeamEmailB')
    const ts = '2026-01-01 00:00:00'
    const sharedEmail = 'shared-broker@example.com'

    await db.insert(schema.teamMembers).values({ organizationId: a.orgId, name: 'Broker A', slug: 'broker-a-email-test', email: sharedEmail, position: 'Broker', createdAt: ts, updatedAt: ts })

    await expect(
      db.insert(schema.teamMembers).values({ organizationId: b.orgId, name: 'Broker B reuses A email', slug: 'broker-b-email-test', email: sharedEmail, position: 'Broker', createdAt: ts, updatedAt: ts }),
    ).resolves.not.toThrow()

    await expect(
      db.insert(schema.teamMembers).values({ organizationId: a.orgId, name: 'Broker A duplicate', slug: 'broker-a-email-test-2', email: sharedEmail, position: 'Broker', createdAt: ts, updatedAt: ts }),
    ).rejects.toThrow()
  })

  it('invoices: two tenants can share a number; one tenant cannot reuse it', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'InvoiceA')
    const b = await seedTenant(db, 'InvoiceB')
    const ts = '2026-01-01 00:00:00'
    const sharedNumber = 'INV-0001'

    await db.insert(schema.invoices).values({ organizationId: a.orgId, number: sharedNumber, clientName: 'Client A', amount: 1000, tax: 210, status: 'pending', issuedAt: '2026-01-01', createdAt: ts })

    await expect(
      db.insert(schema.invoices).values({ organizationId: b.orgId, number: sharedNumber, clientName: 'Client B reuses A number', amount: 500, tax: 105, status: 'pending', issuedAt: '2026-01-01', createdAt: ts }),
    ).resolves.not.toThrow()

    await expect(
      db.insert(schema.invoices).values({ organizationId: a.orgId, number: sharedNumber, clientName: 'Client A duplicate', amount: 2000, tax: 420, status: 'pending', issuedAt: '2026-01-01', createdAt: ts }),
    ).rejects.toThrow()
  })
})
