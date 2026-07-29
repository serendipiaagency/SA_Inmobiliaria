import { lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'

/**
 * Runs hourly (see nuxt.config.ts scheduledTasks + wrangler.toml [triggers]).
 * error_logs has no other cap on growth, so this is what keeps it from
 * growing forever — 30 days is enough to spot a recurring incident without
 * needing the table to double as a permanent audit trail (it isn't one;
 * publication_history/publication_logs already serve that role).
 */
export default defineTask({
  meta: {
    name: 'system:cleanup-error-logs',
    description: 'Deletes error_logs rows older than 30 days',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })

    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().replace('T', ' ').slice(0, 19)
    const result = await db.delete(schema.errorLogs).where(lt(schema.errorLogs.createdAt, cutoff))

    return { result: { deletedCount: (result as any)?.meta?.changes ?? 0 } }
  },
})
