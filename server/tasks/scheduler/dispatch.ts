import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'
import { runDispatchTick } from '../../utils/publication/dispatcher'

/**
 * Runs every minute (see nuxt.config.ts scheduledTasks + wrangler.toml
 * [triggers]) — the Publication Scheduler's dispatcher. A plain D1-backed
 * queue rather than Cloudflare Queues/Durable Objects (deliberate choice:
 * zero new billable resources, same pattern already proven by
 * cms:expire-articles). Cross-tenant by design, same reasoning as that task:
 * a platform-level Cron Trigger has no single org's request context.
 */
export default defineTask({
  meta: {
    name: 'scheduler:dispatch',
    description: 'Dispatches due Publication Scheduler jobs across every organization',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })
    const runId = `dispatch-${Date.now()}`
    const result = await runDispatchTick(db, env, runId)
    return { result }
  },
})
