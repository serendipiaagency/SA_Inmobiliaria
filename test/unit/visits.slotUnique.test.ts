import { describe, expect, it } from 'vitest'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'
import { isUniqueConstraintError } from '../../server/utils/db'

/**
 * server/api/public/agents/[slug]/book.post.ts does isSlotAvailable() (a
 * read) and then INSERT INTO visits (a separate write) — two concurrent
 * requests for the same agent/slot can both pass the read before either
 * writes, producing two confirmed bookings (docs/production-hardening-audit.md,
 * P0-1). Migration 0050's visits_agent_slot_unique closes that at the data
 * layer: this suite proves the constraint itself behaves exactly as the
 * booking/reschedule endpoints depend on, independent of any HTTP mocking.
 */
describe('visits_agent_slot_unique (migration 0050)', () => {
  it('a second non-cancelled booking for the same org+agent+slot is rejected', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'Slots')
    const ts = '2026-01-01 00:00:00'

    await db.insert(schema.visits).values({
      organizationId: t.orgId,
      clientName: 'First client',
      agentId: t.teamMemberId,
      scheduledAt: '2030-06-10 09:00:00',
      status: 'scheduled',
      createdAt: ts,
    })

    let error: any
    try {
      await db.insert(schema.visits).values({
        organizationId: t.orgId,
        clientName: 'Second client (loses the race)',
        agentId: t.teamMemberId,
        scheduledAt: '2030-06-10 09:00:00',
        status: 'scheduled',
        createdAt: ts,
      })
    } catch (e) {
      error = e
    }
    expect(error).toBeDefined()
    expect(isUniqueConstraintError(error)).toBe(true)
  })

  it('two concurrent inserts for the same slot: exactly one wins', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'Race')
    const ts = '2026-01-01 00:00:00'

    const attempt = (clientName: string) =>
      db
        .insert(schema.visits)
        .values({ organizationId: t.orgId, clientName, agentId: t.teamMemberId, scheduledAt: '2030-07-01 15:00:00', status: 'scheduled', createdAt: ts })
        .then(() => 'ok' as const)
        .catch((e: any) => (isUniqueConstraintError(e) ? ('conflict' as const) : Promise.reject(e)))

    const results = await Promise.all([attempt('Client A'), attempt('Client B')])
    expect(results.filter((r) => r === 'ok')).toHaveLength(1)
    expect(results.filter((r) => r === 'conflict')).toHaveLength(1)
  })

  it('a cancelled visit never blocks a new booking in its old slot', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'Reuse')
    const ts = '2026-01-01 00:00:00'

    await db.insert(schema.visits).values({
      organizationId: t.orgId,
      clientName: 'Cancelled client',
      agentId: t.teamMemberId,
      scheduledAt: '2030-08-01 09:00:00',
      status: 'cancelled',
      createdAt: ts,
    })

    await expect(
      db.insert(schema.visits).values({
        organizationId: t.orgId,
        clientName: 'New client, same slot',
        agentId: t.teamMemberId,
        scheduledAt: '2030-08-01 09:00:00',
        status: 'scheduled',
        createdAt: ts,
      }),
    ).resolves.not.toThrow()
  })

  it('two different agents can share the same slot', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'MultiAgent')
    const ts = '2026-01-01 00:00:00'

    const [otherAgent] = await db
      .insert(schema.teamMembers)
      .values({ organizationId: t.orgId, name: 'Other Broker', slug: 'other-broker-multiagent', email: 'other-broker-multiagent@example.com', position: 'Broker', createdAt: ts, updatedAt: ts })
      .returning({ id: schema.teamMembers.id })

    await db.insert(schema.visits).values({ organizationId: t.orgId, clientName: 'Client 1', agentId: t.teamMemberId, scheduledAt: '2030-09-01 09:00:00', status: 'scheduled', createdAt: ts })

    await expect(
      db.insert(schema.visits).values({ organizationId: t.orgId, clientName: 'Client 2', agentId: otherAgent.id, scheduledAt: '2030-09-01 09:00:00', status: 'scheduled', createdAt: ts }),
    ).resolves.not.toThrow()
  })
})
