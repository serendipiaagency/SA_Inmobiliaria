import { and, eq, lte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'
import { attemptSend, MAX_EMAIL_ATTEMPTS } from '../../utils/email/send'

/**
 * Runs hourly (see nuxt.config.ts scheduledTasks + wrangler.toml [triggers])
 * — the "cola de fallos" (failure queue) for transactional email: picks up
 * every email_log row still 'queued' whose next_retry_at has arrived and
 * retries it via the exact same attemptSend() the initial synchronous send
 * uses (each row is self-contained — from/to/subject/html were saved at
 * creation, see server/utils/email/send.ts — so a retry never needs to
 * re-resolve org branding or re-render a template), so retry behavior
 * (backoff, giving up after MAX_EMAIL_ATTEMPTS, never marking 'delivered' on
 * our own say-so) is identical, not a second implementation to keep in
 * sync. Cross-tenant by design, same reasoning as every other cron task
 * here.
 */
export default defineTask<{ skipped: true; reason: string } | { checked: number; sent: number; stillQueued: number; failed: number }>({
  meta: {
    name: 'notifications:retry-email-queue',
    description: 'Retries email_log rows still queued past their backoff window',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })

    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const due = await db
      .select({ id: schema.emailLog.id, attempts: schema.emailLog.attempts })
      .from(schema.emailLog)
      .where(and(eq(schema.emailLog.status, 'queued'), lte(schema.emailLog.nextRetryAt, nowIso)))

    let sent = 0
    let stillQueued = 0
    let failed = 0
    for (const row of due) {
      if (row.attempts >= MAX_EMAIL_ATTEMPTS) continue // safety net; attemptSend() already stops scheduling further retries at this point
      const result = await attemptSend(db, env, row.id)
      if (result.status === 'sent') sent++
      else if (result.status === 'failed') failed++
      else stillQueued++
    }

    return { result: { checked: due.length, sent, stillQueued, failed } }
  },
})
