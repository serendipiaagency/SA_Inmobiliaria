import { drizzle } from 'drizzle-orm/d1'
import type { H3Event } from 'h3'
import * as schema from '../db/schema'

export { schema }

export function cfEnv(event: H3Event): {
  DB: D1Database
  MEDIA: R2Bucket
  SESSION_TTL_DAYS?: string
  PRIMARY_DOMAIN?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  RESEND_API_KEY?: string
  RESEND_WEBHOOK_SECRET?: string
} {
  const env = (event.context as any).cloudflare?.env
  if (!env?.DB) {
    throw createError({ statusCode: 500, statusMessage: 'Cloudflare bindings not available (DB)' })
  }
  return env
}

export function useDb(event: H3Event) {
  return drizzle(cfEnv(event).DB, { schema })
}

export function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * True if a thrown error is D1's "UNIQUE constraint failed" — the failure
 * mode of a claim-then-process INSERT (a unique index doubling as an
 * atomic "was this already taken?" check, safe under real concurrency
 * unlike a check-then-insert). D1's error surfaces as an H3Error whose own
 * `.message` is a generic "Failed query: ..." — the actual SQLITE_CONSTRAINT
 * text is one level deeper, on `.cause` (and possibly `.cause.cause`,
 * depending on how the D1 driver wraps it) — so this checks the whole chain
 * rather than assume a fixed depth.
 */
export function isUniqueConstraintError(e: any): boolean {
  const chain = [e, e?.cause, e?.cause?.cause].filter(Boolean).map((x) => String(x?.message || x)).join(' | ')
  return chain.includes('UNIQUE constraint failed')
}

/**
 * Which organization the PUBLIC site (public API, sitemap, inbound forms)
 * should serve for this request. Resolved by `server/middleware/00.tenant.ts`
 * from the request's Host header against `organizations.domain` and stashed
 * on `event.context.org`; falls back to the default tenant (organization 1,
 * "M&M Real Estate") only for a *primary* host (the `*.workers.dev` URL,
 * localhost, or the optional `PRIMARY_DOMAIN` var — see
 * `server/utils/domain.ts`).
 *
 * A host that is neither a known org's domain nor a primary host never
 * reaches this function on the public surface at all: 00.tenant.ts responds
 * 404 directly for that case, so `resolvePublicOrgId()`'s fallback here is
 * only ever exercised for a primary host. This keeps additional
 * organizations (e.g. demo/onboarding tenants seeded in the shared DB) OUT of
 * the live public site: their catalog/leads exist only inside the org-scoped
 * admin until they're given their own domain.
 */
export const DEFAULT_PUBLIC_ORG_ID = 1
export function resolvePublicOrgId(event: H3Event): number {
  return (event.context as any)?.org?.id || DEFAULT_PUBLIC_ORG_ID
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
