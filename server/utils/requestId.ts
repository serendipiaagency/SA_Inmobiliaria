import { getRequestHeader, type H3Event } from 'h3'

function randomRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * A per-request correlation id, threaded through error_logs and
 * webhook_deliveries so an incident spanning multiple systems (a webhook
 * delivery failure that also triggered an error log, both caused by the
 * same request) can be traced back to one origin instead of matched up by
 * eyeballing timestamps (docs/production-hardening-audit.md, P1-12).
 *
 * Reuses Cloudflare's own `cf-ray` header when present — already unique
 * per request at the edge, free, no new infrastructure — and only
 * generates a fallback for contexts where it's absent (local `wrangler
 * dev`, unit tests). Cached on `event.context` so every call within the
 * same request returns the same id, however many places read it.
 */
export function getRequestId(event: H3Event): string {
  const ctx = event.context as any
  if (ctx.requestId) return ctx.requestId as string
  const id = getRequestHeader(event, 'cf-ray') || randomRequestId()
  ctx.requestId = id
  return id
}
