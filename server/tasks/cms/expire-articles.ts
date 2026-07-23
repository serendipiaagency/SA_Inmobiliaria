import { and, eq, isNull, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'
import { now } from '../../utils/db'

/**
 * Runs hourly (see nuxt.config.ts scheduledTasks + wrangler.toml [triggers]).
 * Auto-hides published articles past their expires_at — across every
 * organization, since a platform-level Cron Trigger has no single tenant's
 * request context to scope to.
 */
export default defineTask({
  meta: {
    name: 'cms:expire-articles',
    description: 'Hides published Blog & CMS articles past their expiration date',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })

    const nowTs = now()
    const A = schema.cmsArticles
    const expired = await db
      .select({ id: A.id, organizationId: A.organizationId })
      .from(A)
      .where(and(eq(A.status, 'published'), isNull(A.deletedAt), lt(A.expiresAt, nowTs)))

    for (const row of expired) {
      await db.update(A).set({ status: 'draft', updatedAt: nowTs }).where(eq(A.id, row.id))
    }

    return { result: { expiredCount: expired.length } }
  },
})
