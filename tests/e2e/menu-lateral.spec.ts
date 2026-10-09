import { test, expect, request as pwRequest, type Page } from '@playwright/test'
import { STATE_A, ANON_STATE } from './global-setup'

/**
 * Menú lateral en categorías desplegables (utils/adminNav.ts,
 * layouts/admin.vue). Recorrido del megaprompt: Dashboard → Portal Web →
 * Propiedades (web) → Constructor Web → Blog & CMS → Artículos → Categorías →
 * Finanzas & Growth → Facturación → Sistema → Empresas, comprobando en cada
 * paso la URL, la entrada activa y la categoría abierta. Además: enlace
 * directo, teclado, lo que se recuerda al recargar y un usuario restringido.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

function group(page: Page, id: string) {
  return page.getByTestId(`nav-group-${id}`)
}
function items(page: Page, id: string) {
  return page.getByTestId(`nav-group-items-${id}`)
}
async function expectOpen(page: Page, id: string, open: boolean) {
  await expect(group(page, id)).toHaveAttribute('aria-expanded', String(open))
  if (open) await expect(items(page, id)).toBeVisible()
  else await expect(items(page, id)).toBeHidden()
}
async function expectActive(page: Page, groupId: string, label: string) {
  const link = items(page, groupId).getByRole('link', { name: label, exact: true })
  await expect(link).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('admin-nav').locator('[aria-current="page"]')).toHaveCount(1)
  await expect(group(page, groupId)).toHaveClass(/nav-group-active/)
}

test.describe('Menú lateral — categorías desplegables', () => {
  test.use({ storageState: STATE_A })

  test('recorrido completo: cada categoría se abre y se cierra, la página actual queda marcada y su categoría abierta', async ({ page }) => {
    await page.goto('/admin')
    await page.evaluate(() => localStorage.removeItem('sa_admin_nav_open'))
    await page.reload()

    // Al entrar: sólo «General» (con el Dashboard) abierta; el resto, cerradas.
    await expectOpen(page, 'general', true)
    for (const id of ['crm', 'web', 'finance', 'cms', 'inbox', 'system']) await expectOpen(page, id, false)
    await expectActive(page, 'general', 'Dashboard')
    // Mucho menos menú: con todo cerrado cabe sin apenas desplazamiento.
    const nav = page.getByTestId('admin-nav')
    const closedHeight = await nav.evaluate((el) => el.scrollHeight)

    // Portal Web → Propiedades (web).
    await group(page, 'web').click()
    await expectOpen(page, 'web', true)
    await items(page, 'web').getByRole('link', { name: 'Propiedades (web)', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/developer-properties$/)
    await expectActive(page, 'web', 'Propiedades (web)')

    // → Constructor Web (pantalla completa, sin menú) y vuelta.
    await items(page, 'web').getByRole('link', { name: 'Constructor Web', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/site-builder$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/admin\/developer-properties$/)
    await expectOpen(page, 'web', true)

    // Cerrar Portal Web.
    await group(page, 'web').click()
    await expectOpen(page, 'web', false)

    // Blog & CMS → Artículos → Categorías.
    await group(page, 'cms').click()
    await items(page, 'cms').getByRole('link', { name: 'Artículos', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/cms\/articles$/)
    // Sólo «Artículos» marcada, no también el Dashboard del blog (/admin/cms).
    await expectActive(page, 'cms', 'Artículos')
    await items(page, 'cms').getByRole('link', { name: 'Categorías', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/cms-categories$/)
    await expectActive(page, 'cms', 'Categorías')
    await expect(items(page, 'cms').getByRole('link', { name: 'Blog (legacy)', exact: true })).toBeVisible()
    await group(page, 'cms').click()
    await expectOpen(page, 'cms', false)

    // Finanzas & Growth → Facturación.
    await group(page, 'finance').click()
    await items(page, 'finance').getByRole('link', { name: 'Facturación', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/facturacion$/)
    await expectActive(page, 'finance', 'Facturación')

    // Sistema → Empresas (con su «+ Nuevo»), y API ahora vive aquí.
    await group(page, 'system').click()
    await expect(items(page, 'system').getByRole('link', { name: 'API', exact: true })).toBeVisible()
    await items(page, 'system').getByRole('link', { name: 'Empresas', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/organizations$/)
    await expectActive(page, 'system', 'Empresas')
    await expect(page.getByRole('link', { name: '+ Nuevo' })).toBeVisible()

    // Con varias categorías abiertas el menú crece y se puede desplazar.
    for (const id of ['crm', 'web', 'cms']) if ((await group(page, id).getAttribute('aria-expanded')) === 'false') await group(page, id).click()
    expect(await nav.evaluate((el) => el.scrollHeight)).toBeGreaterThan(closedHeight)
    // El pie (cuenta, salir, vista previa) sigue en su sitio.
    await expect(page.getByTestId('nav-mi-cuenta')).toBeVisible()
  })

  test('un enlace directo abre su categoría y marca su entrada; el teclado abre y cierra; lo abierto se recuerda al recargar', async ({ page }) => {
    await page.goto('/admin')
    await page.evaluate(() => localStorage.removeItem('sa_admin_nav_open'))

    await page.goto('/admin/cms-tags')
    await expectOpen(page, 'cms', true)
    await expectActive(page, 'cms', 'Etiquetas')
    await expectOpen(page, 'web', false)

    // Teclado: Enter y Espacio sobre la cabecera de la categoría.
    await group(page, 'web').focus()
    await page.keyboard.press('Enter')
    await expectOpen(page, 'web', true)
    await page.keyboard.press('Space')
    await expectOpen(page, 'web', false)
    await page.keyboard.press('Enter')
    await expect(group(page, 'web')).toHaveAttribute('aria-controls', 'nav-group-web')

    // Portal Web y Blog abiertos; al ir a Leads se abre además CRM; al recargar sigue igual.
    await page.goto('/admin/leads')
    await expectOpen(page, 'crm', true)
    await page.reload()
    for (const id of ['web', 'cms', 'crm']) await expectOpen(page, id, true)
    await expectActive(page, 'crm', 'Leads')

    // Cerrada y guardada así, la categoría de la página a la que se llega se abre igualmente.
    await group(page, 'finance').click()
    await group(page, 'finance').click()
    await expectOpen(page, 'finance', false)
    await page.goto('/admin/facturacion')
    await expectOpen(page, 'finance', true)
    await expectActive(page, 'finance', 'Facturación')
  })

  test('un comercial con sólo CRM ve el CRM y la Ayuda, nunca una categoría vacía ni Sistema', async ({ browser }) => {
    const a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const email = `menu-${RUN}@sa-inmobiliaria.com`
    const password = `Menu-${RUN}-xyz`
    const created = await a.post('/api/admin/users', { data: { name: `Menú ${RUN}`, email, password, role: 'admin', permissions: '["crm:read"]' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const userId = (await created.json()).id
    try {
      const context = await browser.newContext({ baseURL: BASE_URL, storageState: ANON_STATE, extraHTTPHeaders: { 'cf-connecting-ip': `198.51.100.${(Date.now() % 200) + 20}` } })
      const login = await context.request.post('/api/auth/login', { data: { email, password } })
      expect(login.ok(), await login.text()).toBeTruthy()
      const page = await context.newPage()
      await page.goto('/admin/leads')
      await expect(page.getByTestId('admin-nav')).toBeVisible()
      const groups = await page.getByTestId('admin-nav').locator('[data-testid^="nav-group-"][aria-controls]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
      expect(groups).toEqual(['nav-group-crm', 'nav-group-help'])
      await expectActive(page, 'crm', 'Leads')
      // «Comerciales» está en CRM, pero es de Portal Web: no la ve.
      await expect(items(page, 'crm').getByRole('link', { name: 'Comerciales', exact: true })).toHaveCount(0)
      await context.close()
    } finally {
      await a.delete(`/api/admin/users/${userId}`)
      await a.dispose()
    }
  })

  test('en el móvil el menú es un cajón y las categorías se despliegan igual', async ({ browser }) => {
    const context = await browser.newContext({ storageState: STATE_A, viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    await page.goto('/admin/visitas')
    await page.locator('button:has(svg path[d="M4 7h16M4 12h16M4 17h16"])').click()
    await expectOpen(page, 'crm', true)
    await expectActive(page, 'crm', 'Visitas')
    await group(page, 'web').click()
    await expectOpen(page, 'web', true)
    await items(page, 'web').getByRole('link', { name: 'Comunidades', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/communities$/)
    await context.close()
  })
})
