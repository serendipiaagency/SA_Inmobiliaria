/**
 * Streaming D1 backup logic for server/tasks/system/backup-d1.ts — split
 * out into a plain utility module (no Nitro `defineTask` auto-import) so it
 * can be imported and driven directly in tests, same pattern as
 * attemptSend()/attemptWebhookDelivery() living in server/utils/** rather
 * than inside their task files.
 */

/** Plain snake_case SQLite identifiers only — the shape every real table in this schema has. */
export function isSafeIdentifier(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(name)
}

/**
 * Streams `{"takenAt":"...","tables":{"table1":[row,row,...],"table2":[...]}}`
 * one chunk at a time — never holds more than one page of one table's rows
 * in memory at once. Each table is read PAGE_SIZE rows at a time,
 * keyset-paginated on SQLite's own `rowid` (present on every table in this
 * schema — none is declared WITHOUT ROWID, verified across every migration
 * file), rather than one unpaginated `SELECT *` per table accumulated into
 * a single in-memory object before one big JSON.stringify() + gzip pass.
 * That worked at this project's current data volume but doesn't scale: it
 * risks the Worker's own memory limit once total data grows, and D1 itself
 * caps how much a single unpaginated query can return before it fails
 * outright — a scalability problem, not just a performance one
 * (docs/production-hardening-audit.md, P1-5).
 */
export function buildBackupStream(db: D1Database, tables: string[], pageSize: number, stats: { totalRows: number }): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(`{"takenAt":${JSON.stringify(new Date().toISOString())},"tables":{`))
        for (let t = 0; t < tables.length; t++) {
          const table = tables[t]
          // Table names come from sqlite_master (the DB's own schema), never
          // from user input — but this is the one place in the codebase
          // that interpolates an identifier into raw SQL, so it still gets
          // an explicit allow-list check rather than trusting the source alone.
          if (!isSafeIdentifier(table)) throw new Error(`Refusing to back up table with unexpected name: ${table}`)
          if (t > 0) controller.enqueue(encoder.encode(','))
          controller.enqueue(encoder.encode(`${JSON.stringify(table)}:[`))

          let cursor = 0
          let rowInTable = 0
          while (true) {
            const page = await db
              .prepare(`SELECT rowid AS __backup_cursor, * FROM "${table}" WHERE rowid > ? ORDER BY rowid LIMIT ?`)
              .bind(cursor, pageSize)
              .all<Record<string, unknown>>()
            const rows = page.results
            if (!rows.length) break
            for (const row of rows) {
              const { __backup_cursor, ...rest } = row
              if (rowInTable > 0) controller.enqueue(encoder.encode(','))
              controller.enqueue(encoder.encode(JSON.stringify(rest)))
              rowInTable++
              stats.totalRows++
              cursor = __backup_cursor as number
            }
            if (rows.length < pageSize) break
          }
          controller.enqueue(encoder.encode(']'))
        }
        controller.enqueue(encoder.encode('}}'))
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

export async function pruneOldBackups(bucket: R2Bucket, prefix: string, retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000)
  const listed = await bucket.list({ prefix })
  let deleted = 0
  for (const obj of listed.objects) {
    if (obj.uploaded < cutoff) {
      await bucket.delete(obj.key)
      deleted++
    }
  }
  return deleted
}
