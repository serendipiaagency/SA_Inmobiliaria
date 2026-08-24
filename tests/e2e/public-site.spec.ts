import { test, expect } from '@playwright/test'

test.describe('Sitio público', () => {
  test('la raíz muestra la landing SaaS, no el portal inmobiliario (dominio primario)', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.sa-landing')).toBeVisible()
    await expect(page.getByRole('link', { name: /acceder/i }).first()).toHaveAttribute('href', '/admin/login')
  })

  test('el listado de propiedades carga en /propiedades y enlaza fichas', async ({ page }) => {
    // Checks the real HTTP status, not a body-text substring match — property
    // fixtures include epoch-timestamp ids/slugs, and a plain "not.toContainText('404')"
    // check is a false positive waiting to happen the moment one of those
    // timestamps happens to end in 404.
    const res = await page.goto('/propiedades')
    expect(res?.status()).toBe(200)
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('las rutas legacy redirigen (301) directamente a las URLs limpias', async ({ request }) => {
    const res = await request.get('/properties', { maxRedirects: 0 })
    expect([301, 302]).toContain(res.status())
    expect(res.headers()['location']).toContain('/propiedades')

    const resDemo = await request.get('/demo/properties', { maxRedirects: 0 })
    expect([301, 302]).toContain(resDemo.status())
    expect(resDemo.headers()['location']).toContain('/propiedades')
  })

  test('las URLs limpias cargan directamente (200), sin pasar por /demo', async ({ request }) => {
    for (const path of ['/', '/propiedades', '/mapa', '/zonas', '/promotoras', '/equipo', '/blog', '/contacto']) {
      const res = await request.get(path)
      expect(res.status(), `${path} debería responder 200`).toBeLessThan(400)
    }
  })
})
