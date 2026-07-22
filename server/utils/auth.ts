import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
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
  await db.insert(schema.sessions).values({
    id: token,
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
    await db.delete(schema.sessions).where(eq(schema.sessions.id, token))
  }
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const token = getCookie(event, SESSION_COOKIE)
  if (!token) return null
  const db = useDb(event)
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      organizationId: schema.users.organizationId,
      expiresAt: schema.sessions.expiresAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.id, token))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, token))
    return null
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
 */
export function resolveActiveOrgId(event: H3Event, user: SessionUser): number {
  if (user.role === 'super_admin') {
    const cookie = getCookie(event, ACTIVE_ORG_COOKIE)
    const parsed = Number(cookie)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
  }
  if (user.organizationId == null) {
    throw createError({ statusCode: 403, statusMessage: 'User has no organization assigned' })
  }
  return user.organizationId
}

/** Combines requireAdmin + resolveActiveOrgId — the standard guard for org-scoped admin routes. */
export async function requireOrgScope(event: H3Event): Promise<{ user: SessionUser; orgId: number }> {
  const user = await requireAdmin(event)
  const orgId = resolveActiveOrgId(event, user)
  return { user, orgId }
}
