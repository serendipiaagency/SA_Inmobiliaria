import { requireOrgScope } from '../../../utils/auth'
import { now } from '../../../utils/db'

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function randomHex(bytes: number): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Generate a new API key. Returns the plaintext key once — only the hash is stored. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const body = await readBody<{ name?: string; environment?: string; scopes?: string }>(event)

  const name = (body?.name || '').trim().slice(0, 80) || 'Clave sin nombre'
  const environment = body?.environment === 'test' ? 'test' : 'live'
  const scopes = body?.scopes === 'write' ? 'read,write' : 'read'

  const secret = randomHex(24)
  const plainKey = `sa_${environment}_${secret}`
  const prefix = plainKey.slice(0, 14)
  const keyHash = await sha256Hex(plainKey)
  const createdAt = now()

  const result = await raw
    .prepare(
      `INSERT INTO api_keys (organization_id, name, prefix, key_hash, scopes, environment, revoked, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)`,
    )
    .bind(orgId, name, prefix, keyHash, scopes, environment, createdAt)
    .run()

  return {
    id: result.meta.last_row_id,
    name,
    prefix,
    environment,
    scopes,
    createdAt,
    plainKey,
  }
})
