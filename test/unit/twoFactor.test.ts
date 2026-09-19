import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'
import {
  beginTwoFactorSetup,
  CHALLENGE_MAX_ATTEMPTS,
  CHALLENGE_TTL_MINUTES,
  checkSecondFactor,
  confirmTwoFactorSetup,
  createLoginChallenge,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  resolveLoginChallenge,
  TwoFactorUnavailableError,
} from '../../server/utils/twoFactor'
import { totpCode } from '../../server/utils/totp'

/**
 * El segundo factor de una cuenta contra la base real de pruebas (las
 * migraciones reales, la tabla users real): alta, activación, login con
 * desafío, anti-repetición, códigos de recuperación y desactivación.
 */
const env = { TOTP_ENCRYPTION_KEY: 'clave-de-prueba-no-usar-en-produccion' }
const T0 = 1_700_000_000_000

async function enabledAccount(db: any, userId: number) {
  const { secret } = await beginTwoFactorSetup(db, env, userId)
  const result = await confirmTwoFactorSetup(db, env, userId, await totpCode(secret, T0), T0)
  if (!result.ok) throw new Error('no se pudo activar en la preparación')
  return { secret, recoveryCodes: result.recoveryCodes }
}

describe('alta y activación', () => {
  it('sin TOTP_ENCRYPTION_KEY no se puede ni empezar, y el estado lo dice', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TfNoKey')
    await expect(beginTwoFactorSetup(db, {}, a.userId)).rejects.toBeInstanceOf(TwoFactorUnavailableError)
    expect((await getTwoFactorStatus(db, {}, a.userId)).available).toBe(false)
  })

  it('el secreto se guarda cifrado y el alta no protege nada hasta confirmarla con un código', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TfSetup')
    const { secret, otpauthUrl } = await beginTwoFactorSetup(db, env, a.userId)
    expect(otpauthUrl).toContain(secret)

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, a.userId))
    expect(row.totpSecret).toBeTruthy()
    expect(row.totpSecret).not.toContain(secret)
    expect(row.totpEnabledAt).toBeNull()

    const status = await getTwoFactorStatus(db, env, a.userId)
    expect(status).toMatchObject({ available: true, enabled: false, pending: true, recoveryCodesLeft: 0 })
    // Un login ahora no pide segundo factor: checkSecondFactor no acepta nada.
    expect((await checkSecondFactor(db, env, a.userId, await totpCode(secret, T0), T0)).ok).toBe(false)
  })

  it('un código incorrecto no activa; el correcto activa y entrega 10 códigos de recuperación una vez', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TfConfirm')
    const { secret } = await beginTwoFactorSetup(db, env, a.userId)
    expect((await confirmTwoFactorSetup(db, env, a.userId, '000000', T0)).ok).toBe(false)

    const result = await confirmTwoFactorSetup(db, env, a.userId, await totpCode(secret, T0), T0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.recoveryCodes).toHaveLength(10)

    const status = await getTwoFactorStatus(db, env, a.userId)
    expect(status).toMatchObject({ enabled: true, pending: false, recoveryCodesLeft: 10 })
    // Sólo hashes en la base.
    const stored = await db.select().from(schema.userRecoveryCodes).where(eq(schema.userRecoveryCodes.userId, a.userId))
    for (const code of result.recoveryCodes) expect(JSON.stringify(stored)).not.toContain(code)
  })

  it('el código que activó no vale luego para entrar (anti-repetición desde el primer segundo)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TfReplay0')
    const { secret } = await beginTwoFactorSetup(db, env, a.userId)
    const code = await totpCode(secret, T0)
    await confirmTwoFactorSetup(db, env, a.userId, code, T0)
    expect((await checkSecondFactor(db, env, a.userId, code, T0)).ok).toBe(false)
    expect((await checkSecondFactor(db, env, a.userId, await totpCode(secret, T0 + 30_000), T0 + 30_000)).ok).toBe(true)
  })

  it('no se puede volver a empezar el alta sobre una cuenta ya activa', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TfReSetup')
    await enabledAccount(db, a.userId)
    await expect(beginTwoFactorSetup(db, env, a.userId)).rejects.toThrow(/ya está activo/)
  })
})

describe('login con desafío', () => {
  it('desafío + código correcto → ok y consumido; el mismo desafío no vale dos veces', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TfChallenge')
    const { secret } = await enabledAccount(db, a.userId)
    const token = await createLoginChallenge(db, a.userId, T0)
    expect(token).toMatch(/^[0-9a-f]{64}$/)

    const t1 = T0 + 60_000
    const first = await resolveLoginChallenge(db, env, token, await totpCode(secret, t1), t1)
    expect(first).toMatchObject({ ok: true, userId: a.userId, method: 'totp' })
    const again = await resolveLoginChallenge(db, env, token, await totpCode(secret, t1 + 30_000), t1 + 30_000)
    expect(again).toEqual({ ok: false, reason: 'invalid_challenge' })
  })

  it('un desafío caduca a los CHALLENGE_TTL_MINUTES minutos', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TfExpire')
    const { secret } = await enabledAccount(db, a.userId)
    const token = await createLoginChallenge(db, a.userId, T0)
    const late = T0 + (CHALLENGE_TTL_MINUTES + 1) * 60_000
    expect(await resolveLoginChallenge(db, env, token, await totpCode(secret, late), late)).toEqual({ ok: false, reason: 'expired' })
  })

  it('tras CHALLENGE_MAX_ATTEMPTS códigos incorrectos el desafío muere aunque después llegue el bueno', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TfAttempts')
    const { secret } = await enabledAccount(db, a.userId)
    const token = await createLoginChallenge(db, a.userId, T0)
    const t1 = T0 + 60_000
    for (let i = 0; i < CHALLENGE_MAX_ATTEMPTS - 1; i++) {
      expect(await resolveLoginChallenge(db, env, token, '000000', t1)).toEqual({ ok: false, reason: 'wrong_code' })
    }
    expect(await resolveLoginChallenge(db, env, token, '000000', t1)).toEqual({ ok: false, reason: 'too_many_attempts' })
    expect(await resolveLoginChallenge(db, env, token, await totpCode(secret, t1), t1)).toEqual({ ok: false, reason: 'too_many_attempts' })
  })

  it('un token inventado no dice nada distinto de uno caducado o consumido', async () => {
    const { db } = createTestDb()
    await seedTenant(db, 'TfFake')
    expect(await resolveLoginChallenge(db, env, 'no-existe', '123456', T0)).toEqual({ ok: false, reason: 'invalid_challenge' })
  })

  it('un código de recuperación entra una sola vez y descuenta', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TfRecovery')
    const { recoveryCodes } = await enabledAccount(db, a.userId)
    const t1 = T0 + 60_000

    const token = await createLoginChallenge(db, a.userId, t1)
    const res = await resolveLoginChallenge(db, env, token, recoveryCodes[0].toLowerCase(), t1)
    expect(res).toMatchObject({ ok: true, method: 'recovery', recoveryCodesLeft: 9 })

    const token2 = await createLoginChallenge(db, a.userId, t1)
    expect(await resolveLoginChallenge(db, env, token2, recoveryCodes[0], t1)).toEqual({ ok: false, reason: 'wrong_code' })
    expect((await getTwoFactorStatus(db, env, a.userId)).recoveryCodesLeft).toBe(9)
  })
})

describe('desactivación y códigos nuevos', () => {
  it('desactivar borra el secreto y los códigos; regenerar invalida los anteriores', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TfDisable')
    const { recoveryCodes } = await enabledAccount(db, a.userId)

    const fresh = await regenerateRecoveryCodes(db, a.userId)
    expect(fresh).toHaveLength(10)
    expect((await checkSecondFactor(db, env, a.userId, recoveryCodes[1], T0 + 60_000)).ok).toBe(false)
    expect((await checkSecondFactor(db, env, a.userId, fresh[1], T0 + 60_000)).ok).toBe(true)

    await disableTwoFactor(db, a.userId)
    const status = await getTwoFactorStatus(db, env, a.userId)
    expect(status).toMatchObject({ enabled: false, pending: false, recoveryCodesLeft: 0 })
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, a.userId))
    expect(row.totpSecret).toBeNull()
    await expect(regenerateRecoveryCodes(db, a.userId)).rejects.toThrow(/no está activo/)
  })
})
