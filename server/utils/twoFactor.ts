import { and, eq, isNull, lt } from 'drizzle-orm'
import * as schema from '../db/schema'
import { now } from './db'
import { decryptString, encryptString } from './encryption'
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, normalizeRecoveryCode, otpauthUrl, totpStep, verifyTotp } from './totp'

/**
 * Segundo factor de una cuenta: alta, activación, comprobación en el login,
 * códigos de recuperación y desactivación. Sobre `db` (drizzle) y `env`, sin
 * H3, para que test/unit/twoFactor.test.ts lo ejecute contra la base real de
 * pruebas; los endpoints de server/api/auth/totp/* son envoltorios finos.
 *
 * ## El flujo de login con 2FA
 *
 *   1. /api/auth/login comprueba la contraseña como siempre. Si la cuenta
 *      tiene 2FA activo, en vez de crear la sesión crea un *desafío*
 *      (`login_challenges`): un token aleatorio del que sólo se guarda el
 *      hash, con caducidad de CHALLENGE_TTL_MINUTES y un contador de
 *      intentos. Devuelve el token al cliente. **No hay sesión todavía.**
 *   2. /api/auth/totp/verify recibe el token y un código (TOTP o de
 *      recuperación). Si pasa, consume el desafío y crea la sesión. Si no,
 *      suma un intento; al llegar a CHALLENGE_MAX_ATTEMPTS el desafío muere y
 *      hay que volver a empezar por la contraseña.
 *
 * ## Qué protege de qué
 *
 *  - El secreto TOTP se guarda cifrado con TOTP_ENCRYPTION_KEY. Sin ese
 *    secreto del Worker no se puede activar el 2FA (se dice en Estado del
 *    sistema), y una copia de la base sin él no revela las semillas.
 *  - Un código TOTP sólo vale una vez (`totp_last_used_step`).
 *  - Un código de recuperación sólo vale una vez (`used_at`), y sólo se
 *    guarda su hash.
 *  - Desactivar exige la contraseña actual además de un código válido.
 */

export const CHALLENGE_TTL_MINUTES = 5
export const CHALLENGE_MAX_ATTEMPTS = 5

export class TwoFactorUnavailableError extends Error {
  constructor() {
    super('TOTP_ENCRYPTION_KEY no está configurado en este Worker: no se puede activar el segundo factor')
    this.name = 'TwoFactorUnavailableError'
  }
}

function requireKey(env: Record<string, any> | undefined): string {
  const secret = env?.TOTP_ENCRYPTION_KEY
  if (!secret) throw new TwoFactorUnavailableError()
  return String(secret)
}

export function isTwoFactorAvailable(env: Record<string, any> | undefined): boolean {
  return Boolean(env?.TOTP_ENCRYPTION_KEY)
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19)
}

type UserTotpRow = { id: number; email: string; totpSecret: string | null; totpSecretIv: string | null; totpEnabledAt: string | null; totpLastUsedStep: number | null }

async function loadUser(db: any, userId: number): Promise<UserTotpRow | null> {
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      totpSecret: schema.users.totpSecret,
      totpSecretIv: schema.users.totpSecretIv,
      totpEnabledAt: schema.users.totpEnabledAt,
      totpLastUsedStep: schema.users.totpLastUsedStep,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  return rows[0] ?? null
}

async function decryptSecret(env: Record<string, any> | undefined, user: UserTotpRow): Promise<string | null> {
  if (!user.totpSecret || !user.totpSecretIv) return null
  return decryptString(requireKey(env), { ciphertext: user.totpSecret, iv: user.totpSecretIv })
}

export interface TwoFactorStatus {
  available: boolean
  enabled: boolean
  enabledAt: string | null
  /** Alta empezada (secreto generado) pero no confirmada con un código todavía. */
  pending: boolean
  recoveryCodesLeft: number
}

export async function getTwoFactorStatus(db: any, env: Record<string, any> | undefined, userId: number): Promise<TwoFactorStatus> {
  const user = await loadUser(db, userId)
  const enabled = Boolean(user?.totpEnabledAt)
  let recoveryCodesLeft = 0
  if (enabled) {
    const rows = await db
      .select({ id: schema.userRecoveryCodes.id })
      .from(schema.userRecoveryCodes)
      .where(and(eq(schema.userRecoveryCodes.userId, userId), isNull(schema.userRecoveryCodes.usedAt)))
    recoveryCodesLeft = rows.length
  }
  return {
    available: isTwoFactorAvailable(env),
    enabled,
    enabledAt: user?.totpEnabledAt ?? null,
    pending: Boolean(user?.totpSecret) && !enabled,
    recoveryCodesLeft,
  }
}

/**
 * Paso 1 del alta: genera un secreto nuevo y lo guarda cifrado SIN activar.
 * Devuelve lo que la app de autenticación necesita. Repetirlo sustituye el
 * secreto pendiente; sobre una cuenta ya activa se niega (hay que
 * desactivar primero, con contraseña y código).
 */
export async function beginTwoFactorSetup(db: any, env: Record<string, any> | undefined, userId: number): Promise<{ secret: string; otpauthUrl: string }> {
  const key = requireKey(env)
  const user = await loadUser(db, userId)
  if (!user) throw new Error('Usuario no encontrado')
  if (user.totpEnabledAt) throw new Error('El segundo factor ya está activo en esta cuenta')
  const secret = generateTotpSecret()
  const encrypted = await encryptString(key, secret)
  await db
    .update(schema.users)
    .set({ totpSecret: encrypted.ciphertext, totpSecretIv: encrypted.iv, totpEnabledAt: null, totpLastUsedStep: null, updatedAt: now() })
    .where(eq(schema.users.id, userId))
  return { secret, otpauthUrl: otpauthUrl(secret, user.email) }
}

async function issueRecoveryCodes(db: any, userId: number): Promise<string[]> {
  await db.delete(schema.userRecoveryCodes).where(eq(schema.userRecoveryCodes.userId, userId))
  const codes = generateRecoveryCodes()
  const ts = now()
  for (const code of codes) {
    await db.insert(schema.userRecoveryCodes).values({ userId, codeHash: await hashRecoveryCode(code), createdAt: ts })
  }
  return codes
}

/**
 * Paso 2 del alta: el primer código correcto de la app confirma que la
 * persona tiene el secreto bien cargado, y sólo entonces se activa. Devuelve
 * los códigos de recuperación — la única vez que existen en claro.
 */
export async function confirmTwoFactorSetup(
  db: any,
  env: Record<string, any> | undefined,
  userId: number,
  code: string,
  nowMs = Date.now(),
): Promise<{ ok: false } | { ok: true; recoveryCodes: string[] }> {
  const user = await loadUser(db, userId)
  if (!user || user.totpEnabledAt) return { ok: false }
  const secret = await decryptSecret(env, user)
  if (!secret) return { ok: false }
  const result = await verifyTotp(secret, code, nowMs)
  if (!result.ok) return { ok: false }
  await db.update(schema.users).set({ totpEnabledAt: now(), totpLastUsedStep: result.step, updatedAt: now() }).where(eq(schema.users.id, userId))
  const recoveryCodes = await issueRecoveryCodes(db, userId)
  return { ok: true, recoveryCodes }
}

export type SecondFactorOutcome = { ok: true; method: 'totp' | 'recovery'; recoveryCodesLeft?: number } | { ok: false }

/**
 * Comprueba un código contra una cuenta con 2FA activo: primero como TOTP
 * (con anti-repetición) y, si no tiene forma de TOTP, como código de
 * recuperación (que se consume). Es lo que usan el login y la desactivación.
 */
export async function checkSecondFactor(db: any, env: Record<string, any> | undefined, userId: number, code: string, nowMs = Date.now()): Promise<SecondFactorOutcome> {
  const user = await loadUser(db, userId)
  if (!user || !user.totpEnabledAt) return { ok: false }
  const trimmed = String(code || '').replace(/\s+/g, '')

  if (/^\d{6}$/.test(trimmed)) {
    const secret = await decryptSecret(env, user)
    if (!secret) return { ok: false }
    const result = await verifyTotp(secret, trimmed, nowMs, { lastUsedStep: user.totpLastUsedStep })
    if (!result.ok) return { ok: false }
    await db.update(schema.users).set({ totpLastUsedStep: result.step }).where(eq(schema.users.id, userId))
    return { ok: true, method: 'totp' }
  }

  const normalized = normalizeRecoveryCode(trimmed)
  if (normalized.length !== 10) return { ok: false }
  const codeHash = await hashRecoveryCode(normalized)
  const rows = await db
    .select({ id: schema.userRecoveryCodes.id })
    .from(schema.userRecoveryCodes)
    .where(and(eq(schema.userRecoveryCodes.userId, userId), eq(schema.userRecoveryCodes.codeHash, codeHash), isNull(schema.userRecoveryCodes.usedAt)))
    .limit(1)
  if (!rows[0]) return { ok: false }
  await db.update(schema.userRecoveryCodes).set({ usedAt: now() }).where(eq(schema.userRecoveryCodes.id, rows[0].id))
  const left = await db
    .select({ id: schema.userRecoveryCodes.id })
    .from(schema.userRecoveryCodes)
    .where(and(eq(schema.userRecoveryCodes.userId, userId), isNull(schema.userRecoveryCodes.usedAt)))
  return { ok: true, method: 'recovery', recoveryCodesLeft: left.length }
}

/** Quita el segundo factor y borra los códigos de recuperación. El endpoint exige antes contraseña y código. */
export async function disableTwoFactor(db: any, userId: number): Promise<void> {
  await db
    .update(schema.users)
    .set({ totpSecret: null, totpSecretIv: null, totpEnabledAt: null, totpLastUsedStep: null, updatedAt: now() })
    .where(eq(schema.users.id, userId))
  await db.delete(schema.userRecoveryCodes).where(eq(schema.userRecoveryCodes.userId, userId))
}

/** Códigos de recuperación nuevos; los anteriores dejan de valer. */
export async function regenerateRecoveryCodes(db: any, userId: number): Promise<string[]> {
  const user = await loadUser(db, userId)
  if (!user?.totpEnabledAt) throw new Error('El segundo factor no está activo')
  return issueRecoveryCodes(db, userId)
}

// --- desafíos de login -------------------------------------------------------

/** Contraseña correcta, segundo factor pendiente: crea el desafío y devuelve el token (sólo se guarda su hash). */
export async function createLoginChallenge(db: any, userId: number, nowMs = Date.now()): Promise<string> {
  const token = randomHex(32)
  await db.insert(schema.loginChallenges).values({
    userId,
    tokenHash: await sha256Hex(token),
    expiresAt: stamp(nowMs + CHALLENGE_TTL_MINUTES * 60_000),
    attempts: 0,
    createdAt: stamp(nowMs),
  })
  return token
}

export type ChallengeResult = { ok: true; userId: number; method: 'totp' | 'recovery'; recoveryCodesLeft?: number } | { ok: false; reason: 'invalid_challenge' | 'expired' | 'too_many_attempts' | 'wrong_code' }

/**
 * Resuelve un desafío con un código. Consume el desafío si pasa; si no,
 * cuenta el intento. Un desafío caducado, consumido o agotado vale lo mismo
 * que uno inventado: hay que volver a la contraseña.
 */
export async function resolveLoginChallenge(db: any, env: Record<string, any> | undefined, token: string, code: string, nowMs = Date.now()): Promise<ChallengeResult> {
  if (!token) return { ok: false, reason: 'invalid_challenge' }
  const rows = await db
    .select()
    .from(schema.loginChallenges)
    .where(eq(schema.loginChallenges.tokenHash, await sha256Hex(token)))
    .limit(1)
  const challenge = rows[0]
  if (!challenge || challenge.consumedAt) return { ok: false, reason: 'invalid_challenge' }
  if (challenge.expiresAt <= stamp(nowMs)) return { ok: false, reason: 'expired' }
  if (challenge.attempts >= CHALLENGE_MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' }

  const outcome = await checkSecondFactor(db, env, challenge.userId, code, nowMs)
  if (!outcome.ok) {
    await db.update(schema.loginChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(schema.loginChallenges.id, challenge.id))
    return { ok: false, reason: challenge.attempts + 1 >= CHALLENGE_MAX_ATTEMPTS ? 'too_many_attempts' : 'wrong_code' }
  }
  await db.update(schema.loginChallenges).set({ consumedAt: stamp(nowMs) }).where(eq(schema.loginChallenges.id, challenge.id))
  return { ok: true, userId: challenge.userId, method: outcome.method, recoveryCodesLeft: outcome.recoveryCodesLeft }
}

/** Limpieza oportunista: desafíos caducados hace más de un día. */
export async function pruneLoginChallenges(db: any, nowMs = Date.now()): Promise<number> {
  const deleted = await db.delete(schema.loginChallenges).where(lt(schema.loginChallenges.expiresAt, stamp(nowMs - 86_400_000))).returning({ id: schema.loginChallenges.id })
  return deleted.length
}

export { totpStep }
