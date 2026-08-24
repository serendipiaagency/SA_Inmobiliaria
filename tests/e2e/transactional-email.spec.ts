import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B, TENANT_A, TENANT_B } from './global-setup'

/**
 * Real triggers over real HTTP — no RESEND_API_KEY is configured for this
 * suite, so every send is the honest "not connected" path (email_log still
 * gets a real 'queued' row; see docs/resend-email.md), which is exactly
 * what "Confirma que el formulario se guarda aunque falle el email" and
 * "no marques como entregada" both require: the triggering action (a
 * contact message, a new user) always succeeds and is saved regardless of
 * whether the email could actually be sent.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('Emails transaccionales — disparadores reales', () => {
  let a: APIRequestContext
  let b: APIRequestContext

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
  })

  test.afterAll(async () => {
    await a.dispose()
    await b.dispose()
  })

  test('crear un usuario dispara el email de bienvenida (user_welcome), guardado en email_log', async () => {
    const email = `welcome-e2e-${RUN}@example.com`
    const res = await a.post('/api/admin/users', { data: { name: 'E2E Welcome', email, password: 'TempPass123!', role: 'user' } })
    expect(res.ok(), await res.text()).toBeTruthy()

    const log: any[] = await (await a.get('/api/admin/saas/email-log')).json()
    const row = log.find((r) => r.recipient === email && r.template === 'user_welcome')
    expect(row, 'expected a user_welcome row for the new user').toBeTruthy()
    expect(row.kind).toBe('transactional')
  })

  test('el formulario de contacto dispara una notificación interna (contact_message) cuando la organización tiene destinatarios configurados', async () => {
    const internalRecipient = `ops-e2e-${RUN}@example.com`
    const orgRes = await a.put('/api/admin/organizations/1', { data: { emailInternalRecipientsJson: JSON.stringify([internalRecipient]) } })
    expect(orgRes.ok(), await orgRes.text()).toBeTruthy()

    try {
      const anon = await pwRequest.newContext({ baseURL: BASE_URL })
      const contactRes = await anon.post('/api/public/contact', { data: { name: 'Visitante E2E', email: `visitor-${RUN}@example.com`, message: `Mensaje de prueba ${RUN}`, type: 'contact' } })
      expect(contactRes.ok(), await contactRes.text()).toBeTruthy()
      await anon.dispose()

      const log: any[] = await (await a.get('/api/admin/saas/email-log')).json()
      const row = log.find((r) => r.recipient === internalRecipient && r.template === 'contact_message')
      expect(row, 'expected a contact_message row addressed to the configured internal recipient').toBeTruthy()
    } finally {
      await a.put('/api/admin/organizations/1', { data: { emailInternalRecipientsJson: '[]' } })
    }
  })

  test('el email-log de una organización nunca incluye envíos de otra (aislamiento)', async () => {
    const email = `isolation-e2e-${RUN}@example.com`
    const res = await b.post('/api/admin/users', { data: { name: 'E2E Isolation', email, password: 'TempPass123!', role: 'user' } })
    expect(res.ok(), await res.text()).toBeTruthy()

    const logA: any[] = await (await a.get('/api/admin/saas/email-log')).json()
    expect(logA.some((r) => r.recipient === email)).toBe(false)

    const logB: any[] = await (await b.get('/api/admin/saas/email-log')).json()
    expect(logB.some((r) => r.recipient === email)).toBe(true)
  })
})

test.describe('Recuperación de contraseña', () => {
  let anon: APIRequestContext

  test.beforeAll(async () => {
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
  })

  test.afterAll(async () => {
    await anon.dispose()
  })

  test('siempre responde 200, exista o no la cuenta (evita enumeración de usuarios)', async () => {
    const known = await anon.post('/api/auth/forgot-password', { data: { email: TENANT_A.email } })
    expect(known.ok()).toBeTruthy()

    const unknown = await anon.post('/api/auth/forgot-password', { data: { email: `no-such-account-${RUN}@example.com` } })
    expect(unknown.ok()).toBeTruthy()
    expect(await known.json()).toEqual(await unknown.json())
  })

  test('un token inventado se rechaza con 400', async () => {
    const res = await anon.post('/api/auth/reset-password', { data: { token: 'not-a-real-token', password: 'NewPassword123!' } })
    expect(res.status()).toBe(400)
  })

  test('una contraseña demasiado corta se rechaza con 422', async () => {
    const res = await anon.post('/api/auth/reset-password', { data: { token: 'whatever', password: 'short' } })
    expect(res.status()).toBe(422)
  })
})
