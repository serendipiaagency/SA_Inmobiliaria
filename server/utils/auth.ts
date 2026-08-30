import { asc, eq, or } from 'drizzle-orm'
import { createError, deleteCookie, getCookie, setCookie, type H3Event } from 'h3'
import { useDb, cfEnv, now, schema } from './db'

const PBKDF2_ITERATIONS = 100_000
const SESSION_COOKIE = 'sa_session'

// --- password hashing (Web Crypto, Workers-compatible) ---------------------

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`
}

const DUMMY_SALT = new Uint8Array(16)

/**
 * Runs a PBKDF2 computation with the same cost as a real verification, without a user
 * to check against. Call this on the "email not found" branch of login so that branch
 * takes the same time as "email found, wrong password" — otherwise the two cases are
 * distinguishable by response latency (user enumeration via timing).
 */
export async function dummyVerify(password: string): Promise<void> {
  await pbkdf2(password, DUMMY_SALT, PBKDF2_ITERATIONS)
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = parseInt(parts[1], 10)
  const salt = fromB64(parts[2])
  const expected = fromB64(parts[3])
  const actual = new Uint8Array(await pbkdf2(password, salt, iterations))
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}

// --- sessions ---------------------------------------------------------------

export interface SessionUser {
  id: number
  name: string
  email: string
  role: string
  /** Null only for 'super_admin', who belongs to no single organization. */
  organizationId: number | null
}

export async function createSession(event: H3Event, userId: number): Promise<void> {
  const db = useDb(event)
  const env = cfEnv(event)
  const ttlDays = parseInt(env.SESSION_TTL_DAYS || '7', 10)
  const token = toB64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, '')
  const expires = new Date(Date.now() + ttlDays * 86_400_000)
  // `id` is an opaque internal identifier, unrelated to the raw token — the
  // token itself is never stored, only its SHA-256 (tokenHash), same
  // pattern as password_reset_tokens.tokenHash/api_keys.keyHash. A D1
  // backup or leak exposes hashes, not reusable session cookies.
  await db.insert(schema.sessions).values({
    id: randomTokenHex(),
    tokenHash: await sha256Hex(token),
    userId,
    expiresAt: expires.toISOString(),
    createdAt: now(),
  })
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires,
  })
}

export async function destroySession(event: H3Event): Promise<void> {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) {
    const db = useDb(event)
    // Matches both a hashed row (the normal case) and a legacy plaintext
    // row that was never rotated (id still equals the raw token) — see
    // getSessionUser()'s rotation comment below.
    const tokenHash = await sha256Hex(token)
    await db.delete(schema.sessions).where(or(eq(schema.sessions.tokenHash, tokenHash), eq(schema.sessions.id, token)))
  }
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const token = getCookie(event, SESSION_COOKIE)
  if (!token) return null
  const db = useDb(event)
  const tokenHash = await sha256Hex(token)
  const rows = await db
    .select({
      sessionId: schema.sessions.id,
      sessionTokenHash: schema.sessions.tokenHash,
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      organizationId: schema.users.organizationId,
      expiresAt: schema.sessions.expiresAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    // `eq(sessions.id, token)` is the legacy path — sessions created before
    // hashing shipped stored the raw token as `id` — kept only so those
    // existing sessions aren't silently logged out; see the rotation below.
    .where(or(eq(schema.sessions.tokenHash, tokenHash), eq(schema.sessions.id, token)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, row.sessionId))
    return null
  }
  if (row.sessionTokenHash == null) {
    // Legacy plaintext session, matched via the `id = token` fallback above
    // — rotate it on this first valid use. Both the hash (previously null)
    // and `id` (previously the raw token itself, in plaintext) become
    // fresh random values, so this row no longer reveals a reusable
    // credential if the database is ever leaked. The client's cookie is
    // untouched — same raw token, re-hashed on every subsequent request.
    await db.update(schema.sessions).set({ id: randomTokenHex(), tokenHash }).where(eq(schema.sessions.id, row.sessionId))
  }
  return { id: row.id, name: row.name, email: row.email, role: row.role, organizationId: row.organizationId }
}

/** Allows both org-scoped admins and the platform super_admin. */
export async function requireAdmin(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthenticated' })
  if (user.role !== 'admin' && user.role !== 'super_admin') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return user
}

/** Any authenticated account, regardless of role — for the client-facing portal, which reads by email match rather than org-admin scope. */
export async function requireUser(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthenticated' })
  return user
}

/** Platform owner only — for managing organizations themselves. */
export async function requireSuperAdmin(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthenticated' })
  if (user.role !== 'super_admin') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return user
}

const ACTIVE_ORG_COOKIE = 'sa_active_org'

/**
 * Resolves which organization's data the current request should see. A
 * super_admin has no fixed org, so they pick one via the org-switcher, which
 * stores its choice in a cookie (like the session cookie, sent automatically
 * on every request including SSR) — any value works since it only changes
 * what they see, never grants access beyond their own already-total
 * visibility. A regular org-scoped admin's org always comes from their own
 * user row and can never be overridden by client-supplied input.
 *
 * `db` is used only for the super_admin/no-cookie fallback below — pass the
 * event's own `useDb(event)`; a lightweight fake is enough in tests.
 */
export async function resolveActiveOrgId(event: H3Event, user: SessionUser, db: any): Promise<number> {
  if (user.role === 'super_admin') {
    const cookie = getCookie(event, ACTIVE_ORG_COOKIE)
    const parsed = Number(cookie)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
    // No cookie (or a garbage one) — NOT a "fail closed" case: a super_admin
    // already has total visibility by role, so which org this particular
    // request happens to default to is a UX question, not a privilege one
    // (unlike a regular admin's organizationId, which really does gate
    // access). A hardcoded fallback id is still wrong though — it could
    // point at a long-deleted organization and silently return nothing for
    // every query — so this resolves the platform's own lowest-id real
    // organization, verified against the DB. This also covers any
    // super_admin API access that never goes through layouts/admin.vue's
    // browser-side org-switcher bootstrap (this project's own e2e suite
    // logs in via a raw POST /api/auth/login and calls admin APIs directly,
    // exactly that case — migrations/0021_multi_tenant_orgs.sql seeds
    // admin@sa-inmobiliaria.com as super_admin).
    const rows = await db.select({ id: schema.organizations.id }).from(schema.organizations).orderBy(asc(schema.organizations.id)).limit(1)
    if (!rows[0]) {
      throw createError({ statusCode: 403, statusMessage: 'No organization exists on this platform yet' })
    }
    return rows[0].id
  }
  if (user.organizationId == null) {
    throw createError({ statusCode: 403, statusMessage: 'User has no organization assigned' })
  }
  return user.organizationId
}

/**
 * Combines requireAdmin + resolveActiveOrgId — the standard guard for
 * org-scoped admin routes.
 *
 * The returned `orgId` is always a concrete tenant, for a super_admin as much
 * as for an org admin: platform-wide access is a separate capability
 * (`requireSuperAdmin`), never a side effect of "no org resolved". Nothing
 * downstream should interpret a super_admin session as permission to query
 * across tenants — `buildTenantWhere()` fails closed rather than dropping the
 * filter if it is ever handed a null org.
 */
export async function requireOrgScope(event: H3Event): Promise<{ user: SessionUser; orgId: number }> {
  const user = await requireAdmin(event)
  const orgId = await resolveActiveOrgId(event, user, useDb(event))
  return { user, orgId }
}

// --- password reset tokens ("recuperación de contraseña" / "alta de usuario") ---

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function randomTokenHex(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const PASSWORD_RESET_TTL_MINUTES = 60

/**
 * Mints a password-reset/set-password token for a user — same underlying
 * flow for "recuperación de contraseña" (an existing user requesting a
 * reset) and "alta de usuario" (a newly created user's welcome email links
 * here to set their first password, rather than ever emailing a plaintext
 * password). Only the SHA-256 hash is stored, same principle as api_keys —
 * the raw token exists only in the email, never at rest.
 */
export async function createPasswordResetToken(db: any, userId: number): Promise<string> {
  const raw = randomTokenHex()
  const tokenHash = await sha256Hex(raw)
  const nowTs = now()
  await db.insert(schema.passwordResetTokens).values({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000).toISOString().replace('T', ' ').slice(0, 19),
    createdAt: nowTs,
  })
  return raw
}

/**
 * Consumes a reset token: valid only if unused and unexpired. Marks it used
 * immediately (never reusable, even if the password update after this call
 * somehow fails) and returns the userId to update, or null if the token is
 * invalid/expired/already used.
 */
export async function consumePasswordResetToken(db: any, rawToken: string): Promise<number | null> {
  const tokenHash = await sha256Hex(rawToken)
  const rows = await db.select().from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.tokenHash, tokenHash)).limit(1)
  const row = rows[0]
  if (!row || row.usedAt) return null
  if (row.expiresAt < now()) return null
  await db.update(schema.passwordResetTokens).set({ usedAt: now() }).where(eq(schema.passwordResetTokens.id, row.id))
  return row.userId
}
