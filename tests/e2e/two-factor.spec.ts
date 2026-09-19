import { createHmac } from 'node:crypto'
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

/**
 * Verificación en dos pasos, de punta a punta sobre el Worker real: alta
 * desde la API de Mi cuenta, login que ya no entra sólo con la contraseña,
 * código incorrecto rechazado, código correcto → sesión, desafío de un solo
 * uso, desactivación con contraseña + código de recuperación.
 *
 * Con una cuenta desechable, no con la del super_admin: dejarle el 2FA
 * activo rompería el login directo que otras pruebas hacen con ella.
 *
 * Presupuesto de logins: /api/auth/login admite 10 intentos por IP cada 10
 * minutos y toda la suite sale de la misma dirección (global-setup 2,
 * auth.spec 3, admin-rbac 1, property-editor 1). Este fichero gasta
 * exactamente DOS: uno para obtener la sesión con la que se activa y otro
 * para probar el login en dos pasos. El resto de caminos (código de
 * recuperación al entrar, caducidad, intentos agotados) los cubre
 * test/unit/twoFactor.test.ts sin gastar ninguno.
 *
 * El código TOTP se calcula aquí con node:crypto a partir del secreto que
 * devuelve el alta — es decir, se comprueba que el servidor acepta lo que
 * generaría una app de autenticación independiente, no su propio código.
 */

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of input.toUpperCase().replace(/[=\s-]/g, '')) {
    value = (value << 5) | alphabet.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

function totpNow(secretB32: string, offsetSteps = 0): string {
  const step = Math.floor(Date.now() / 1000 / 30) + offsetSteps
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const digest = createHmac('sha1', base32Decode(secretB32)).update(counter).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]
  return String(binary % 1_000_000).padStart(6, '0')
}

test.describe.configure({ mode: 'serial' })

test.describe('Verificación en dos pasos', () => {
  const ACCOUNT = { email: `totp-${RUN}@sa-inmobiliaria.com`, password: 'ChangeMe123!' }
  let owner: APIRequestContext
  let userId: number
  let secret = ''
  let recoveryCodes: string[] = []
  /** Sesión de la cuenta desechable (login 1 de 2). */
  let account: APIRequestContext

  test.beforeAll(async () => {
    owner = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const created = await owner.post('/api/admin/users', { data: { name: 'Cuenta 2FA', email: ACCOUNT.email, password: ACCOUNT.password, role: 'admin' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    userId = (await created.json()).id
    account = await pwRequest.newContext({ baseURL: BASE_URL })
    const login = await account.post('/api/auth/login', { data: ACCOUNT })
    expect(login.ok(), `login: ${login.status()}`).toBeTruthy()
    expect((await login.json()).requiresTotp).toBeFalsy()
  })

  test.afterAll(async () => {
    if (userId) await owner.delete(`/api/admin/users/${userId}`).catch(() => null)
    await Promise.all([owner.dispose(), account?.dispose()])
  })

  test('el alta exige confirmar con un código de la app y entrega los códigos de recuperación una sola vez', async () => {
    const status = await (await account.get('/api/auth/totp/status')).json()
    expect(status).toMatchObject({ available: true, enabled: false })

    const setup = await account.post('/api/auth/totp/setup')
    expect(setup.ok(), await setup.text()).toBeTruthy()
    const body = await setup.json()
    secret = body.secret
    expect(body.otpauthUrl).toContain(`secret=${secret}`)
    expect(body.qrSvg).toContain('<svg')

    // Un código inventado no activa nada.
    const wrong = await account.post('/api/auth/totp/enable', { data: { code: '000000' } })
    expect(wrong.status()).toBe(401)
    expect((await (await account.get('/api/auth/totp/status')).json()).enabled).toBe(false)

    const enable = await account.post('/api/auth/totp/enable', { data: { code: totpNow(secret) } })
    expect(enable.ok(), await enable.text()).toBeTruthy()
    recoveryCodes = (await enable.json()).recoveryCodes
    expect(recoveryCodes).toHaveLength(10)
    expect((await (await account.get('/api/auth/totp/status')).json()).enabled).toBe(true)

    // Consta en la auditoría de la organización, sin secretos.
    const audit = await (await owner.get('/api/admin/audit-log', { params: { perPage: '50' } })).json()
    const row = audit.rows.find((r: any) => r.resource === 'users' && String(r.resourceId) === String(userId) && String(r.detail || '').includes('2FA'))
    expect(row?.detail).toContain('activado')
    expect(JSON.stringify(audit.rows)).not.toContain(secret)
    for (const code of recoveryCodes) expect(JSON.stringify(audit.rows)).not.toContain(code)
  })

  test('con 2FA activo, la contraseña sola no crea sesión; un código incorrecto no; el correcto sí, y el desafío se consume', async () => {
    const fresh = await pwRequest.newContext({ baseURL: BASE_URL })
    try {
      // Login 2 de 2.
      const login = await fresh.post('/api/auth/login', { data: ACCOUNT })
      expect(login.ok(), await login.text()).toBeTruthy()
      const body = await login.json()
      expect(body.requiresTotp).toBe(true)
      expect(body.challenge).toMatch(/^[0-9a-f]{64}$/)
      expect(body.user).toBeUndefined()
      // Sin sesión todavía.
      expect((await (await fresh.get('/api/auth/me')).json()).user).toBeNull()

      const wrong = await fresh.post('/api/auth/totp/verify', { data: { challenge: body.challenge, code: '000000' } })
      expect(wrong.status()).toBe(401)
      expect((await wrong.json()).data?.reason).toBe('wrong_code')
      expect((await (await fresh.get('/api/auth/me')).json()).user).toBeNull()

      // Un paso por delante a propósito: el código del paso actual es el que
      // acaba de activar el 2FA hace unos segundos, y un código sólo vale una
      // vez — el servidor lo rechazaría como repetido. El siguiente sigue
      // dentro de la ventana de ±30 s.
      const ok = await fresh.post('/api/auth/totp/verify', { data: { challenge: body.challenge, code: totpNow(secret, 1) } })
      expect(ok.ok(), await ok.text()).toBeTruthy()
      expect((await ok.json()).method).toBe('totp')
      const me = await (await fresh.get('/api/auth/me')).json()
      expect(me.user?.email).toBe(ACCOUNT.email)

      // El desafío ya está consumido: no vale para una segunda sesión.
      const reuse = await fresh.post('/api/auth/totp/verify', { data: { challenge: body.challenge, code: totpNow(secret, 1) } })
      expect(reuse.status()).toBe(400)
      // Y un desafío inventado tampoco dice nada distinto.
      const fake = await fresh.post('/api/auth/totp/verify', { data: { challenge: 'a'.repeat(64), code: totpNow(secret, 1) } })
      expect(fake.status()).toBe(400)
    } finally {
      await fresh.dispose()
    }
  })

  test('los códigos de recuperación se regeneran con la contraseña y los viejos dejan de valer', async () => {
    const noPassword = await account.post('/api/auth/totp/recovery-codes', { data: { password: 'no-es' } })
    expect(noPassword.status()).toBe(401)

    const regen = await account.post('/api/auth/totp/recovery-codes', { data: { password: ACCOUNT.password } })
    expect(regen.ok(), await regen.text()).toBeTruthy()
    const fresh = (await regen.json()).recoveryCodes as string[]
    expect(fresh).toHaveLength(10)
    expect(fresh).not.toEqual(recoveryCodes)
    expect((await (await account.get('/api/auth/totp/status')).json()).recoveryCodesLeft).toBe(10)

    // Un código de la tanda anterior ya no sirve ni para desactivar.
    const old = await account.post('/api/auth/totp/disable', { data: { password: ACCOUNT.password, code: recoveryCodes[0] } })
    expect(old.status()).toBe(401)
    recoveryCodes = fresh
  })

  test('desactivar exige contraseña y código; después la contraseña vuelve a bastar', async () => {
    const wrongPassword = await account.post('/api/auth/totp/disable', { data: { password: 'no-es', code: totpNow(secret, 2) } })
    expect(wrongPassword.status()).toBe(401)

    // Con un código de recuperación (se consume) en lugar del TOTP.
    const disable = await account.post('/api/auth/totp/disable', { data: { password: ACCOUNT.password, code: recoveryCodes[3].toLowerCase() } })
    expect(disable.ok(), await disable.text()).toBeTruthy()
    expect((await (await account.get('/api/auth/totp/status')).json()).enabled).toBe(false)

    // Ya no hay nada que verificar: el endpoint lo dice, sin filtrar más.
    const again = await account.post('/api/auth/totp/disable', { data: { password: ACCOUNT.password, code: '000000' } })
    expect(again.status()).toBe(409)

    const audit = await (await owner.get('/api/admin/audit-log', { params: { perPage: '50' } })).json()
    const rows = audit.rows.filter((r: any) => r.resource === 'users' && String(r.resourceId) === String(userId) && String(r.detail || '').includes('2FA'))
    expect(rows.map((r: any) => r.detail)).toEqual(expect.arrayContaining([expect.stringContaining('desactivado'), expect.stringContaining('activado')]))
  })

  test('la pantalla Mi cuenta enseña el estado y la activación con QR', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STATE_A })
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE_URL}/admin/cuenta`)
      await expect(page.getByTestId('totp-disabled')).toBeVisible()
      await page.getByTestId('totp-start').click()
      await expect(page.getByTestId('totp-qr').locator('svg')).toBeVisible()
      await expect(page.getByTestId('totp-secret')).toHaveText(/^[A-Z2-7]{32}$/)
      // Cancelar deja la cuenta sin activar y sin restos.
      await page.getByRole('button', { name: 'Cancelar' }).click()
      await expect(page.getByTestId('totp-start')).toBeVisible()
      const status = await (await owner.get('/api/auth/totp/status')).json()
      expect(status.enabled).toBe(false)
      // El enlace del menú lleva aquí.
      await page.goto(`${BASE_URL}/admin`)
      await page.getByTestId('nav-mi-cuenta').click()
      await expect(page).toHaveURL(/\/admin\/cuenta$/)
    } finally {
      await ctx.close()
    }
  })
})
