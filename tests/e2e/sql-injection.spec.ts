import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * Proves the app-code side of the drizzle-orm SQL-injection audit
 * (GHSA-gpj5-g38j-94v9, fixed upstream by upgrading to drizzle-orm@0.45.2):
 * every place a client can influence sort/order/filter/search/resource-name/
 * pagination either goes through Drizzle's typed query builder against a
 * fixed Column reference, an explicit whitelist lookup, or a D1 `?N` bound
 * parameter — never a raw string spliced into SQL text. These payloads don't
 * target a specific known bug; they're a regression net so a future change
 * that reintroduces string-built SQL fails loudly here instead of shipping.
 */

const SQLI_PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE developer_properties; --",
  '1) UNION SELECT NULL,NULL,NULL--',
  'id; SELECT * FROM organizations',
  '"; --',
  '../../../etc/passwd',
]

test.describe('Inyección SQL — parámetros dinámicos', () => {
  let a: APIRequestContext
  let b: APIRequestContext

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
  })
  test.afterAll(async () => {
    await a?.dispose()
    await b?.dispose()
  })

  test('el buscador público de propiedades no se rompe ni filtra datos con payloads en sort/filtros', async () => {
    for (const payload of SQLI_PAYLOADS) {
      const res = await a.get('/api/public/properties', {
        params: { sort: payload, community: payload, street: payload, type: payload, orientation: payload, q: payload, energy: payload },
      })
      expect(res.ok(), `sort/filtros con "${payload}" debería seguir devolviendo 200`).toBeTruthy()
      const body = await res.json()
      expect(Array.isArray(body.rows), `respuesta debe tener forma válida para "${payload}"`).toBeTruthy()
    }
  })

  test('la paginación no se rompe con valores no numéricos, negativos o extremos', async () => {
    for (const value of ['-1', '0', 'abc', '99999999999999', "1' OR '1'='1", 'NaN']) {
      const res = await a.get('/api/public/properties', { params: { page: value, perPage: value } })
      expect(res.ok(), `page/perPage="${value}" debería seguir devolviendo 200`).toBeTruthy()
      const body = await res.json()
      expect(body.perPage).toBeGreaterThan(0)
      expect(body.perPage).toBeLessThanOrEqual(48)
      expect(body.page).toBeGreaterThanOrEqual(1)
    }
  })

  test('un nombre de recurso admin desconocido o malicioso devuelve 404, nunca 500 ni datos', async () => {
    for (const payload of [...SQLI_PAYLOADS, 'developer_properties; --', 'developer-properties/../organizations']) {
      const res = await a.get(`/api/admin/${encodeURIComponent(payload)}`)
      expect(res.status(), `recurso "${payload}" debe ser 404`).toBe(404)
    }
  })

  test('la búsqueda del CRUD genérico de admin no se rompe con payloads', async () => {
    const res = await a.get('/api/admin/developer-properties', { params: { q: "' OR '1'='1", perPage: 5 } })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(Array.isArray(body.rows)).toBeTruthy()
  })

  test('el listado de artículos CMS no se rompe con sort/dir arbitrarios (whitelist con fallback)', async () => {
    for (const sort of [...SQLI_PAYLOADS, 'organizationId', 'password']) {
      const res = await a.get('/api/admin/cms/articles', { params: { sort, dir: "desc'; --" } })
      expect(res.ok(), `sort="${sort}" debería seguir devolviendo 200`).toBeTruthy()
      const body = await res.json()
      expect(Array.isArray(body.rows)).toBeTruthy()
    }
  })

  test('los filtros de clientes/reservas del panel SaaS no se rompen con payloads', async () => {
    for (const payload of SQLI_PAYLOADS) {
      const clients = await a.get('/api/admin/saas/clients', { params: { type: payload, stage: payload, search: payload } })
      expect(clients.ok(), `clients type/stage/search="${payload}" debería devolver 200`).toBeTruthy()
      const reservations = await a.get('/api/admin/saas/reservations', { params: { status: payload } })
      expect(reservations.ok(), `reservations status="${payload}" debería devolver 200`).toBeTruthy()
    }
  })

  test('un payload de inyección en los filtros no filtra datos de otro tenant', async () => {
    // Tenant B creates a uniquely named property; tenant A tries to surface it
    // through the search box with a classic "always true" payload.
    const devRes = await b.post('/api/admin/developers', {
      data: { name: `SQLi isolation dev ${Date.now()}`, email: `sqli-${Date.now()}@mm.test`, status: 'active' },
    })
    expect(devRes.ok()).toBeTruthy()
    const marker = `SQLi Isolation Marker ${Date.now()}`
    const propRes = await b.post('/api/admin/developer-properties', {
      data: { developerId: (await devRes.json()).id, name: marker, status: 'new', price: 500000 },
    })
    expect(propRes.ok()).toBeTruthy()

    const res = await a.get('/api/admin/developer-properties', { params: { q: "' OR '1'='1", perPage: 200 } })
    expect(res.ok()).toBeTruthy()
    const rows = (await res.json()).rows as any[]
    expect(rows.some((r) => r.name === marker), 'una propiedad del tenant B nunca debe aparecer en el listado del tenant A').toBe(false)
  })

  // Login/auth deliberately isn't covered here: server/api/auth/* has no
  // sql`` or .prepare() at all (grep-confirmed), so there's no dynamic-SQL
  // surface to prove safe, and /api/auth/login is rate-limited to 10
  // attempts/10min/IP (server/utils/rateLimit.ts) — every request in a local
  // wrangler dev run shares one IP with global-setup.ts's own two logins, so
  // spending that budget here just makes the suite flaky for no coverage gain.
})
