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
 * should serve for this request. Until domain-based tenant resolution lands
 * (a client company gets its own domain pointing at this Worker), every public
 * hostname maps to the default tenant — organization 1, "M&M Real Estate".
 *
 * This keeps additional organizations (e.g. demo/onboarding tenants seeded in
 * the shared DB) OUT of the live public site: their catalog/leads exist only
 * inside the org-scoped admin until they're given a domain. When domain
 * resolution is added, this is the single place to look up
 * organizations.domain by the request's Host header.
 */
export const DEFAULT_PUBLIC_ORG_ID = 1
export function resolvePublicOrgId(_event: H3Event): number {
  return DEFAULT_PUBLIC_ORG_ID
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
