import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from './db'

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Validates a Bearer API key (minted via /admin/api — server/api/admin/saas/apikeys.post.ts,
 * same sha256(plaintext) scheme) for the public API (Fase 16). Every key
 * this project has ever issued could be checked in but never actually
 * validated anywhere until this — see server/api/v1/scheduler/*.
 */
export async function requireApiKey(event: H3Event, requiredScope: 'read' | 'write' = 'read'): Promise<{ orgId: number; keyId: number; scopes: string }> {
  const header = getRequestHeader(event, 'authorization') || ''
  const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : getRequestHeader(event, 'x-api-key')
  if (!raw) throw createError({ statusCode: 401, statusMessage: 'Missing API key (Authorization: Bearer <key>)' })

  const keyHash = await sha256Hex(raw)
  const db = useDb(event)
  const rows = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.keyHash, keyHash)).limit(1)
  const key = rows[0]
  if (!key || key.revoked) throw createError({ statusCode: 401, statusMessage: 'Invalid or revoked API key' })

  const scopes = key.scopes.split(',').map((s) => s.trim())
  if (!scopes.includes(requiredScope)) throw createError({ statusCode: 403, statusMessage: `This key doesn't have the "${requiredScope}" scope` })

  await db.update(schema.apiKeys).set({ lastUsedAt: now() }).where(eq(schema.apiKeys.id, key.id))
  return { orgId: key.organizationId, keyId: key.id, scopes: key.scopes }
}
