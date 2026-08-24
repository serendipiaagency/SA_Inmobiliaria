import { describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/tenantFixtures'
import { saveChannelCredential, getChannelCredential, deleteChannelCredential, hasChannelCredential, CredentialEncryptionUnavailableError } from '../../server/utils/publication/credentials'

/**
 * Runs against a real in-memory SQLite DB with the project's real migrations
 * applied (same harness the cross-tenant suite uses) so the round trip
 * exercises the real `publication_channel_credentials` table, not a
 * hand-rolled stand-in for it.
 */

const env = { CHANNEL_CREDENTIALS_ENCRYPTION_KEY: 'test-encryption-key-do-not-use-in-prod' }

describe('publication channel credentials — encryption at rest', () => {
  it('round-trips a saved credential back to the original plaintext', async () => {
    const { db } = createTestDb()
    await saveChannelCredential(db, env, { organizationId: 1, channelKey: 'idealista', plaintext: 'super-secret-api-key' })
    const value = await getChannelCredential(db, env, { organizationId: 1, channelKey: 'idealista' })
    expect(value).toBe('super-secret-api-key')
  })

  it('never stores the plaintext value anywhere in the row', async () => {
    const { db, sqlite } = createTestDb()
    await saveChannelCredential(db, env, { organizationId: 1, channelKey: 'fotocasa', plaintext: 'plain-text-secret-xyz' })
    const rows = sqlite.prepare('SELECT * FROM publication_channel_credentials').all()
    expect(JSON.stringify(rows)).not.toContain('plain-text-secret-xyz')
  })

  it('two different channels for the same org get independently decryptable values', async () => {
    const { db } = createTestDb()
    await saveChannelCredential(db, env, { organizationId: 1, channelKey: 'idealista', plaintext: 'idealista-key' })
    await saveChannelCredential(db, env, { organizationId: 1, channelKey: 'fotocasa', plaintext: 'fotocasa-key' })
    expect(await getChannelCredential(db, env, { organizationId: 1, channelKey: 'idealista' })).toBe('idealista-key')
    expect(await getChannelCredential(db, env, { organizationId: 1, channelKey: 'fotocasa' })).toBe('fotocasa-key')
  })

  it('the same channel key for a different organization never sees another org\'s credential', async () => {
    const { db } = createTestDb()
    await saveChannelCredential(db, env, { organizationId: 1, channelKey: 'idealista', plaintext: 'org-1-key' })
    await saveChannelCredential(db, env, { organizationId: 2, channelKey: 'idealista', plaintext: 'org-2-key' })
    expect(await getChannelCredential(db, env, { organizationId: 1, channelKey: 'idealista' })).toBe('org-1-key')
    expect(await getChannelCredential(db, env, { organizationId: 2, channelKey: 'idealista' })).toBe('org-2-key')
  })

  it('returns null for a channel the organization never configured', async () => {
    const { db } = createTestDb()
    expect(await getChannelCredential(db, env, { organizationId: 1, channelKey: 'idealista' })).toBeNull()
  })

  it('throws instead of silently storing plaintext when no encryption key is configured', async () => {
    const { db } = createTestDb()
    await expect(saveChannelCredential(db, {}, { organizationId: 1, channelKey: 'idealista', plaintext: 'x' })).rejects.toBeInstanceOf(
      CredentialEncryptionUnavailableError,
    )
  })

  it('updating an existing credential overwrites it rather than duplicating the row', async () => {
    const { db, sqlite } = createTestDb()
    await saveChannelCredential(db, env, { organizationId: 1, channelKey: 'idealista', plaintext: 'first-value' })
    await saveChannelCredential(db, env, { organizationId: 1, channelKey: 'idealista', plaintext: 'second-value' })
    const rows = sqlite.prepare('SELECT * FROM publication_channel_credentials WHERE organization_id = 1 AND channel_key = ?').all('idealista')
    expect(rows.length).toBe(1)
    expect(await getChannelCredential(db, env, { organizationId: 1, channelKey: 'idealista' })).toBe('second-value')
  })

  it('deleteChannelCredential removes the row and hasChannelCredential reflects it', async () => {
    const { db } = createTestDb()
    await saveChannelCredential(db, env, { organizationId: 1, channelKey: 'idealista', plaintext: 'x' })
    expect(await hasChannelCredential(db, { organizationId: 1, channelKey: 'idealista' })).toBe(true)
    await deleteChannelCredential(db, { organizationId: 1, channelKey: 'idealista' })
    expect(await hasChannelCredential(db, { organizationId: 1, channelKey: 'idealista' })).toBe(false)
  })
})
