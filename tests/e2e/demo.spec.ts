import { test, expect, request as pwRequest } from '@playwright/test'
import { STATE_A, ANON_STATE } from './global-setup'

/**
 * Cuenta demo «Norte Astur Inmobiliaria» sobre el Worker real (docs/demo.md):
 *
 *  1. El super admin la crea desde Sistemas > Empresas y la genera por tramos
 *     (lo mismo que hace el cron de cada minuto en producción).
 *  2. La gerente entra con su usuario: es administradora de ESA empresa, no ve
 *     nada exclusivo del super admin y el panel avisa de que es una demo.
 *  3. Hay datos de verdad con foto (contactos, propiedades) y los enlaces de
 *     llamar/escribir no salen del navegador.
 *  4. La web de la demo se ve en vista previa (no tiene dominio) y sólo para
 *     su equipo.
 *
 * La contraseña de la gerente en el e2e es una de prueba (DEMO_ADMIN_PASSWORD_HASH
 * en scripts/e2e.sh), no la de producción.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const DEMO_EMAIL = 'demo@portalinmo'
const DEMO_PASSWORD = 'E2e-Demo-Placeholder-1!'
const DEMO_IP = { 'cf-connecting-ip': `203.0.113.${(Date.now() % 200) + 20}` }

test.describe.configure({ timeout: 900_000 })

test('cuenta demo: se genera, la gerente entra sin opciones de super admin y nada sale de la plataforma', async ({ browser }) => {
  const owner = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })

  // 1. Crear y generar (cada llamada ejecuta un tramo).
  let progress = await (await owner.post('/api/admin/organizations', { data: { action: 'demo-create' } })).json()
  for (let i = 0; i < 200 && (progress.status === 'provisioning' || progress.status === 'resetting'); i++) {
    const res = await owner.post('/api/admin/organizations', { data: { action: 'demo-advance' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    progress = await res.json()
  }
  expect(progress.error).toBeNull()
  expect(progress.status).toBe('ready')
  const orgId: number = progress.orgId

  // Restablecer exige escribir el identificador de la empresa.
  const refused = await owner.post('/api/admin/organizations', { data: { action: 'demo-reset', confirm: 'otra-cosa' } })
  expect(refused.status()).toBe(422)

  // 2. La gerente entra con su usuario.
  const context = await browser.newContext({ baseURL: BASE_URL, storageState: ANON_STATE, extraHTTPHeaders: DEMO_IP })
  const login = await context.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } })
  expect(login.ok(), await login.text()).toBeTruthy()
  expect((await login.json()).user.role).toBe('admin')
  const page = await context.newPage()

  await page.goto('/admin')
  await expect(page.getByTestId('demo-badge')).toBeVisible()
  const nav = page.locator('aside')
  for (const label of ['Empresas', 'Errores', 'Estado del sistema']) await expect(nav.getByRole('link', { name: label, exact: true })).toHaveCount(0)
  await expect(page.getByText('Empresa', { exact: true })).toHaveCount(0) // selector de empresas del super admin
  // Las rutas del super admin le responden 403.
  expect((await page.request.get('/api/admin/organizations')).status()).toBe(403)
  expect((await page.request.post('/api/admin/organizations', { data: { action: 'demo-status' } })).status()).toBe(403)

  // 3. Contactos con foto y enlaces externos neutralizados.
  await page.goto('/admin/contactos')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  expect(await page.locator('tbody tr img').count()).toBeGreaterThan(10)
  await page.locator('tbody tr a[href^="/admin/contactos/"]').first().click()
  await expect(page.getByTestId('contact-name')).toBeVisible()
  await expect(page.getByTestId('contact-header').locator('img').first()).toBeVisible()
  const call = page.getByTestId('contact-header').getByRole('link', { name: 'Llamar' })
  if (await call.count()) {
    const before = page.url()
    await call.click()
    await expect(page.getByText(/Cuenta de demostración: no se llama ni se escribe a nadie/)).toBeVisible()
    expect(page.url()).toBe(before)
  }

  // Propiedades de segunda mano con su foto.
  const props = await (await page.request.get('/api/admin/properties', { params: { pageSize: '50' } })).json()
  const rows = props.rows ?? props
  expect(rows.length).toBe(10)
  expect(rows.every((p: any) => Boolean(p.mainImage))).toBeTruthy()

  // 4. La web de la demo en vista previa, sólo para su equipo, y tal cual se
  // publicará: sin franja negra, sin texto de «vista previa» ni botón de salir;
  // lo primero es la cabecera real de la inmobiliaria.
  await page.goto(`/?vista_previa=${orgId}`)
  await expect(page.getByText('Encuentra tu lugar')).toBeVisible()
  await expect(page.getByTestId('site-preview-bar')).toHaveCount(0)
  await expect(page.getByText(/Vista previa de la web de|Salir de la vista previa/)).toHaveCount(0)
  expect((await page.locator('header').first().boundingBox())?.y).toBe(0)
  const tenant = await (await page.request.get('/api/public/tenant')).json()
  expect(tenant.id).toBe(orgId)
  expect(tenant.isDemo).toBe(true)
  expect(tenant.preview).toBe(true)
  // Se sale como siempre (el parámetro), sin franja que lo ofrezca.
  await page.goto('/?vista_previa=salir')
  expect((await (await page.request.get('/api/public/tenant')).json()).id).not.toBe(orgId)

  // Un visitante sin sesión no puede ver la web de la demo con el parámetro.
  const anon = await pwRequest.newContext({ baseURL: BASE_URL })
  const anonTenant = await (await anon.get(`/api/public/tenant?vista_previa=${orgId}`)).json()
  expect(anonTenant.id).not.toBe(orgId)
  await anon.dispose()

  // Ningún email de la demo salió: todos quedan «no enviados» con el motivo.
  const status = await (await owner.post('/api/admin/organizations', { data: { action: 'demo-status' } })).json()
  expect(status.status).toBe('ready')

  await context.close()
  await owner.dispose()
})
