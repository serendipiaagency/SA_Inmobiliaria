import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { request } from '@playwright/test'

/**
 * Signs each test tenant in once and saves its session cookie, so the API
 * specs can share an authenticated context instead of logging in again per
 * file.
 *
 * This isn't just tidiness: `/api/auth/login` is rate-limited to 10 attempts
 * per 10 minutes per IP (server/utils/rateLimit.ts), and every request in a
 * local `wrangler dev` run arrives from the same address. Once the suite grew
 * a second tenant it began tripping that limit and failing unrelated specs
 * with 429s. Reusing storage state keeps the real production limit untouched
 * — the alternative would have been loosening a brute-force guard to suit the
 * test harness.
 */

export const TENANT_A = { email: 'admin@sa-inmobiliaria.com', password: 'ChangeMe123!' }
export const TENANT_B = { email: 'admin@skyline-estates.com', password: 'ChangeMe123!' }

export const STATE_A = 'tests/e2e/.auth/tenant-a.json'
export const STATE_B = 'tests/e2e/.auth/tenant-b.json'

async function saveSession(baseURL: string, creds: { email: string; password: string }, path: string) {
  const ctx = await request.newContext({ baseURL })
  const res = await ctx.post('/api/auth/login', { data: creds })
  if (!res.ok()) throw new Error(`global-setup: login failed for ${creds.email} (${res.status()})`)
  mkdirSync(dirname(path), { recursive: true })
  await ctx.storageState({ path })
  await ctx.dispose()
}

export default async function globalSetup() {
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:8788'
  await saveSession(baseURL, TENANT_A, STATE_A)
  await saveSession(baseURL, TENANT_B, STATE_B)
}
