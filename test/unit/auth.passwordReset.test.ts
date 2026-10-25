import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createPasswordResetToken, consumePasswordResetToken, revokeAllSessions } from '../../server/utils/auth'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'

describe('password reset tokens', () => {
  it('a fresh token round-trips to the right userId, and cannot be reused', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'PwReset')

    const token = await createPasswordResetToken(db, a.userId)
    expect(token).toMatch(/^[0-9a-f]{48}$/) // 24 random bytes, hex-encoded

    const userId = await consumePasswordResetToken(db, token)
    expect(userId).toBe(a.userId)

    // Same token again: already used.
    const second = await consumePasswordResetToken(db, token)
    expect(second).toBeNull()
  })

  it('recuperar la contraseña cierra las sesiones abiertas de esa cuenta, y sólo de esa', async () => {
    // Es lo que hace que cambiar una contraseña retire el acceso de verdad.
    // Sin esto, quien ya no debería entrar sigue dentro con su cookie hasta
    // que caduque (SESSION_TTL_DAYS = 7 días).
    const { db } = createTestDb()
    const a = await seedTenant(db, 'PwResetSessions')
    const b = await seedTenant(db, 'PwResetOtra')

    const ts = '2026-01-01 00:00:00'
    const expires = '2030-01-01 00:00:00'
    await db.insert(schema.sessions).values([
      { id: 's1', userId: a.userId, tokenHash: 'h1', expiresAt: expires, createdAt: ts },
      { id: 's2', userId: a.userId, tokenHash: 'h2', expiresAt: expires, createdAt: ts },
      { id: 's3', userId: b.userId, tokenHash: 'h3', expiresAt: expires, createdAt: ts },
    ])

    expect(await revokeAllSessions(db, a.userId), 'devuelve cuántas cerró, para poder auditarlo').toBe(2)
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, a.userId))).toHaveLength(0)
    // La sesión de otra cuenta no se toca: cerrar el acceso de uno no echa a nadie más.
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, b.userId))).toHaveLength(1)
  })

  it('only the SHA-256 hash is stored, never the raw token', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'PwResetHash')
    const token = await createPasswordResetToken(db, a.userId)

    const [row] = await db.select().from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, a.userId))
    expect(row.tokenHash).not.toBe(token)
    expect(row.tokenHash).toHaveLength(64) // hex-encoded SHA-256
  })

  it('a made-up token is rejected', async () => {
    const { db } = createTestDb()
    await seedTenant(db, 'PwResetFake')
    expect(await consumePasswordResetToken(db, 'not-a-real-token-at-all')).toBeNull()
  })

  it('an expired token is rejected even if otherwise valid', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'PwResetExpired')
    const token = await createPasswordResetToken(db, a.userId)

    // Force it into the past, same technique other tests use to simulate age.
    await db.update(schema.passwordResetTokens).set({ expiresAt: '2000-01-01 00:00:00' }).where(eq(schema.passwordResetTokens.userId, a.userId))

    expect(await consumePasswordResetToken(db, token)).toBeNull()
  })

  it('creating a second token for the same user does not invalidate a still-valid first one — both work until used', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'PwResetTwo')
    const first = await createPasswordResetToken(db, a.userId)
    const second = await createPasswordResetToken(db, a.userId)

    expect(await consumePasswordResetToken(db, second)).toBe(a.userId)
    expect(await consumePasswordResetToken(db, first)).toBe(a.userId)
  })
})
