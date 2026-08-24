import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Domain-based tenant resolution over real HTTP (server/middleware/00.tenant.ts).
 *
 * `admin@sa-inmobiliaria.com` (STATE_A) is the platform super_admin (migration
 * 0021), so its session is reused both to assign a domain to tenant B
 * (Skyline Estates, org 2) via /api/admin/organizations and, unauthenticated,
 * to hit the public site with that Host header.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const ORG2_DOMAIN = `skyline-e2e-${RUN}.test`
const ORG2_ID = 2

test.describe('Resolución de tenant por dominio', () => {
  let superAdmin: APIRequestContext
  let anon: APIRequestContext

  test.beforeAll(async () => {
    superAdmin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })

    const res = await superAdmin.put(`/api/admin/organizations/${ORG2_ID}`, { data: { domain: ORG2_DOMAIN } })
    expect(res.ok(), `could not assign a domain to org ${ORG2_ID}: ${res.status()} ${await res.text()}`).toBeTruthy()
  })

  test.afterAll(async () => {
    await superAdmin.put(`/api/admin/organizations/${ORG2_ID}`, { data: { domain: '' } })
    await superAdmin.dispose()
    await anon.dispose()
  })

  test('a known org domain resolves to that org, not the default tenant', async () => {
    const res = await anon.get('/api/public/tenant', { headers: { host: ORG2_DOMAIN } })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.id).toBe(ORG2_ID)
    expect(body.name).toBe('Skyline Estates')
  })

  test('the www. variant of a known org domain resolves to the same org', async () => {
    const res = await anon.get('/api/public/tenant', { headers: { host: `www.${ORG2_DOMAIN}` } })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).id).toBe(ORG2_ID)
  })

  test('a primary host (no Host override -> localhost) still serves the default tenant', async () => {
    const res = await anon.get('/api/public/tenant')
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).id).toBe(1)
  })

  test('an unrecognized host is refused with 404 on the public API', async () => {
    const res = await anon.get('/api/public/tenant', { headers: { host: `nobody-configured-this-${RUN}.test` } })
    expect(res.status()).toBe(404)
  })

  test('an unrecognized host still reaches /admin/login (bypass for the admin surface)', async () => {
    const res = await anon.get('/admin/login', { headers: { host: `nobody-configured-this-${RUN}.test` } })
    expect(res.ok()).toBeTruthy()
  })

  test('sitemap.xml on a known org domain is scoped to that org and uses its own origin', async () => {
    const res = await anon.get('/sitemap.xml', { headers: { host: ORG2_DOMAIN } })
    expect(res.ok()).toBeTruthy()
    const body = await res.text()
    expect(body).toContain(`http://${ORG2_DOMAIN}/demo`)
  })

  test('robots.txt points at the requesting domain\'s own sitemap and 404s on an unrecognized host', async () => {
    const known = await anon.get('/robots.txt', { headers: { host: ORG2_DOMAIN } })
    expect(known.ok()).toBeTruthy()
    expect(await known.text()).toContain(`Sitemap: http://${ORG2_DOMAIN}/sitemap.xml`)

    const unknown = await anon.get('/robots.txt', { headers: { host: `nobody-configured-this-${RUN}.test` } })
    expect(unknown.status()).toBe(404)
  })

  test('a super_admin cannot assign a *.workers.dev-style host as a custom org domain', async () => {
    const res = await superAdmin.put(`/api/admin/organizations/${ORG2_ID}`, {
      data: { domain: 'sa-inmobiliaria.some-subdomain.workers.dev' },
    })
    expect(res.status()).toBe(422)
  })

  test('a super_admin cannot assign an invalid hostname as a custom org domain', async () => {
    const res = await superAdmin.put(`/api/admin/organizations/${ORG2_ID}`, { data: { domain: 'not a domain' } })
    expect(res.status()).toBe(422)
  })
})
