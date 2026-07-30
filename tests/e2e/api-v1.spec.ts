import { test, expect } from '@playwright/test'

const ADMIN_EMAIL = 'admin@sa-inmobiliaria.com'
const ADMIN_PASSWORD = 'ChangeMe123!'

test.describe('API pública /api/v1', () => {
  let readKey: string
  let writeKey: string

  test.beforeAll(async ({ request }) => {
    const login = await request.post('/api/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })
    expect(login.ok()).toBeTruthy()

    const readRes = await request.post('/api/admin/saas/apikeys', {
      data: { name: 'e2e-read', scopes: 'read' },
    })
    expect(readRes.ok()).toBeTruthy()
    readKey = (await readRes.json()).plainKey

    const writeRes = await request.post('/api/admin/saas/apikeys', {
      data: { name: 'e2e-write', scopes: 'write' },
    })
    expect(writeRes.ok()).toBeTruthy()
    writeKey = (await writeRes.json()).plainKey
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
