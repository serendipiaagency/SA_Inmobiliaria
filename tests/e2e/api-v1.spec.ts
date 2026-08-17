import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

test.describe('API pública /api/v1', () => {
  let readKey: string
  let writeKey: string
  let admin: APIRequestContext

  // Reuses the session from global-setup.ts rather than logging in again —
  // /api/auth/login is IP rate-limited and the whole suite shares one address.
  test.beforeAll(async () => {
    admin = await pwRequest.newContext({
      baseURL: process.env.E2E_BASE_URL || 'http://localhost:8788',
      storageState: STATE_A,
    })

    const readRes = await admin.post('/api/admin/saas/apikeys', {
      data: { name: 'e2e-read', scopes: 'read' },
    })
    expect(readRes.ok()).toBeTruthy()
    readKey = (await readRes.json()).plainKey

    const writeRes = await admin.post('/api/admin/saas/apikeys', {
      data: { name: 'e2e-write', scopes: 'write' },
    })
    expect(writeRes.ok()).toBeTruthy()
    writeKey = (await writeRes.json()).plainKey
  })

  test.afterAll(async () => {
    await admin?.dispose()
  })

  test('GET /api/v1/communities responde 200 y escopa por organización', async ({ request }) => {
    const res = await request.get('/api/v1/communities', {
      headers: { Authorization: `Bearer ${readKey}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
  })

  test('GET /api/v1/agents responde 200', async ({ request }) => {
    const res = await request.get('/api/v1/agents', {
      headers: { Authorization: `Bearer ${readKey}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
  })

  test('sin Authorization, los endpoints v1 devuelven 401', async ({ request }) => {
    const res = await request.get('/api/v1/communities')
    expect(res.status()).toBe(401)
  })

  test('POST /api/v1/leads con clave "read" devuelve 403 (falta scope write)', async ({ request }) => {
    const res = await request.post('/api/v1/leads', {
      headers: { Authorization: `Bearer ${readKey}` },
      data: { name: 'E2E Lead', email: 'e2e-lead@example.com' },
    })
    expect(res.status()).toBe(403)
  })

  test('POST /api/v1/leads con clave "write" crea el lead', async ({ request }) => {
    const res = await request.post('/api/v1/leads', {
      headers: { Authorization: `Bearer ${writeKey}` },
      data: { name: 'E2E Lead', email: 'e2e-lead@example.com', source: 'api' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe('E2E Lead')
  })

  test('POST /api/v1/leads sin email ni teléfono devuelve 422', async ({ request }) => {
    const res = await request.post('/api/v1/leads', {
      headers: { Authorization: `Bearer ${writeKey}` },
      data: { name: 'Sin contacto' },
    })
    expect(res.status()).toBe(422)
  })
})
