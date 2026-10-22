import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * «Carteles de escaparate» (Cola 20): plantillas, piezas y exportación a PDF,
 * sobre HTTP real y el panel. El módulo es independiente pero reutiliza el
 * renderizador pdf-lib. Comprueba el flujo (crear plantilla → publicar →
 * aplicar a una propiedad → exportar PDF real) y el aislamiento entre
 * agencias (lo ajeno = 404).
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('Carteles de escaparate', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let assetId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    const res = await a.post('/api/admin/properties', { data: { slug: `cartel-${RUN}`, status: 'available', transactionType: 'sale', propertyType: 'Apartment', city: 'Madrid', community: `Chamberí Cartel ${RUN}`, price: 395000, area: 95, bedrooms: 3, bathrooms: 2 } })
    expect(res.ok(), await res.text()).toBeTruthy()
    assetId = (await res.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/properties/${assetId}?hard=1`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {})
    await a.dispose()
    await b.dispose()
  })

  test('crear plantilla → publicar → aplicar a una propiedad → exportar PDF real; aislamiento', async () => {
    // Crear plantilla propia (se crea con un diseño de partida) y publicarla.
    const created = await a.post('/api/admin/carteles/templates', { data: { name: `Cartel A3 ${RUN}`, formatKey: 'print_a3_portrait' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const template = await created.json()
    expect(template.structure.pages[0].elements.length).toBeGreaterThan(0) // diseño de partida
    cleanup.push(() => a.delete(`/api/admin/carteles/templates/${template.id}`))

    const published = await a.patch(`/api/admin/carteles/templates/${template.id}`, { data: { status: 'published' } })
    expect(published.ok(), await published.text()).toBeTruthy()

    // La agencia B no ve la plantilla de A.
    expect((await b.get(`/api/admin/carteles/templates/${template.id}`)).status()).toBe(404)
    // Un formato que no es de cartel se rechaza.
    expect((await a.post('/api/admin/carteles/templates', { data: { name: 'x', formatKey: 'social_story' } })).status()).toBe(422)

    // Crear una pieza aplicando la plantilla a la propiedad (2ª mano).
    const projRes = await a.post('/api/admin/carteles/projects', { data: { templateId: template.id, assetKind: 'agent_property', assetId } })
    expect(projRes.ok(), await projRes.text()).toBeTruthy()
    const project = await projRes.json()
    cleanup.push(() => a.delete(`/api/admin/carteles/projects/${project.id}`))
    expect(project).toMatchObject({ assetKind: 'agent_property', assetId, formatKey: 'print_a3_portrait' })

    // La agencia B no ve la pieza de A.
    expect((await b.get(`/api/admin/carteles/projects/${project.id}`)).status()).toBe(404)

    // Exportar a PDF: render + descarga real.
    const render = await a.post(`/api/admin/carteles/projects/${project.id}/render`)
    expect(render.ok(), await render.text()).toBeTruthy()
    const { downloadUrl } = await render.json()
    expect(downloadUrl).toContain('/api/admin/carteles/renders/')

    const pdf = await a.get(downloadUrl)
    expect(pdf.ok()).toBeTruthy()
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')

    // La descarga ajena = 404.
    expect((await b.get(downloadUrl)).status()).toBe(404)
  })

  test('el panel: plantillas y carteles cargan y crean desde la interfaz', async ({ page }) => {
    await page.goto('/admin/plantillas')
    await page.getByTestId('plantillas-tab-cartel').click()
    await expect(page.getByTestId('poster-templates')).toBeVisible()
    await page.getByTestId('poster-template-new').click()
    await page.getByTestId('poster-template-name').fill(`UI Cartel ${RUN}`)
    await page.getByTestId('poster-template-create').click()
    await expect(page.getByText(`UI Cartel ${RUN}`)).toBeVisible()

    await page.goto('/admin/carteles/piezas')
    await expect(page.getByTestId('poster-projects')).toBeVisible()
    await expect(page.getByTestId('poster-new')).toBeVisible()
  })
})
