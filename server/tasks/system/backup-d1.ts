import { buildBackupStream, pruneOldBackups } from '../../utils/backup'

/**
 * Runs daily at 03:30 UTC (see nuxt.config.ts scheduledTasks + wrangler.toml
 * [triggers]). D1 has its own point-in-time recovery (Time Travel, 30 days
 * on paid plans), but that only helps from inside the Cloudflare dashboard/
 * wrangler CLI, and only within its retention window — this is a second,
 * independent copy that a human can actually open (plain JSON), stored in
 * this project's own R2 bucket, kept for RETENTION_DAYS.
 *
 * Dumps every real table (skips sqlite_* and d1_migrations) as one gzip'd
 * JSON object `{ takenAt, tables: { [tableName]: rows[] } }` per snapshot,
 * built and uploaded as a stream via server/utils/backup.ts's
 * buildBackupStream() — see that file for why (P1-5, scalable backups).
 */

const RETENTION_DAYS = 14
const BACKUP_PREFIX = 'backups/'
// Small enough to comfortably stay under D1's per-query result-size limit
// for any table's widest realistic row shape, large enough that even a
// large table backs up in a reasonable number of round trips.
const PAGE_SIZE = 500

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

    const stats = { totalRows: 0 }
    const jsonStream = buildBackupStream(db, tables, PAGE_SIZE, stats)
    // TS's DOM lib types CompressionStream.writable as WritableStream<BufferSource>,
    // which its own stricter typed-array generics (Uint8Array<ArrayBuffer> vs
    // <ArrayBufferLike>) then refuse to match against pipeThrough's expected
    // ReadableWritablePair — a real chunk (Uint8Array) flows through fine at
    // runtime, this is purely the standard library's own generic variance.
    const compressedStream = jsonStream.pipeThrough(new CompressionStream('gzip') as any)

    const day = new Date().toISOString().slice(0, 10)
    const key = `${BACKUP_PREFIX}${day}.json.gz`
    const uploaded = await bucket.put(key, compressedStream, { httpMetadata: { contentType: 'application/gzip' } })

    const deleted = await pruneOldBackups(bucket, BACKUP_PREFIX, RETENTION_DAYS)

    return { result: { tables: tables.length, totalRows: stats.totalRows, key, sizeBytes: uploaded?.size ?? 0, deletedOldBackups: deleted } }
  },
})
