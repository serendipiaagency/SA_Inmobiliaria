import { drizzle } from 'drizzle-orm/d1'
import type { H3Event } from 'h3'
import * as schema from '../db/schema'

export { schema }

export function cfEnv(event: H3Event): { DB: D1Database; MEDIA: R2Bucket; SESSION_TTL_DAYS?: string } {
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
 * Which organization the PUBLIC site (public API, sitemap, inbound forms)
 * should serve for this request. Resolved by `server/middleware/00.tenant.ts`
 * from the request's Host header against `organizations.domain` and stashed
 * on `event.context.org`; falls back to the default tenant (organization 1,
 * "M&M Real Estate") when no organization has that domain configured — which
 * today is every request, since no org has a domain set yet.
 *
 * This keeps additional organizations (e.g. demo/onboarding tenants seeded in
 * the shared DB) OUT of the live public site: their catalog/leads exist only
 * inside the org-scoped admin until they're given a domain.
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
