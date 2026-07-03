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

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
