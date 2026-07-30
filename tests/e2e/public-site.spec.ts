import { test, expect } from '@playwright/test'

test.describe('Sitio público', () => {
  test('la raíz muestra la landing SaaS, no el portal inmobiliario', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.sa-landing')).toBeVisible()
    await expect(page.getByRole('link', { name: /acceder/i }).first()).toHaveAttribute('href', '/admin/login')
  })

  test('el portal de demo carga en /demo', async ({ page }) => {
    await page.goto('/demo')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator('body')).not.toContainText('404')
  })

  test('el listado de propiedades demo carga y enlaza fichas', async ({ page }) => {
    await page.goto('/demo/properties')
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('las rutas legacy sin /demo redirigen (301) a /demo/*', async ({ request }) => {
    const res = await request.get('/properties', { maxRedirects: 0 })
    expect([301, 302]).toContain(res.status())
    expect(res.headers()['location']).toContain('/demo/properties')
  })
})
