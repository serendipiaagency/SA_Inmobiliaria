import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'
import { computeAiTimeSuggestions } from '../../utils/publication/aiTime'

/**
 * Runs weekly (see nuxt.config.ts scheduledTasks + wrangler.toml [triggers]).
 * Recomputes every organization's AI time suggestions from real execution
 * history — same function the on-demand recompute endpoint calls, just on
 * a schedule so the hint in the create-schedule UI stays current without
 * anyone remembering to click "recalcular".
 */
export default defineTask<{ skipped: true; reason: string } | { organizations: number; suggestionsWritten: number }>({
  meta: {
    name: 'scheduler:recompute-ai-time',
    description: 'Recomputes AI publish-time suggestions for every organization',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })

    const orgs = await db.select({ id: schema.organizations.id }).from(schema.organizations)
    let totalWritten = 0
    for (const org of orgs) {
      totalWritten += await computeAiTimeSuggestions(db, org.id)
    }
    return { result: { organizations: orgs.length, suggestionsWritten: totalWritten } }
  },
})
