import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'
import { now } from '../utils/db'

/**
 * Central incident log: writes every server error (status >= 500) to D1 and,
 * if ERROR_ALERT_WEBHOOK_URL is set, posts a one-line summary to it (Slack
 * and Discord both accept a plain `{"text": "..."}`/`{"content": "..."}`
 * body on their incoming-webhook URL — this posts both keys so either works
 * without needing to know which one is configured).
 *
 * Exists so an incident like July's schema-drift outage (every public/admin
 * endpoint 500ing) shows up here instead of depending on a customer to
 * notice and report it — see the "Errores" page under Sistema in the admin.
 * No alert webhook is configured yet (same honest-adapter pattern as
 * AI_API_KEY in server/utils/ai.ts and the channel adapters in
 * server/utils/publication/adapters.ts): logging to D1 works today,
 * push notifications activate the moment a webhook URL is added, with no
 * other code change.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', async (error: any, context: any) => {
    const statusCode = error?.statusCode || 500
    if (statusCode < 500) return // 4xx are expected client/auth failures, not incidents

    const event = context?.event
    const env = event?.context?.cloudflare?.env
    if (!env?.DB) return // nothing to write to (shouldn't happen outside local unit tests)

    const message = String(error?.statusMessage || error?.message || 'Unknown error').slice(0, 2000)
    const stack = error?.stack ? String(error.stack).slice(0, 4000) : null
    const path = event?.path ? String(event.path).slice(0, 500) : null
    const method = event?.method ? String(event.method).slice(0, 10) : null
    const organizationId = event?.context?.org?.id ?? null
    const userId = event?.context?.user?.id ?? null

    try {
      const db = drizzle(env.DB as D1Database, { schema })
      await db.insert(schema.errorLogs).values({
        statusCode,
        message,
        stack,
        method,
        path,
        organizationId,
        userId,
        createdAt: now(),
      })
    } catch (loggingError) {
      // The error log must never be the thing that crashes the request.
      console.error('Failed to write to error_logs', loggingError)
    }

    const webhookUrl = env.ERROR_ALERT_WEBHOOK_URL
    if (webhookUrl) {
      const summary = `🔴 [${statusCode}] ${method || ''} ${path || ''} — ${message}`.slice(0, 1900)
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: summary, content: summary }),
        })
      } catch (webhookError) {
        console.error('Failed to post error alert webhook', webhookError)
      }
    }
  })
})
