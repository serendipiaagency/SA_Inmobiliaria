import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Cola 12-C — «Invitar a la plataforma» un comercial: crea/vincula su cuenta
 * con el preset «comercial», le manda el enlace de un solo uso (reutilizando el
 * flujo de password_reset) y permite reenviar y revocar. El administrador de la
 * agencia (Sistema) puede hacerlo; no hace falta crear la cuenta a mano.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const MOCK_URL = process.env.E2E_PROVIDER_MOCK_URL || 'http://127.0.0.1:8799'
const RUN = `${Date.now()}`.slice(-8)

async function emailsTo(address: string) {
  const all = (await (await fetch(`${MOCK_URL}/__requests`)).json()) as any[]
  return all.filter((r) => r.method === 'POST' && r.path === '/emails' && String(r.body?.to).toLowerCase() === address.toLowerCase()).map((r) => r.body)
}

test.describe('Comerciales — invitación al panel', () => {
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  const teamIds: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  })
  test.afterAll(async () => {
    await Promise.all(teamIds.map((id) => a.delete(`/api/admin/team/${id}?hard=1`).catch(() => null)))
    await a?.dispose()
  })

  async function createComercial(email: string) {
    const res = await a.post('/api/admin/team', { data: { name: `Invitado ${RUN}`, email, position: 'Comercial' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    teamIds.push(id)
    return id
  }

  test('invitar crea y vincula la cuenta, manda el email y permite revocar', async () => {
    const email = `comercial-${RUN}@example.com`
    const id = await createComercial(email)

    // Antes de invitar, el comercial no tiene cuenta vinculada.
    expect((await (await a.get(`/api/admin/team/${id}`)).json()).row.userId ?? null).toBeNull()

    const invite = await a.post('/api/admin/saas/commercial-access', { data: { teamMemberId: id, action: 'invite' } })
    expect(invite.ok(), await invite.text()).toBeTruthy()
    const invBody = await invite.json()
    expect(invBody.status).toBe('invited')
    expect(invBody.userId, 'se creó/vinculó una cuenta').toBeTruthy()

    // El vínculo quedó guardado en la ficha del comercial.
    expect((await (await a.get(`/api/admin/team/${id}`)).json()).row.userId).toBe(invBody.userId)

    // Recibió el email de invitación para definir su contraseña (plataforma).
    await expect.poll(async () => (await emailsTo(email)).length, { timeout: 15_000 }).toBeGreaterThan(0)
    const mail = (await emailsTo(email)).find((b) => /Portal INMO/.test(String(b.subject)))
    expect(mail, 'llegó el email de invitación').toBeTruthy()
    expect(String(mail.html)).toContain('/reset-password/')

    // Revocar: la cuenta se desvincula.
    const revoke = await a.post('/api/admin/saas/commercial-access', { data: { teamMemberId: id, action: 'revoke' } })
    expect(revoke.ok(), await revoke.text()).toBeTruthy()
    expect((await revoke.json()).status).toBe('revoked')
    expect((await (await a.get(`/api/admin/team/${id}`)).json()).row.userId ?? null).toBeNull()
  })
})
