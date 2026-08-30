import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'
import { isUniqueConstraintError } from '../../server/utils/db'

/**
 * A double-click or network retry on a critical operation (creating a real
 * Stripe deposit checkout, accepting/sending a legal contract) must not
 * produce two side effects for one intent. Each of these endpoints does a
 * read-then-write (or an external call then a write) with no transaction —
 * these tests exercise the actual data-level guard each one relies on to
 * close that race, independent of the HTTP layer.
 */

describe('deposit_payments_contract_processing (migration 0051)', () => {
  it('two concurrent "processing" deposits for the same contract: exactly one wins', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'DepositRace')
    const ts = '2026-01-01 00:00:00'

    const attempt = (sessionId: string) =>
      db
        .insert(schema.depositPayments)
        .values({ organizationId: t.orgId, contractId: t.contractId, amount: 5000, currency: 'eur', status: 'processing', stripeCheckoutSessionId: sessionId, createdAt: ts })
        .then(() => 'ok' as const)
        .catch((e: any) => (isUniqueConstraintError(e) ? ('conflict' as const) : Promise.reject(e)))

    const results = await Promise.all([attempt('cs_test_a'), attempt('cs_test_b')])
    expect(results.filter((r) => r === 'ok')).toHaveLength(1)
    expect(results.filter((r) => r === 'conflict')).toHaveLength(1)
  })

  it('a failed or not_connected deposit never blocks a new attempt for the same contract', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'DepositRetry')
    const ts = '2026-01-01 00:00:00'

    await db.insert(schema.depositPayments).values({ organizationId: t.orgId, contractId: t.contractId, amount: 5000, currency: 'eur', status: 'failed', createdAt: ts })
    await db.insert(schema.depositPayments).values({ organizationId: t.orgId, contractId: t.contractId, amount: 5000, currency: 'eur', status: 'not_connected', createdAt: ts })

    await expect(
      db.insert(schema.depositPayments).values({ organizationId: t.orgId, contractId: t.contractId, amount: 5000, currency: 'eur', status: 'processing', stripeCheckoutSessionId: 'cs_test_retry', createdAt: ts }),
    ).resolves.not.toThrow()
  })

  it('once a processing deposit resolves (paid), a new attempt for the same contract is allowed again', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'DepositResolved')
    const ts = '2026-01-01 00:00:00'

    const [first] = await db
      .insert(schema.depositPayments)
      .values({ organizationId: t.orgId, contractId: t.contractId, amount: 5000, currency: 'eur', status: 'processing', stripeCheckoutSessionId: 'cs_test_resolved', createdAt: ts })
      .returning({ id: schema.depositPayments.id })
    await db.update(schema.depositPayments).set({ status: 'paid', paidAt: ts }).where(eq(schema.depositPayments.id, first.id))

    await expect(
      db.insert(schema.depositPayments).values({ organizationId: t.orgId, contractId: t.contractId, amount: 5000, currency: 'eur', status: 'processing', stripeCheckoutSessionId: 'cs_test_second', createdAt: ts }),
    ).resolves.not.toThrow()
  })

  it('two different contracts can each have their own processing deposit', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'DepositMultiContract')
    const ts = '2026-01-01 00:00:00'

    const [otherContract] = await db
      .insert(schema.contracts)
      .values({ organizationId: t.orgId, title: 'Second contract', clientName: 'Other client', bodyText: 'Body', status: 'draft', createdAt: ts, updatedAt: ts })
      .returning({ id: schema.contracts.id })

    await db.insert(schema.depositPayments).values({ organizationId: t.orgId, contractId: t.contractId, amount: 5000, currency: 'eur', status: 'processing', stripeCheckoutSessionId: 'cs_test_c1', createdAt: ts })

    await expect(
      db.insert(schema.depositPayments).values({ organizationId: t.orgId, contractId: otherContract.id, amount: 5000, currency: 'eur', status: 'processing', stripeCheckoutSessionId: 'cs_test_c2', createdAt: ts }),
    ).resolves.not.toThrow()
  })
})

describe('contract accept/send race (conditional UPDATE ... WHERE status = X)', () => {
  it('two concurrent "accept" updates on the same sent contract: exactly one flips status', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'ContractAcceptRace')
    const ts = '2026-01-01 00:00:00'
    await db.update(schema.contracts).set({ status: 'sent', managementToken: 'tok-accept-race' }).where(eq(schema.contracts.id, t.contractId))

    const attempt = () =>
      db
        .update(schema.contracts)
        .set({ status: 'accepted', acceptedByName: 'Someone', acceptedAt: ts, updatedAt: ts })
        .where(and(eq(schema.contracts.id, t.contractId), eq(schema.contracts.status, 'sent')))
        .returning({ id: schema.contracts.id })
        .then((rows: any[]) => (rows[0] ? 'ok' : 'conflict'))

    const results = await Promise.all([attempt(), attempt()])
    expect(results.filter((r) => r === 'ok')).toHaveLength(1)
    expect(results.filter((r) => r === 'conflict')).toHaveLength(1)

    const [final] = await db.select({ status: schema.contracts.status }).from(schema.contracts).where(eq(schema.contracts.id, t.contractId))
    expect(final.status).toBe('accepted')
  })

  it('two concurrent "send" updates on the same draft contract: exactly one flips status', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'ContractSendRace')
    // seedTenant's contract is already 'draft' by default — no setup needed.

    const attempt = () =>
      db
        .update(schema.contracts)
        .set({ status: 'sent', managementToken: 'tok-send-race' })
        .where(and(eq(schema.contracts.id, t.contractId), eq(schema.contracts.status, 'draft')))
        .returning({ id: schema.contracts.id })
        .then((rows: any[]) => (rows[0] ? 'ok' : 'conflict'))

    const results = await Promise.all([attempt(), attempt()])
    expect(results.filter((r) => r === 'ok')).toHaveLength(1)
    expect(results.filter((r) => r === 'conflict')).toHaveLength(1)
  })
})
