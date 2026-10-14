import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, ANON_STATE } from './global-setup'

/**
 * Ficha pública: la referencia del anuncio («REF: …» junto a las migas; la
 * referencia de agencia o, sin ella, el código comercial o la referencia
 * propia; calculada en el servidor y nunca las columnas internas), «Análisis
 * de inversión» que no se pinta sin comparables en la zona, y el bloque «Última
 * actualización · Publicada el · Referencia del anuncio» bajo «Atendido por».
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('Ficha: referencia de la inmobiliaria, fechas y secciones sin datos', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  const p: Record<string, { id: number; slug: string; reference: string }> = {}

  async function createProperty(name: string, extra: Record<string, any>) {
    const res = await a.post('/api/admin/developer-properties', { data: { developerId: extra.developerId, name, price: 250000, bedrooms: 2, bathrooms: 1, area: 80, status: 'new', transactionType: 'sale', ...extra } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    // El POST no devuelve el slug (ni la referencia propia, que se genera al crear): se pide la fila.
    const { row } = await (await a.get(`/api/admin/developer-properties/${id}`)).json()
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    return { id, slug: row.slug as string, reference: String(row.reference || '') }
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: ANON_STATE })
    // La ficha con su configuración de partida («Ref.» visible, secciones sin datos ocultas).
    await a.delete('/api/admin/site-pages/ficha-propiedad').catch(() => null)

    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora referencia ${RUN}`, email: `ref-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))

    // Con referencia de agencia, referencia interna y de portales (que no salen), y sin zona: sin comparables.
    p.withRef = await createProperty(`Referencia agencia ${RUN}`, { developerId, agencyReference: 'AG-77', externalSource: 'idealista', externalReference: `PORTAL-${RUN}` })
    // Sin referencia de agencia pero con código comercial en la ficha ampliada.
    p.withCode = await createProperty(`Código comercial ${RUN}`, { developerId })
    const sheet = await a.put(`/api/admin/developer-properties/${p.withCode.id}`, { data: { commercialCode: 'CC-9' } })
    expect(sheet.ok(), await sheet.text()).toBeTruthy()
    // Sin ninguna.
    p.bare = await createProperty(`Sin referencia ${RUN}`, { developerId })
    // Dos en la misma zona: la una es comparable de la otra, así que sí hay análisis.
    p.zoneA = await createProperty(`Zona A ${RUN}`, { developerId, community: `Zona ${RUN}` })
    p.zoneB = await createProperty(`Zona B ${RUN}`, { developerId, community: `Zona ${RUN}`, price: 260000, area: 85 })
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), anon?.dispose()])
  })

  test('«REF:» junto a las migas: referencia de agencia, si no el código comercial, si no la propia; las columnas internas nunca salen', async ({ page }) => {
    const pub = await (await anon.get(`/api/public/properties/${p.withRef.slug}`)).json()
    expect(pub.referenceLabel).toBe('AG-77')
    expect(pub.project).not.toHaveProperty('reference')
    expect(pub.project).not.toHaveProperty('agencyReference')
    expect(pub.project).not.toHaveProperty('externalReference')
    expect(pub.project).not.toHaveProperty('externalSource')
    expect(pub.project).not.toHaveProperty('mandateType')
    expect(JSON.stringify(pub)).not.toContain(`PORTAL-${RUN}`)

    await page.goto(`/propiedades/${p.withRef.slug}`)
    const crumbs = page.getByTestId('ficha-breadcrumbs')
    await expect(crumbs.getByTestId('ficha-reference')).toHaveText('REF: AG-77')
    // Arriba, a la derecha de las migas y antes de Compartir; no en la tarjeta principal.
    const order = await crumbs.evaluate((el) => [...el.querySelectorAll('nav, [data-testid="ficha-reference"], [data-testid="ficha-share"]')].map((n) => n.tagName === 'NAV' ? 'nav' : n.getAttribute('data-testid')))
    expect(order).toEqual(['nav', 'ficha-reference', 'ficha-share'])
    await expect(page.getByTestId('ficha-summary').getByTestId('ficha-reference')).toHaveCount(0)
    await expect(page.getByTestId('ficha-reference')).toHaveCount(1)

    const pubCode = await (await anon.get(`/api/public/properties/${p.withCode.slug}`)).json()
    expect(pubCode.referenceLabel).toBe('CC-9')
    expect(pubCode.details.commercialCode).toBe('CC-9')
    await page.goto(`/propiedades/${p.withCode.slug}`)
    await expect(page.getByTestId('ficha-breadcrumbs').getByTestId('ficha-reference')).toHaveText('REF: CC-9')

    // Sin ninguna de las dos, la referencia propia que la propiedad recibió al crearse: todas enseñan una.
    expect(p.bare.reference, 'toda propiedad tiene referencia propia').toBeTruthy()
    const pubBare = await (await anon.get(`/api/public/properties/${p.bare.slug}`)).json()
    expect(pubBare.referenceLabel).toBe(p.bare.reference)
    expect(pubBare.project).not.toHaveProperty('reference')
    await page.goto(`/propiedades/${p.bare.slug}`)
    await expect(page.getByTestId('ficha-breadcrumbs').getByTestId('ficha-reference')).toHaveText(`REF: ${p.bare.reference}`)
    // Nunca el número interno.
    await expect(page.getByTestId('ficha-reference')).not.toContainText(`#${p.bare.id}`)
  })

  test('«Análisis de inversión» no se pinta sin comparables en la zona; con ellos, sí', async ({ page }) => {
    const pub = await (await anon.get(`/api/public/properties/${p.withRef.slug}`)).json()
    expect(pub.availability.analysis).toBe(false)
    await page.goto(`/propiedades/${p.withRef.slug}`)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('#analisis')).toHaveCount(0)
    await expect(page.getByTestId('ficha-section-nav').locator('a[href="#analisis"]')).toHaveCount(0)

    const pubZone = await (await anon.get(`/api/public/properties/${p.zoneA.slug}`)).json()
    expect(pubZone.availability.analysis).toBe(true)
    await page.goto(`/propiedades/${p.zoneA.slug}`)
    await expect(page.locator('#analisis')).toHaveCount(1)
    await expect(page.getByTestId('ficha-section-nav').locator('a[href="#analisis"]')).toHaveCount(1)
  })

  test('bajo «Atendido por»: última actualización, publicada el y la referencia del anuncio', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${p.withRef.slug}`)
    const aside = page.getByTestId('ficha-aside')
    const meta = aside.getByTestId('ficha-listing-meta')
    await expect(meta).toBeVisible()
    // Después de «Atendido por» en el DOM de la columna derecha.
    const order = await aside.evaluate((el) => [...el.querySelectorAll('[data-testid="ficha-contact-sticky"], [data-testid="ficha-listing-meta"]')].map((n) => n.getAttribute('data-testid')))
    expect(order).toEqual(['ficha-contact-sticky', 'ficha-listing-meta'])

    await expect(meta.locator('[data-meta="updated"] dd')).toHaveText('Hoy')
    await expect(meta.locator('[data-meta="updated"] time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/)
    // Sin fecha de publicación, la de alta: hoy, pero entera (día, mes y año).
    await expect(meta.locator('[data-meta="published"] dd')).toHaveText(/^\d{1,2} de [a-z]+ de \d{4}$/)
    await expect(meta.locator('[data-meta="published"] time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/)
    // La misma «REF:» de arriba.
    await expect(meta.locator('[data-meta="reference"] dd')).toHaveText('AG-77')

    // Con la referencia propia como único dato, también sale en el bloque.
    await page.goto(`/propiedades/${p.bare.slug}`)
    const bareMeta = page.getByTestId('ficha-listing-meta')
    await expect(bareMeta.locator('[data-meta="updated"]')).toHaveCount(1)
    await expect(bareMeta.locator('[data-meta="reference"] dd')).toHaveText(p.bare.reference)
  })
})
