import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'
import { decryptString, encryptString } from '../encryption'

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

// El cifrado en sí (AES-GCM, clave derivada por SHA-256, IV por valor) vive
// en server/utils/encryption.ts, compartido con el secreto TOTP del 2FA.
export class CredentialEncryptionUnavailableError extends Error {
  constructor() {
    super('CHANNEL_CREDENTIALS_ENCRYPTION_KEY no está configurado en este Worker')
    this.name = 'CredentialEncryptionUnavailableError'
  }
}

async function encrypt(env: Record<string, any>, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const secret = env?.CHANNEL_CREDENTIALS_ENCRYPTION_KEY
  if (!secret) throw new CredentialEncryptionUnavailableError()
  return encryptString(secret, plaintext)
}

async function decrypt(env: Record<string, any>, ciphertext: string, iv: string): Promise<string> {
  const secret = env?.CHANNEL_CREDENTIALS_ENCRYPTION_KEY
  if (!secret) throw new CredentialEncryptionUnavailableError()
  return decryptString(secret, { ciphertext, iv })
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
