import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'

/**
 * Per-organization channel credentials, encrypted at rest with AES-GCM.
 * Nothing reads or writes this table from a real adapter yet (none exist —
 * see adapters/registry.ts), but the storage itself is real: when an
 * organization needs to connect its own portal account instead of sharing
 * the Worker-wide secret in channels.ts `secretEnvVar`, this is where it
 * goes, and it never touches D1 as plaintext.
 *
 * The key is derived from the Worker secret CHANNEL_CREDENTIALS_ENCRYPTION_KEY
 * (set with `wrangler secret put`, same as every other channel secret — see
 * docs/publication-channels.md) via SHA-256, giving AES-GCM a fixed-length
 * 256-bit key regardless of the secret's own length. `keyVersion` exists so
 * that key rotation is possible later without a data migration: re-encrypt
 * each row with the new key and bump its version, old rows keep decrypting
 * with the version they were written under until they're rotated too.
 */

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}
// Typed as BufferSource (not just Uint8Array) at the return site: TS's DOM
// lib types crypto.subtle.decrypt's params against ArrayBuffer specifically,
// and a bare `Uint8Array<ArrayBufferLike>` return doesn't narrow to that on
// its own — this Uint8Array is always backed by a real, non-shared
// ArrayBuffer (constructed fresh above), so the assertion is safe.
function fromBase64(b64: string): BufferSource {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export class CredentialEncryptionUnavailableError extends Error {
  constructor() {
    super('CHANNEL_CREDENTIALS_ENCRYPTION_KEY no está configurado en este Worker')
    this.name = 'CredentialEncryptionUnavailableError'
  }
}

async function encrypt(env: Record<string, any>, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const secret = env?.CHANNEL_CREDENTIALS_ENCRYPTION_KEY
  if (!secret) throw new CredentialEncryptionUnavailableError()
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) }
}

async function decrypt(env: Record<string, any>, ciphertext: string, iv: string): Promise<string> {
  const secret = env?.CHANNEL_CREDENTIALS_ENCRYPTION_KEY
  if (!secret) throw new CredentialEncryptionUnavailableError()
  const key = await deriveKey(secret)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(ciphertext))
  return new TextDecoder().decode(decrypted)
}

export async function saveChannelCredential(
  db: any,
  env: Record<string, any>,
  input: { organizationId: number; channelKey: string; plaintext: string; userId?: number | null },
): Promise<void> {
  const { ciphertext, iv } = await encrypt(env, input.plaintext)
  const nowTs = now()
  const existing = await db
    .select({ id: schema.publicationChannelCredentials.id })
    .from(schema.publicationChannelCredentials)
    .where(and(eq(schema.publicationChannelCredentials.organizationId, input.organizationId), eq(schema.publicationChannelCredentials.channelKey, input.channelKey)))
    .limit(1)
  if (existing[0]) {
    await db
      .update(schema.publicationChannelCredentials)
      .set({ ciphertext, iv, keyVersion: 1, updatedAt: nowTs })
      .where(eq(schema.publicationChannelCredentials.id, existing[0].id))
  } else {
    await db.insert(schema.publicationChannelCredentials).values({
      organizationId: input.organizationId,
      channelKey: input.channelKey,
      ciphertext,
      iv,
      keyVersion: 1,
      createdBy: input.userId ?? null,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
  }
}

/** Returns the decrypted credential, or null if the org never configured one for this channel. */
export async function getChannelCredential(db: any, env: Record<string, any>, input: { organizationId: number; channelKey: string }): Promise<string | null> {
  const rows = await db
    .select()
    .from(schema.publicationChannelCredentials)
    .where(and(eq(schema.publicationChannelCredentials.organizationId, input.organizationId), eq(schema.publicationChannelCredentials.channelKey, input.channelKey)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return decrypt(env, row.ciphertext, row.iv)
}

export async function deleteChannelCredential(db: any, input: { organizationId: number; channelKey: string }): Promise<void> {
  await db
    .delete(schema.publicationChannelCredentials)
    .where(and(eq(schema.publicationChannelCredentials.organizationId, input.organizationId), eq(schema.publicationChannelCredentials.channelKey, input.channelKey)))
}

export async function hasChannelCredential(db: any, input: { organizationId: number; channelKey: string }): Promise<boolean> {
  const rows = await db
    .select({ id: schema.publicationChannelCredentials.id })
    .from(schema.publicationChannelCredentials)
    .where(and(eq(schema.publicationChannelCredentials.organizationId, input.organizationId), eq(schema.publicationChannelCredentials.channelKey, input.channelKey)))
    .limit(1)
  return !!rows[0]
}
