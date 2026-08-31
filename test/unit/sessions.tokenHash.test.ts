import { describe, expect, it } from 'vitest'
import { and, eq, isNull, or } from 'drizzle-orm'
import { createTestDb } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'
import { isUniqueConstraintError } from '../../server/utils/db'

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * server/utils/auth.ts's createSession/getSessionUser/destroySession now
 * store only a SHA-256 hash of the session token (migration 0052) — the raw
 * token itself never lands in D1, only the client's cookie. Existing
 * sessions from before this shipped (id = the raw token, tokenHash = NULL)
 * must keep working via a fallback lookup and get rotated to a hashed row
 * on their first valid use, so nobody is logged out by the migration. These
 * tests exercise the same query shape getSessionUser() uses (its helpers
 * aren't exported, so this recomputes the identical SHA-256/OR-lookup/
 * conditional-rotate logic against a real SQLite-backed sessions table)
 * plus the schema-level guarantees (migration 0052's column + index).
 */
describe('sessions.token_hash (migration 0052)', () => {
  async function seedUser(db: any) {
    const ts = '2026-01-01 00:00:00'
    const [user] = await db.insert(schema.users).values({ name: 'Sesh', email: `sesh-${Math.random()}@example.com`, password: 'x', role: 'admin', createdAt: ts, updatedAt: ts }).returning({ id: schema.users.id })
    return user.id as number
  }

  it('two hashed sessions cannot share the same token_hash (real collision, not just theoretical)', async () => {
    const { db } = createTestDb()
    const userId = await seedUser(db)
    const hash = await sha256Hex('same-raw-token-reused-by-mistake')

    await db.insert(schema.sessions).values({ id: 'sess-a', userId, expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-01-01 00:00:00', tokenHash: hash })

    let error: any
    try {
      await db.insert(schema.sessions).values({ id: 'sess-b', userId, expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-01-01 00:00:00', tokenHash: hash })
    } catch (e) {
      error = e
    }
    expect(error).toBeDefined()
    expect(isUniqueConstraintError(error)).toBe(true)
  })

  it('multiple legacy rows with a NULL token_hash coexist fine (partial index only covers non-null hashes)', async () => {
    const { db } = createTestDb()
    const userId = await seedUser(db)

    await expect(
      db.insert(schema.sessions).values([
        { id: 'legacy-token-1', userId, expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-01-01 00:00:00' },
        { id: 'legacy-token-2', userId, expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-01-01 00:00:00' },
      ]),
    ).resolves.not.toThrow()
  })

  it('a legacy plaintext session is found via the id fallback and rotated to a hashed row on lookup', async () => {
    const { db } = createTestDb()
    const userId = await seedUser(db)
    const rawToken = 'legacy-raw-session-token-abc123'

    // Simulates a row created before migration 0052 shipped: id IS the raw token, no hash yet.
    await db.insert(schema.sessions).values({ id: rawToken, userId, expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-01-01 00:00:00' })

    // --- exact lookup shape getSessionUser() uses ---
    const tokenHash = await sha256Hex(rawToken)
    const rows = await db
      .select({ sessionId: schema.sessions.id, sessionTokenHash: schema.sessions.tokenHash })
      .from(schema.sessions)
      .where(or(eq(schema.sessions.tokenHash, tokenHash), eq(schema.sessions.id, rawToken)))
      .limit(1)
    const row = rows[0]
    expect(row).toBeDefined()
    expect(row.sessionId).toBe(rawToken)
    expect(row.sessionTokenHash).toBeNull()

    // --- exact rotation getSessionUser() performs ---
    await db.update(schema.sessions).set({ id: 'new-opaque-id-xyz', tokenHash }).where(eq(schema.sessions.id, row.sessionId))

    // The old plaintext id no longer resolves anything...
    const afterRotationById = await db.select().from(schema.sessions).where(eq(schema.sessions.id, rawToken))
    expect(afterRotationById).toHaveLength(0)

    // ...but the same raw token (re-hashed, exactly what a real subsequent request does) still finds the session.
    const afterRotationByHash = await db
      .select({ sessionId: schema.sessions.id, sessionTokenHash: schema.sessions.tokenHash })
      .from(schema.sessions)
      .where(or(eq(schema.sessions.tokenHash, tokenHash), eq(schema.sessions.id, rawToken)))
      .limit(1)
    expect(afterRotationByHash[0]?.sessionId).toBe('new-opaque-id-xyz')
    expect(afterRotationByHash[0]?.sessionTokenHash).toBe(tokenHash)

    // No row anywhere still stores the raw token in plaintext.
    const anyPlaintext = await db.select({ id: schema.sessions.id }).from(schema.sessions).where(and(eq(schema.sessions.id, rawToken), isNull(schema.sessions.tokenHash)))
    expect(anyPlaintext).toHaveLength(0)
  })

  it('destroySession-style delete matches both a hashed session and an unrotated legacy one', async () => {
    const { db } = createTestDb()
    const userId = await seedUser(db)
    const hashedToken = 'hashed-flow-token'
    const legacyToken = 'legacy-flow-token'
    const hashedTokenHash = await sha256Hex(hashedToken)

    await db.insert(schema.sessions).values([
      { id: 'opaque-1', userId, expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-01-01 00:00:00', tokenHash: hashedTokenHash },
      { id: legacyToken, userId, expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-01-01 00:00:00' },
    ])

    await db.delete(schema.sessions).where(or(eq(schema.sessions.tokenHash, hashedTokenHash), eq(schema.sessions.id, hashedToken)))
    await db.delete(schema.sessions).where(or(eq(schema.sessions.tokenHash, await sha256Hex(legacyToken)), eq(schema.sessions.id, legacyToken)))

    const remaining = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId))
    expect(remaining).toHaveLength(0)
  })
})
