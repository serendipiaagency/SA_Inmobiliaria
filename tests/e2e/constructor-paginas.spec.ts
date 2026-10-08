import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Constructor Web › Páginas (utils/siteBuilder/pages.ts): cada página de la
 * lista se abre en el lienzo para editarla, se publica por separado y sólo
 * entonces cambia en la web; las páginas funcionales tienen una zona
 * dinámica que sólo se mueve; «Volver a la página original» deshace lo
 * publicado. Al terminar, las páginas tocadas vuelven a su estado original.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const CANVAS = 'iframe[title="Vista previa del Constructor Web"]'
const TOUCHED = ['nosotros', 'propiedades', 'servicios']
const RUN = `${Date.now()}`.slice(-6)

test.describe('Constructor Web — páginas editables', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let orgId: number

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    orgId = (await (await a.get('/api/admin/active-org-info')).json()).id
    // Punto de partida conocido: cada página tocada, en su versión original.
    for (const key of TOUCHED) expect((await a.delete(`/api/admin/site-pages/${key}`)).ok()).toBeTruthy()
  })

  test.afterAll(async () => {
    for (const key of TOUCHED) await a.delete(`/api/admin/site-pages/${key}`)
    await a?.dispose()
  })

  test('«Nosotros» se abre desde la lista con su contenido real, se edita y sólo cambia en la web al publicar', async ({ page }) => {
    const title = `Somos de Asturias ${RUN}`
    await page.goto('/admin/site-builder')
    const pages = page.getByTestId('site-pages')
    await expect(pages.getByTestId('site-page-home')).toHaveAttribute('aria-current', 'page')

    await pages.getByTestId('site-page-nosotros').click()
    await expect(page).toHaveURL(/\/admin\/site-builder\?pagina=nosotros$/)
    await expect(pages.getByTestId('site-page-nosotros')).toHaveAttribute('aria-current', 'page')
    await expect(pages.getByTestId('site-page-status-nosotros')).toHaveText('Original')
    // El lienzo enseña la página de siempre, ya hecha secciones.
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.getByText('Te guiamos hacia lo extraordinario.')).toBeVisible({ timeout: 10_000 })
    await expect(canvas.getByRole('link', { name: 'Ver proyectos' })).toBeVisible()

    // Editar el título desde el inspector.
    await page.locator('[data-block-row="text-nosotros"]').click()
    const inspector = page.locator('aside.border-l')
    await inspector.getByRole('textbox', { name: 'Título', exact: true }).fill(title)
    await expect(canvas.getByText(title)).toBeVisible()
    await expect.poll(async () => (await (await a.get('/api/admin/site-pages/nosotros')).json()).blocks[0].content.title, { timeout: 10_000 }).toBe(title)

    // Borrador guardado, web sin cambiar.
    const before = await page.context().newPage()
    await before.goto(`/nosotros?vista_previa=${orgId}`)
    await expect(before.getByText('Te guiamos hacia lo extraordinario.')).toBeVisible()
    await expect(before.getByText(title)).toHaveCount(0)

    await page.getByRole('button', { name: 'Publicar cambios' }).click()
    await expect(pages.getByTestId('site-page-status-nosotros')).toHaveText('Publicada')
    await before.reload()
    await expect(before.getByText(title)).toBeVisible()
    await expect(before.getByText('Te guiamos hacia lo extraordinario.')).toHaveCount(0)
    await before.close()

    // Recargar el editor vuelve a la misma página.
    await page.reload()
    await expect(pages.getByTestId('site-page-nosotros')).toHaveAttribute('aria-current', 'page')
    await expect(canvas.getByText(title)).toBeVisible({ timeout: 10_000 })

    // Volver a la original: la web enseña la de siempre otra vez.
    await page.getByTestId('site-page-reset').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Volver a la original' }).click()
    await expect(canvas.getByText('Te guiamos hacia lo extraordinario.')).toBeVisible({ timeout: 10_000 })
    await expect(pages.getByTestId('site-page-status-nosotros')).toHaveText('Original')
    const after = await page.context().newPage()
    await after.goto(`/nosotros?vista_previa=${orgId}`)
    await expect(after.getByText('Te guiamos hacia lo extraordinario.')).toBeVisible()
    await after.close()

    // Y de vuelta a Inicio, con la portada intacta.
    const home = await (await a.get('/api/admin/site-pages/home')).json()
    await pages.getByTestId('site-page-home').click()
    await expect(page).toHaveURL(/\/admin\/site-builder$/)
    await expect(page.locator('[data-block-row]')).toHaveCount(home.blocks.length)
  })

  test('«Propiedades»: la zona dinámica sólo se mueve, y las secciones añadidas salen con el listado real', async ({ page }) => {
    await page.goto('/admin/site-builder?pagina=propiedades')
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.getByTestId('page-core-preview')).toBeVisible({ timeout: 10_000 })
    await expect(canvas.getByTestId('page-core-preview')).toHaveAttribute('data-core', 'properties-listing')

    // Una sola fila, con candado y sin botones de ocultar/duplicar/eliminar.
    const rows = page.locator('[data-block-row]')
    await expect(rows).toHaveCount(1)
    await expect(rows.first().locator('[title="Eliminar"]')).toHaveCount(0)
    await rows.first().click()
    await expect(page.getByTestId('page-core-inspector')).toBeVisible()
    // Ni con el teclado.
    await page.keyboard.press('Delete')
    await expect(page.getByText('La zona dinámica no se puede eliminar')).toBeVisible()
    await expect(rows).toHaveCount(1)
    // En el lienzo, su barra sólo deja moverla y añadir debajo.
    const toolbar = canvas.locator('[data-block-toolbar]')
    await expect(toolbar.locator('[title="Subir"]')).toBeVisible()
    await expect(toolbar.locator('[title="Eliminar"]')).toHaveCount(0)
    await expect(toolbar.locator('[title="Duplicar"]')).toHaveCount(0)

    // Una llamada a la acción encima del listado.
    await page.getByTitle('Añadir sección').click()
    await page.getByTestId('section-library').getByRole('button', { name: 'Contenido', exact: true }).click()
    await page.getByTestId('section-library').getByText('Llamada a la acción', { exact: true }).click()
    await expect(rows).toHaveCount(2)
    await page.locator('aside.border-l').getByRole('textbox', { name: 'Título', exact: true }).fill(`Vende con nosotros ${RUN}`)
    // Subirla por encima de la zona dinámica (queda seleccionada al añadirla).
    await canvas.locator('[data-block-toolbar] [title="Subir"]').click()
    await expect(rows.first()).toContainText('Llamada a la acción')
    await expect
      .poll(async () => (await (await a.get('/api/admin/site-pages/propiedades')).json()).blocks.map((b: any) => b.type), { timeout: 10_000 })
      .toEqual(['cta', 'page-core'])

    await page.getByRole('button', { name: 'Publicar cambios' }).click()
    await expect(page.getByTestId('site-page-status-propiedades')).toHaveText('Publicada')

    // La web: la sección nueva y, debajo, el buscador y el listado de siempre.
    const pub = await page.context().newPage()
    await pub.goto(`/propiedades?vista_previa=${orgId}`)
    const cta = pub.getByText(`Vende con nosotros ${RUN}`)
    await expect(cta).toBeVisible()
    const filters = pub.getByRole('button', { name: /Filtros/ }).first()
    await expect(filters).toBeVisible()
    const top = (el: Element) => el.getBoundingClientRect().top + window.scrollY
    expect(await cta.evaluate(top), 'la sección va encima del listado').toBeLessThan(await filters.evaluate(top))
    await pub.close()
  })

  test('la API no deja quitar la zona dinámica ni abrir páginas que no existen; «Servicios» no existe hasta publicarla', async () => {
    const noCore = await a.put('/api/admin/site-pages/propiedades', { data: { blocks: [{ id: 'cta-x', type: 'cta', version: 1, content: {} }], seo: {} } })
    expect(noCore.status()).toBe(422)
    expect((await a.get('/api/admin/site-pages/otra-pagina')).status()).toBe(404)
    expect((await a.delete('/api/admin/site-pages/home')).status()).toBe(422)

    const home = await (await a.get('/api/admin/site-pages/home')).json()
    expect(home.pages.map((p: any) => p.pageKey)).toEqual(['home', 'propiedades', 'ficha-propiedad', 'vender', 'nosotros', 'servicios', 'contacto', 'blog'])

    expect((await a.get(`/servicios?vista_previa=${orgId}`)).status()).toBe(404)
    expect((await a.post('/api/admin/site-pages/servicios/publish')).ok()).toBeTruthy()
    const servicios = await a.get(`/servicios?vista_previa=${orgId}`)
    expect(servicios.status()).toBe(200)
    expect(await servicios.text()).toContain('Lo que hacemos por ti')
  })
})
