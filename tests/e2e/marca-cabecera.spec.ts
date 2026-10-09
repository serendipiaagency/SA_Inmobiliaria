import { test, expect, request as pwRequest } from '@playwright/test'
import { STATE_A, ANON_STATE } from './global-setup'

/**
 * Cabecera y pie de la web: con logo subido, el nombre de la empresa va a la
 * derecha del logo (components/Logo.vue). Antes sólo salía el logo y el nombre
 * no aparecía en ninguna parte de la cabecera, tampoco sobre el Hero.
 *
 * Cambia el logo y el nombre comercial de la agencia A y los deja como
 * estaban al terminar.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

test('con logo, la cabecera (también sobre el Hero) y el pie enseñan el logo y, a su derecha, el nombre de la empresa', async ({ browser }) => {
  const a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  const org = await (await a.get('/api/admin/active-org-info')).json()
  const { row: original } = await (await a.get(`/api/admin/organizations/${org.id}`)).json()

  try {
    const upload = await a.post('/api/admin/upload', { multipart: { file: { name: 'logo.png', mimeType: 'image/png', buffer: PNG }, folder: 'site-builder' } })
    expect(upload.ok(), await upload.text()).toBeTruthy()
    const { key } = await upload.json()
    const put = await a.put(`/api/admin/organizations/${org.id}`, { data: { name: original.name, companyName: 'Marca Prueba Inmobiliaria', logo: key } })
    expect(put.ok(), await put.text()).toBeTruthy()

    // Web pública de la agencia (en el dominio principal, «/» es la portada de la plataforma).
    const context = await browser.newContext({ storageState: ANON_STATE })
    const page = await context.newPage()
    await page.goto('/propiedades')
    const header = page.locator('header').first().getByTestId('brand-lockup')
    await expect(header).toBeVisible()
    await expect(header.locator('img')).toBeVisible()
    await expect(header).toContainText('Marca')
    await expect(header).toContainText('Prueba Inmobiliaria')
    // El nombre va a la DERECHA del logo, en la misma línea.
    const img = (await header.locator('img').boundingBox())!
    const name = (await header.getByText('Marca', { exact: true }).boundingBox())!
    expect(name.x).toBeGreaterThanOrEqual(img.x + img.width)
    expect(Math.abs(name.y + name.height / 2 - (img.y + img.height / 2))).toBeLessThan(img.height)
    // El enlace a la portada se anuncia con el nombre, no con un logo sin texto.
    await expect(page.locator('header').first().getByRole('link', { name: /Marca/ }).first()).toBeVisible()
    await expect(page.locator('footer').getByTestId('brand-lockup')).toContainText('Marca')
    await context.close()

    // La portada de la agencia, con la cabecera transparente sobre el Hero: el nombre, en blanco.
    const owner = await browser.newContext({ storageState: STATE_A })
    const home = await owner.newPage()
    await home.goto(`/?vista_previa=${org.id}`)
    const overHero = home.locator('header').first().getByTestId('brand-lockup')
    await expect(overHero).toBeVisible()
    await expect(overHero).toContainText('Marca')
    await expect(overHero.locator('.mm-word')).toHaveCSS('color', 'rgb(253, 252, 250)')
    await owner.close()
  } finally {
    await a.put(`/api/admin/organizations/${org.id}`, { data: { name: original.name, companyName: original.companyName ?? null, logo: original.logo ?? null } })
    await a.dispose()
  }
})
