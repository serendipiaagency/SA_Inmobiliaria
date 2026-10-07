import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B, TENANT_A } from './global-setup'

/**
 * Empresas — los dos canales de alta sobre el Worker real:
 *
 *  A. Sistemas > Empresas > + Nuevo: asistente de 5 pasos (ruta real
 *     /admin/organizations/new), dominio duplicado, logo, color, invitación
 *     al administrador, doble envío, éxito, listado, ficha por secciones,
 *     suspensión con aviso, empresa antigua, y permisos.
 *  B. Landing → Registro empresa: formulario público, éxito honesto, emails
 *     de plataforma desde Portal INMO <info@serendipiaagency.com> sin contraseña,
 *     login normal (sin autologin), aislamiento de tenant, sin acceso a
 *     Empresas, campos prohibidos, duplicados, doble envío simultáneo,
 *     límite por IP y política de acceso (suspender corta la sesión).
 *
 * Resend es el simulador de scripts/e2e-provider-mock.mjs (RESEND_BASE_URL,
 * sólo loopback): ningún email sale de la máquina y se puede leer el cuerpo
 * EXACTO que habría recibido el proveedor.
 *
 * Límites por IP: /api/auth/login (10 / 10 min) y el registro (5 / hora) se
 * cuentan por `cf-connecting-ip`. Toda la suite sale de la misma dirección,
 * así que este fichero firma sus peticiones con IPs de prueba propias
 * (192.0.2.0/24, reservada para documentación) y no gasta el presupuesto de
 * logins del resto de specs. En producción esa cabecera la pone Cloudflare
 * y el cliente no puede fijarla.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const MOCK_URL = process.env.E2E_PROVIDER_MOCK_URL || 'http://127.0.0.1:8799'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const RUN_IP = `192.0.2.${(Date.now() % 200) + 20}`
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const PASSWORD = `Registro-${RUN}!`

const IP_BASE = Math.floor(Math.random() * 150)
function ip(n: number) {
  return { 'cf-connecting-ip': `198.51.100.${((IP_BASE + n) % 253) + 1}` }
}

async function providerEmails(): Promise<any[]> {
  const all = (await (await fetch(`${MOCK_URL}/__requests`)).json()) as any[]
  return all.filter((r) => r.method === 'POST' && r.path === '/emails').map((r) => r.body)
}

async function emailsTo(address: string) {
  return (await providerEmails()).filter((b) => String(b.to).toLowerCase() === address.toLowerCase())
}

test.describe.configure({ mode: 'serial' })

test.describe('Empresas A — Sistemas > Empresas > + Nuevo', () => {
  let owner: APIRequestContext
  let tenantB: APIRequestContext
  const NAME = `Asistente ${RUN}`
  const TAKEN_DOMAIN = `ocupado-${RUN}.es`
  const FREE_DOMAIN = `asistente-${RUN}.es`
  const ADMIN_EMAIL = `wizard-admin-${RUN}@example.com`
  let createdId = 0

  test.beforeAll(async () => {
    owner = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    tenantB = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    // Una empresa que ya tiene el dominio, creada por el mismo endpoint del asistente.
    const res = await owner.post('/api/admin/organizations', { data: { name: `Ocupada ${RUN}`, domain: TAKEN_DOMAIN, initialAdmin: { mode: 'none' } } })
    expect(res.ok(), await res.text()).toBeTruthy()
  })
  test.afterAll(async () => {
    await owner.dispose()
    await tenantB.dispose()
  })

  test('+ Nuevo abre el asistente en la ruta real, con sus 5 pasos', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STATE_A })).newPage()
    await page.goto('/admin/organizations')
    await page.getByRole('link', { name: '+ Nuevo' }).click()
    await expect(page).toHaveURL(/\/admin\/organizations\/new$/)
    await expect(page.getByRole('heading', { name: 'Nueva empresa' })).toBeVisible()
    await expect(page.getByText('Configura una nueva empresa en INMO.')).toBeVisible()
    for (const step of ['empresa', 'identidad', 'configuracion', 'acceso', 'revision']) {
      await expect(page.getByTestId(`org-wizard-step-${step}`)).toBeVisible()
    }
    await expect(page.getByTestId('org-wizard-back')).toHaveAttribute('href', '/admin/organizations')
    await page.context().close()
  })

  test('recorre los pasos, valida, crea UNA empresa con doble clic y muestra el éxito', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STATE_A })).newPage()
    await page.goto('/admin/organizations/new')
    await expect(page.getByTestId('org-wizard')).toHaveAttribute('data-ready', 'true')

    // Paso 1 — nombre obligatorio y dominio duplicado bloquean.
    await page.getByTestId('org-wizard-next').click()
    await expect(page.getByTestId('org-name')).toHaveAttribute('aria-invalid', 'true')
    await page.getByTestId('org-name').fill(NAME)
    await page.getByTestId('org-domain').fill(`https://${TAKEN_DOMAIN}/`)
    await expect(page.getByTestId('org-domain-status')).toHaveAttribute('data-state', 'taken')
    await expect(page.getByTestId('org-domain-status')).toContainText('ya está asociado')
    await page.getByTestId('org-wizard-next').click()
    await expect(page.getByTestId('org-wizard-step-empresa')).toHaveAttribute('data-state', 'current')
    await page.getByTestId('org-domain').fill(FREE_DOMAIN)
    await expect(page.getByTestId('org-domain-status')).toHaveAttribute('data-state', 'ok')
    await expect(page.getByTestId('org-domain-status')).toContainText(`https://${FREE_DOMAIN}`)
    await page.getByTestId('org-status-active').check()
    await page.getByTestId('org-wizard-next').click()

    // Paso 2 — logo en memoria con vista previa, color HEX validado.
    await expect(page.getByTestId('org-wizard-step-identidad')).toHaveAttribute('data-state', 'current')
    await page.getByTestId('org-logo-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.getByTestId('org-logo-preview')).toBeVisible()
    await page.getByTestId('org-color-hex').fill('zz')
    await page.getByTestId('org-wizard-next').click()
    await expect(page.getByTestId('org-wizard-step-identidad')).toHaveAttribute('data-state', 'current')
    await page.getByTestId('org-color-hex').fill('#1f6f5c')
    await page.getByTestId('org-wizard-next').click()

    // Paso 3 — configuración real.
    await page.getByTestId('org-storage').fill('7')
    await page.getByTestId('org-wizard-next').click()

    // Paso 4 — administrador inicial invitado.
    await page.getByTestId('org-admin-invite').check()
    await page.getByTestId('org-admin-name').fill('Admin Asistente')
    await page.getByTestId('org-admin-email').fill(ADMIN_EMAIL)
    await page.getByTestId('org-wizard-next').click()

    // Paso 5 — revisión con «Editar» por bloque; Atrás/Continuar conservan los datos.
    const review = page.getByTestId('org-wizard-review')
    await expect(review).toContainText(NAME)
    await expect(review).toContainText(FREE_DOMAIN)
    await expect(review).toContainText('#1F6F5C')
    await expect(review).toContainText('7 GB')
    await expect(review).toContainText(ADMIN_EMAIL)
    await page.getByTestId('org-review-edit-empresa').click()
    await expect(page.getByTestId('org-name')).toHaveValue(NAME)
    for (let i = 0; i < 4; i++) await page.getByTestId('org-wizard-next').click()
    await page.getByTestId('org-wizard-prev').click()
    await expect(page.getByTestId('org-admin-email')).toHaveValue(ADMIN_EMAIL)
    await page.getByTestId('org-wizard-next').click()

    // Nada se ha creado todavía.
    const before = await (await owner.get('/api/admin/organizations', { params: { q: NAME } })).json()
    expect(before.total).toBe(0)

    await page.getByTestId('org-wizard-submit').dblclick()
    await expect(page.getByTestId('org-wizard-success')).toBeVisible()
    await expect(page.getByTestId('org-wizard-invite-status')).toHaveAttribute('data-status', 'sent')
    await expect(page.getByTestId('org-wizard-logo-failed')).toHaveCount(0)

    const after = await (await owner.get('/api/admin/organizations', { params: { q: NAME } })).json()
    expect(after.total).toBe(1)
    createdId = after.rows[0].id

    const detail = await (await owner.get(`/api/admin/organizations/${createdId}`)).json()
    expect(detail.row).toMatchObject({ name: NAME, domain: FREE_DOMAIN, brandColor: '#1F6F5C', status: 'active', registrationSource: 'admin', storageBytesLimit: 7 * 1024 ** 3 })
    expect(detail.row.logo).toBeTruthy()
    expect(detail.overview.users).toEqual([expect.objectContaining({ email: ADMIN_EMAIL, role: 'admin' })])

    // La invitación sale de Portal INMO <info@serendipiaagency.com>, con enlace para definir contraseña.
    const [invite] = await emailsTo(ADMIN_EMAIL)
    expect(invite.from).toBe('Portal INMO <info@serendipiaagency.com>')
    expect(invite.html).toContain('/reset-password/')

    await page.getByTestId('org-wizard-open').click()
    await expect(page).toHaveURL(new RegExp(`/admin/organizations/${createdId}$`))
    await expect(page.getByTestId('org-editor-title')).toContainText(NAME)
    await page.context().close()
  })

  test('el listado muestra el estado y el origen en palabras', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STATE_A })).newPage()
    await page.goto('/admin/organizations')
    await page.getByPlaceholder('Buscar…').fill(NAME)
    await page.getByPlaceholder('Buscar…').press('Enter')
    const row = page.locator('tr', { hasText: NAME })
    await expect(row.locator('[data-field="status"]')).toHaveText('Activa')
    await expect(row.locator('[data-field="registrationSource"]')).toHaveText('Panel (Sistemas > Empresas)')
    await page.context().close()
  })

  test('la ficha por secciones guarda cambios y suspender avisa a la empresa', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STATE_A })).newPage()
    await page.goto(`/admin/organizations/${createdId}`)
    await expect(page.getByTestId('org-editor')).toHaveAttribute('data-ready', 'true')
    await expect(page.getByTestId('org-count-users')).toHaveText('1')
    await page.getByTestId('org-section-identidad').click()
    await page.getByTestId('org-edit-company-name').fill(`Marca ${RUN}`)
    await page.getByTestId('org-editor-save').click()
    await expect(page.getByTestId('org-editor-saved')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('org-editor')).toHaveAttribute('data-ready', 'true')
    await page.getByTestId('org-section-identidad').click()
    await expect(page.getByTestId('org-edit-company-name')).toHaveValue(`Marca ${RUN}`)

    await page.getByTestId('org-section-estado').click()
    await page.getByTestId('org-edit-status-suspended').check()
    await page.getByTestId('org-editor-save').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Suspender' }).click()
    await expect(page.getByTestId('org-editor-status')).toHaveText('Suspendida')
    await expect.poll(async () => (await emailsTo(ADMIN_EMAIL)).some((e) => /suspendido/i.test(e.subject))).toBe(true)
    const notice = (await emailsTo(TENANT_A.email)).find((e) => String(e.subject).includes(`Marca ${RUN}`))
    expect(notice?.from).toBe('Portal INMO <info@serendipiaagency.com>')

    await page.getByTestId('org-edit-status-active').check()
    await page.getByTestId('org-editor-save').click()
    await expect(page.getByTestId('org-editor-status')).toHaveText('Activa')
    await page.context().close()
  })

  test('salir del asistente con datos sin guardar pide confirmación', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STATE_A })).newPage()
    await page.goto('/admin/organizations/new')
    await expect(page.getByTestId('org-wizard')).toHaveAttribute('data-ready', 'true')
    await page.getByTestId('org-name').fill('A medias')
    await page.getByTestId('org-wizard-back').click()
    await expect(page.getByRole('alertdialog')).toContainText('¿Salir sin crear la empresa?')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Seguir editando' }).click()
    await expect(page).toHaveURL(/\/admin\/organizations\/new$/)
    await expect(page.getByTestId('org-name')).toHaveValue('A medias')
    await page.context().close()
  })

  test('una empresa antigua (sin origen ni marca) se abre en la ficha nueva sin romperse', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STATE_A })).newPage()
    await page.goto('/admin/organizations/2')
    await expect(page.getByTestId('org-editor')).toHaveAttribute('data-ready', 'true')
    await expect(page.getByTestId('org-panel-resumen')).toBeVisible()
    for (const s of ['identidad', 'configuracion', 'email', 'legal', 'usuarios', 'estado']) {
      await page.getByTestId(`org-section-${s}`).click()
      await expect(page.getByTestId(`org-panel-${s}`)).toBeVisible()
    }
    await page.context().close()
  })

  test('sin ser super admin no se puede crear, comprobar dominios ni subir el logo de otra empresa', async () => {
    expect((await tenantB.post('/api/admin/organizations', { data: { name: `Intrusa ${RUN}` } })).status()).toBe(403)
    expect((await tenantB.get('/api/admin/organizations', { params: { domainAvailable: FREE_DOMAIN } })).status()).toBe(403)
    const up = await tenantB.post('/api/admin/upload', { multipart: { file: { name: 'l.png', mimeType: 'image/png', buffer: PNG }, folder: 'organizations', organizationId: String(createdId) } })
    expect(up.status()).toBe(403)
  })
})

test.describe('Empresas B — Landing → Registro empresa', () => {
  let owner: APIRequestContext
  const COMPANY = `Autorregistro ${RUN}`
  const EMAIL = `registro-${RUN}@example.com`
  let orgId = 0

  test.beforeAll(async () => {
    owner = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  })
  test.afterAll(async () => owner.dispose())

  async function registerApi(data: Record<string, unknown>, headers = ip(1)) {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: headers })
    const res = await ctx.post('/api/auth/login', { data: { action: 'register-company', acceptTerms: true, ...data } })
    const body = await res.json().catch(() => null)
    await ctx.dispose()
    return { status: res.status(), body }
  }

  test('desde la landing, se registra, ve un éxito honesto y entra por el login normal', async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: ip(2) })
    const page = await context.newPage()
    await page.goto('/')
    await page.getByTestId('landing-register-company').click()
    await expect(page).toHaveURL(/\/registro-empresa$/)
    await expect(page.getByTestId('register-page')).toHaveAttribute('data-ready', 'true')

    await page.getByTestId('register-name').fill(COMPANY)
    await page.getByTestId('register-email').fill(EMAIL)
    await page.getByTestId('register-password').fill(PASSWORD)
    await expect(page.getByTestId('register-password')).toHaveAttribute('type', 'password')
    await page.getByTestId('register-toggle-password').click()
    await expect(page.getByTestId('register-password')).toHaveAttribute('type', 'text')
    await page.getByTestId('register-password-confirm').fill(`${PASSWORD}x`)
    await page.getByTestId('register-accept').check()
    await page.getByTestId('register-submit').click()
    await expect(page.getByTestId('register-password-confirm')).toHaveAttribute('aria-invalid', 'true')
    await page.getByTestId('register-password-confirm').fill(PASSWORD)
    await page.getByTestId('register-submit').click()

    await expect(page.getByTestId('register-success')).toBeVisible()
    await expect(page.getByTestId('register-email-status')).toHaveAttribute('data-status', 'sent')

    // Emails de plataforma: remitente central, sin contraseña.
    const [welcome] = await emailsTo(EMAIL)
    expect(welcome.from).toBe('Portal INMO <info@serendipiaagency.com>')
    expect(welcome.subject).toBe('Te damos la bienvenida a Portal INMO')
    expect(JSON.stringify(welcome)).not.toContain(PASSWORD)
    const adminNotice = (await emailsTo(TENANT_A.email)).find((e) => e.subject === 'Nueva empresa registrada en Portal INMO' && String(e.html).includes(EMAIL))
    expect(adminNotice?.from).toBe('Portal INMO <info@serendipiaagency.com>')
    expect(JSON.stringify(adminNotice)).not.toContain(PASSWORD)

    // Sin autologin: no hay sesión hasta pasar por el login.
    expect((await (await page.request.get('/api/auth/me')).json()).user).toBeNull()
    await page.getByTestId('register-go-login').click()
    await expect(page.getByTestId('login-registered-notice')).toBeVisible()
    await expect(page.locator('#admin-login-email')).toHaveValue(EMAIL)
    await page.locator('#admin-login-password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Acceder al panel' }).click()
    await expect(page).toHaveURL(/\/admin\/?$/)

    // Administrador de SU empresa: nunca super admin, nunca la empresa de otro.
    const me = (await (await page.request.get('/api/auth/me')).json()).user
    expect(me.role).toBe('admin')
    expect(me.organizationId).not.toBe(1)
    orgId = me.organizationId
    const users = await (await page.request.get('/api/admin/users')).json()
    expect(users.rows.map((u: any) => u.email)).toEqual([EMAIL])
    expect((await page.request.get('/api/admin/organizations')).status()).toBe(403)

    // La empresa aparece en Sistemas > Empresas con su origen.
    const listed = await (await owner.get('/api/admin/organizations', { params: { q: COMPANY } })).json()
    expect(listed.rows).toEqual([expect.objectContaining({ id: orgId, registrationSource: 'self_service', status: 'active' })])

    // Política de acceso: suspender corta la sesión abierta y el login lo explica; reactivar la devuelve.
    expect((await owner.put(`/api/admin/organizations/${orgId}`, { data: { status: 'suspended' } })).ok()).toBeTruthy()
    expect((await (await page.request.get('/api/auth/me')).json()).user).toBeNull()
    const denied = await pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: ip(3) })
    const login = await denied.post('/api/auth/login', { data: { email: EMAIL, password: PASSWORD } })
    expect(login.status()).toBe(403)
    expect((await login.json()).statusMessage).toContain('suspendido')
    await denied.dispose()
    expect((await owner.put(`/api/admin/organizations/${orgId}`, { data: { status: 'active' } })).ok()).toBeTruthy()
    expect((await (await page.request.get('/api/auth/me')).json()).user?.email).toBe(EMAIL)
    await context.close()
  })

  test('el endpoint público rechaza rol, permisos, tenant y similares', async () => {
    const fields = ['role', 'permissions', 'isSuperAdmin', 'tenantId', 'organizationId', 'accessLevel']
    for (const [i, field] of fields.entries()) {
      // Una IP por intento: seis desde la misma agotarían el límite de 5 por hora.
      const res = await registerApi({ name: `Escalada ${RUN}`, email: `escalada-${field}-${RUN}@example.com`, password: PASSWORD, passwordConfirm: PASSWORD, [field]: field === 'role' ? 'super_admin' : 1 }, ip(10 + i))
      expect(res.status, field).toBe(400)
    }
    const listed = await (await owner.get('/api/admin/organizations', { params: { q: `Escalada ${RUN}` } })).json()
    expect(listed.total).toBe(0)
  })

  test('correo duplicado → 409 claro; doble envío simultáneo → una sola empresa', async () => {
    const dup = await registerApi({ name: `Duplicada ${RUN}`, email: EMAIL.toUpperCase(), password: PASSWORD, passwordConfirm: PASSWORD }, ip(40))
    expect(dup.status).toBe(409)
    expect(dup.body.error).toMatchObject({ field: 'email' })

    const twinEmail = `gemela-${RUN}@example.com`
    const payload = { name: `Gemela ${RUN}`, email: twinEmail, password: PASSWORD, passwordConfirm: PASSWORD }
    const results = await Promise.all([registerApi(payload, ip(41)), registerApi(payload, ip(42))])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const listed = await (await owner.get('/api/admin/organizations', { params: { q: `Gemela ${RUN}` } })).json()
    expect(listed.total).toBe(1)
  })

  test('si el proveedor de email falla, la empresa se crea igual y la pantalla no dice «enviado»', async () => {
    const res = await registerApi({ name: `Sin email ${RUN}`, email: `sin-email-${RUN}+fail@example.com`, password: PASSWORD, passwordConfirm: PASSWORD }, ip(50))
    expect(res.status).toBe(200)
    expect(res.body.welcomeEmail).not.toBe('sent')
    const listed = await (await owner.get('/api/admin/organizations', { params: { q: `Sin email ${RUN}` } })).json()
    expect(listed.total).toBe(1)
  })

  test('límite por IP: el registro se corta tras 5 intentos en la hora', async () => {
    const headers = { 'cf-connecting-ip': RUN_IP }
    const statuses: number[] = []
    for (let i = 0; i < 12 && !statuses.includes(429); i++) {
      statuses.push((await registerApi({ name: '', email: 'x', password: 'x', passwordConfirm: 'y' }, headers)).status)
    }
    expect(statuses).toContain(429)
    expect(statuses.slice(0, 5)).not.toContain(429)
  })
})
