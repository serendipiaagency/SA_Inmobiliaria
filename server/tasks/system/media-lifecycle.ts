import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'

/**
 * Runs daily at 05:00 UTC (see nuxt.config.ts scheduledTasks + wrangler.toml
 * [triggers]). Two jobs, both on `media_assets`:
 *
 *  1. PURGE — a soft-deleted asset (`deleted_at` set) keeps its R2 object
 *     around for a 30-day grace period (long enough to outlast normal
 *     Papelera cleanup habits, short enough to actually reclaim storage),
 *     then gets deleted for real and marked `purged_at`. R2's delete is a
 *     no-op on an already-missing key, so this is safe to run even for
 *     assets whose object was removed synchronously elsewhere (the catalog
 *     fragment cleanup, a hard CMS-media delete) — it just records the
 *     purge instead of duplicating work.
 *
 *  2. RECONCILE — recomputes `organizations.storage_bytes_used` from the
 *     real sum of non-deleted `media_assets` rows, per tenant. The counter
 *     is kept in step by every write path (`registerMediaAsset`,
 *     `softDeleteMediaAsset`), but R2 and D1 are two different systems with
 *     no shared transaction — this is the backstop for whatever drifts
 *     between them (a `MEDIA.put()` that lands right before its D1 write
 *     fails, a manual data fix). "Reconciliable", not "provably atomic".
 */

const GRACE_PERIOD_DAYS = 30

function fmt(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

export default defineTask({
  meta: {
    name: 'system:media-lifecycle',
    description: 'Purges soft-deleted media past its grace period and reconciles per-tenant storage usage',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB || !env?.MEDIA) {
      return { result: { skipped: true, reason: 'No DB/MEDIA binding in task context', purged: 0, failed: 0, pendingBacklog: false, reconciledOrgs: 0 } }
    }
    const db = drizzle(env.DB as D1Database, { schema })
    const bucket = env.MEDIA as R2Bucket

    const cutoff = fmt(new Date(Date.now() - GRACE_PERIOD_DAYS * 86_400_000))
    const A = schema.mediaAssets
    const due = await db
      .select({ id: A.id, r2Key: A.r2Key })
      .from(A)
      .where(and(sql`${A.deletedAt} is not null`, isNull(A.purgedAt), lt(A.deletedAt, cutoff)))
      .limit(500) // bounded per run — a backlog just gets picked up again tomorrow, never blocks the tick

    let purged = 0
    let failed = 0
    for (const row of due) {
      try {
        await bucket.delete(row.r2Key)
        await db.update(A).set({ purgedAt: fmt(new Date()) }).where(eq(A.id, row.id))
        purged++
      } catch (err) {
        console.error(`media-lifecycle: failed to purge media_asset ${row.id} (${row.r2Key})`, err)
        failed++
      }
    }

    const orgs = await db.select({ id: schema.organizations.id }).from(schema.organizations)
    let reconciled = 0
    for (const org of orgs) {
      const rows = await db
        .select({ total: sql<number>`coalesce(sum(${A.sizeBytes}), 0)` })
        .from(A)
        .where(and(eq(A.organizationId, org.id), isNull(A.deletedAt)))
      await db.update(schema.organizations).set({ storageBytesUsed: rows[0]?.total ?? 0 }).where(eq(schema.organizations.id, org.id))
      reconciled++
    }

    return { result: { skipped: false, reason: '', purged, failed, pendingBacklog: due.length === 500, reconciledOrgs: reconciled } }
  },
})
