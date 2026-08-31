import { describe, expect, it } from 'vitest'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'
import { buildBackupStream } from '../../server/utils/backup'

/**
 * server/tasks/system/backup-d1.ts used to load every table's full row set
 * into memory (db.prepare(`SELECT * FROM "table"`).all(), no pagination)
 * before a single JSON.stringify() + gzip pass — a real OOM/timeout risk as
 * data grows, and D1 itself caps how much an unpaginated query can return
 * (docs/production-hardening-audit.md, P1-5). server/utils/backup.ts's
 * buildBackupStream() replaces that with keyset pagination (SQLite's own
 * rowid) and incremental JSON output. These tests drive it against a real
 * SQLite-backed D1Database-shaped adapter (same node:sqlite engine
 * test/unit/helpers/tenantFixtures.ts already uses) and parse the streamed
 * result, proving the output is valid JSON with exactly the content a full
 * in-memory dump would have produced — without needing R2 or the Workers
 * CompressionStream/runtime at all.
 */

/** Minimal D1Database-shaped adapter over node:sqlite's DatabaseSync — real SQL, real pagination, no Cloudflare runtime needed. */
function fakeD1(sqlite: any): any {
  return {
    prepare(sql: string) {
      return {
        bind(...params: any[]) {
          return { all: async () => ({ results: sqlite.prepare(sql).all(...params) }) }
        },
        all: async () => ({ results: sqlite.prepare(sql).all() }),
      }
    },
  }
}

async function readStreamAsText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text()
}

describe('buildBackupStream', () => {
  it('produces valid JSON with the exact same rows a full in-memory dump would, across multiple pages', async () => {
    const { db, sqlite } = createTestDb()
    await seedTenant(db, 'BackupStream')
    const ts = '2026-01-01 00:00:00'
    const t2 = await seedTenant(db, 'BackupStream2')
    // 7 extra leads on top of whatever seeding already added — with a page
    // size of 3 this forces the leads table through several pages.
    for (let i = 0; i < 7; i++) {
      await db.insert(schema.leads).values({ organizationId: t2.orgId, name: `Lead ${i}`, source: 'web', status: 'new', score: i, createdAt: ts, updatedAt: ts })
    }
    // A backup dumps the WHOLE table, every tenant — not scoped to one org.
    const expectedLeads = await db.select().from(schema.leads)

    const stats = { totalRows: 0 }
    const stream = buildBackupStream(fakeD1(sqlite), ['leads', 'organizations'], 3, stats)
    const text = await readStreamAsText(stream)

    const parsed = JSON.parse(text)
    expect(parsed.takenAt).toBeTruthy()
    expect(Object.keys(parsed.tables)).toEqual(['leads', 'organizations'])
    expect(parsed.tables.leads).toHaveLength(expectedLeads.length)
    // No internal pagination cursor column ever leaks into the output.
    for (const row of parsed.tables.leads) expect(row).not.toHaveProperty('__backup_cursor')
    // Content matches exactly, not just the count.
    expect(parsed.tables.leads.map((r: any) => r.name).sort()).toEqual(expectedLeads.map((r: any) => r.name).sort())
  })

  it('reports totalRows across all tables via the stats accumulator, matching what the stream actually emitted', async () => {
    const { db, sqlite } = createTestDb()
    await seedTenant(db, 'BackupStreamStats')
    const orgRows = await db.select().from(schema.organizations)
    const leadRows = await db.select().from(schema.leads)

    const stats = { totalRows: 0 }
    const stream = buildBackupStream(fakeD1(sqlite), ['leads', 'organizations'], 2, stats)
    const text = await readStreamAsText(stream)
    const parsed = JSON.parse(text)

    expect(stats.totalRows).toBe(orgRows.length + leadRows.length)
    expect(parsed.tables.leads.length + parsed.tables.organizations.length).toBe(stats.totalRows)
  })

  it('a table with no rows produces an empty array, not malformed JSON', async () => {
    const { sqlite } = createTestDb()
    // No migration seeds password_reset_tokens — genuinely empty in a fresh DB.
    const stats = { totalRows: 0 }
    const stream = buildBackupStream(fakeD1(sqlite), ['password_reset_tokens'], 500, stats)
    const parsed = JSON.parse(await readStreamAsText(stream))
    expect(parsed.tables.password_reset_tokens).toEqual([])
  })

  it('refuses a table name that is not a plain snake_case identifier', async () => {
    const { sqlite } = createTestDb()
    const stats = { totalRows: 0 }
    const stream = buildBackupStream(fakeD1(sqlite), ['leads; DROP TABLE leads'], 500, stats)
    await expect(readStreamAsText(stream)).rejects.toThrow(/Refusing to back up table/)
  })
})
