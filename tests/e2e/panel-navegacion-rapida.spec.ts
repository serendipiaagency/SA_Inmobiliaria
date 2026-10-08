import { test, expect, type Page } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Navegación rápida por el panel con la latencia de producción (#106). En
 * local la API responde en milisegundos y estas carreras no se ven; en
 * producción cada petición tarda cientos. Aquí se retrasan las de
 * `/api/admin/*` y se pulsa la siguiente entrada del menú sin esperar a que
 * la anterior termine de cargar, como hace quien busca algo en el menú.
 * Cada destino tiene que acabar cargado: ni «Esta página no existe» ni un
 * contenido en blanco.
 */

const DELAY_MS = 900

async function slowAdminApi(page: Page) {
  await page.route('**/api/admin/**', async (route) => {
    await new Promise((r) => setTimeout(r, DELAY_MS))
    await route.continue()
  })
}
async function openGroup(page: Page, id: string) {
  const b = page.getByTestId(`nav-group-${id}`)
  if ((await b.getAttribute('aria-expanded')) === 'false') await b.click()
}
const link = (page: Page, gid: string, to: string) => page.getByTestId(`nav-group-items-${gid}`).locator(`a[href="${to}"]`).first()

const SCENARIOS: { name: string; start: string; steps: [string, string][]; target: [string, string, string] }[] = [
  { name: 'Oficinas → Equipos → Propiedades (web)', start: '/admin/leads', steps: [['crm', '/admin/offices'], ['crm', '/admin/teams']], target: ['web', '/admin/developer-properties', 'Propiedades (web)'] },
  { name: 'Etiquetas → Autores → Media Library', start: '/admin/cms', steps: [['cms', '/admin/cms-tags'], ['cms', '/admin/cms-authors']], target: ['cms', '/admin/cms/media', 'Media Library'] },
  { name: 'Comentarios → Redirecciones → Papelera', start: '/admin/cms', steps: [['cms', '/admin/cms-comments'], ['cms', '/admin/cms-redirects']], target: ['cms', '/admin/cms/papelera', 'Papelera'] },
  { name: 'Comerciales → Oficinas → Equipos (genéricas seguidas)', start: '/admin/leads', steps: [['crm', '/admin/comerciales'], ['crm', '/admin/offices']], target: ['crm', '/admin/teams', 'Equipos'] },
]

test.describe('Web pública — navegación rápida con latencia de producción', () => {
  test('Propiedades (sin terminar de cargar) → Blog: el blog carga', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/nosotros')
    await page.waitForFunction(() => (window as any).useNuxtApp?.()?.isHydrating === false)
    await page.route('**/api/public/**', async (route) => {
      await new Promise((r) => setTimeout(r, DELAY_MS))
      await route.continue()
    })
    const header = page.locator('header').first()
    await header.locator('a[href^="/propiedades"]').first().click()
    await expect(page).toHaveURL(/\/propiedades/)
    await header.locator('a[href="/blog"]').first().click()
    await expect(page).toHaveURL(/\/blog$/)
    await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Panel — navegación rápida con latencia de producción', () => {
  test.use({ storageState: STATE_A })

  for (const s of SCENARIOS) {
    test(`${s.name}: la página pulsada carga`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(s.start)
      await page.waitForFunction(() => (window as any).useNuxtApp?.()?.isHydrating === false)
      await slowAdminApi(page)
      for (const g of new Set([...s.steps.map((x) => x[0]), s.target[0]])) await openGroup(page, g)
      for (const [g, to] of s.steps) {
        await link(page, g, to).click()
        // Sólo hasta que el menú marca la entrada: la página sigue cargando.
        await expect(page.getByTestId('admin-nav').locator(`[aria-current="page"][href="${to}"]`)).toHaveCount(1)
      }
      const [g, to, h1] = s.target
      await link(page, g, to).click()
      await expect(page).toHaveURL(new RegExp(`${to.replace(/\//g, '\\/')}$`))
      await expect(page.locator('main h1', { hasText: h1 }).first()).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('Esta página no existe')).toHaveCount(0)
    })
  }
})
