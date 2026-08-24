/**
 * Runs daily at 03:30 UTC (see nuxt.config.ts scheduledTasks + wrangler.toml
 * [triggers]). D1 has its own point-in-time recovery (Time Travel, 30 days
 * on paid plans), but that only helps from inside the Cloudflare dashboard/
 * wrangler CLI, and only within its retention window — this is a second,
 * independent copy that a human can actually open (plain JSON), stored in
 * this project's own R2 bucket, kept for RETENTION_DAYS.
 *
 * Dumps every real table (skips sqlite_* and d1_migrations) as one gzip'd
 * JSON object `{ [tableName]: rows[] }` per snapshot — small enough for this
 * project's current data volume that a single object per day is simpler and
 * more useful than sharding per table, and still cheap: R2 has no egress
 * fees and the object is compressed.
 */

const RETENTION_DAYS = 14
const BACKUP_PREFIX = 'backups/'

export default defineTask<
  { skipped: true; reason: string } | { tables: number; totalRows: number; key: string; sizeBytes: number; deletedOldBackups: number }
>({
  meta: {
    name: 'system:backup-d1',
    description: 'Daily JSON snapshot of every D1 table, gzip-compressed, stored in R2',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB || !env?.MEDIA) return { result: { skipped: true, reason: 'No DB/MEDIA binding in task context' } }
    const db = env.DB as D1Database
    const bucket = env.MEDIA as R2Bucket

    const tableRows = await db
      .prepare(
        // _cf_% are D1-internal bookkeeping tables (e.g. _cf_METADATA) —
        // querying them throws "access... is prohibited: SQLITE_AUTH",
        // found by actually running this against local D1, not assumed.
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name",
      )
      .all<{ name: string }>()
    const tables = tableRows.results.map((r) => r.name)

    const dump: Record<string, unknown[]> = {}
    let totalRows = 0
    for (const table of tables) {
      // Table names come from sqlite_master (the DB's own schema), never
      // from user input — but this loop is the one place in the codebase
      // that interpolates an identifier into raw SQL, so it still gets an
      // explicit allow-list check rather than trusting the source alone.
      if (!isSafeIdentifier(table)) throw new Error(`Refusing to back up table with unexpected name: ${table}`)
      const rows = await db.prepare(`SELECT * FROM "${table}"`).all()
      dump[table] = rows.results
      totalRows += rows.results.length
    }

    const json = JSON.stringify({ takenAt: new Date().toISOString(), tables: dump })
    const compressed = await gzip(json)

    const day = new Date().toISOString().slice(0, 10)
    const key = `${BACKUP_PREFIX}${day}.json.gz`
    await bucket.put(key, compressed, { httpMetadata: { contentType: 'application/gzip' } })

    const deleted = await pruneOldBackups(bucket)

    return { result: { tables: tables.length, totalRows, key, sizeBytes: compressed.byteLength, deletedOldBackups: deleted } }
  },
})

/** Plain snake_case SQLite identifiers only — the shape every real table in this schema has. */
function isSafeIdentifier(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(name)
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

async function pruneOldBackups(bucket: R2Bucket): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000)
  const listed = await bucket.list({ prefix: BACKUP_PREFIX })
  let deleted = 0
  for (const obj of listed.objects) {
    if (obj.uploaded < cutoff) {
      await bucket.delete(obj.key)
      deleted++
    }
  }
  return deleted
}
