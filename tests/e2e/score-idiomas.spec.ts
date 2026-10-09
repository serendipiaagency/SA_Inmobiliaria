import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Serendipia Score y Decisión rápida en el idioma de la web. Antes las dos
 * tarjetas pintaban tal cual la etiqueta y la explicación que el servidor
 * compone en español, así que con la web en inglés seguían diciendo
 * «Comprar» o «Revalorización». Ahora el servidor devuelve además la clave de
 * cada factor y de su motivo con sus datos, y la ficha compone la frase en el
 * idioma de la web (composables/useScoreText.ts).
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const COMMUNITY = `Comunidad idiomas ${RUN}`

// Lo que delata texto en español en estas dos tarjetas (sin raíces que también son inglés, como «calcula»).
const SPANISH = /[áéíóúñ¿¡]|\b(comprar|inversi|revaloriz|liquidez|rentabilidad|comodidades|certeza|frente a|media de|activos? en la|bruta|entrega|zona|eficiencia|piscina|garaje|destaca|mejorable|ocultar)/i

test.describe('Score y Decisión rápida en el idioma de la web', () => {
  let a: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  let slug = ''

  async function createProperty(developerId: number, name: string, extra: Record<string, any>) {
    const res = await a.post('/api/admin/developer-properties', { data: { developerId, name, bedrooms: 2, bathrooms: 1, area: 100, community: COMMUNITY, ...extra } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    const { row } = await (await a.get(`/api/admin/developer-properties/${id}`)).json()
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    return row.slug as string
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } })
    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora idiomas ${RUN}`, email: `idiomas-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))

    // Con un comparable en su comunidad, la propiedad tiene los cuatro factores y las cuatro valoraciones.
    slug = await createProperty(developerId, `Idiomas completa ${RUN}`, { price: 300000, rentalYield: 6.5, hasPool: 1, hasGarage: 1, energyRating: 'B', status: 'under_construction' })
    await createProperty(developerId, `Idiomas comparable ${RUN}`, { price: 350000, rentalYield: 5, status: 'ready' })
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), anon?.dispose()])
  })

  test('la API trae claves y datos además de las frases en español', async () => {
    const api = await (await anon.get(`/api/public/properties/${slug}/score`)).json()
    expect(api.breakdown.map((b: any) => [b.key, b.reason])).toEqual([
      ['precio', 'vsZone'],
      ['rentabilidad', 'grossYield'],
      ['comodidades', 'amenities'],
      ['entrega', 'underConstruction'],
    ])
    expect(api.breakdown[0]).toMatchObject({ label: 'Precio vs. zona', detail: '−14% frente a la media de 1 comparable', data: { pctVsZone: -14, comparableCount: 1 } })
    expect(api.breakdown[2].data).toEqual({ amenities: ['pool', 'garage'], energyRating: 'B' })
    const reval = api.decision.find((d: any) => d.key === 'revalorizacion')
    expect(reval).toMatchObject({ label: 'Revalorización', reason: 'underConstruction', data: { status: 'under_construction', yieldVsZone: 'above', yieldDiffPts: 1.5 } })
    expect(reval.detail).toContain('rentabilidad por encima de la media de la zona (+1.5 pts)')
  })

  test('con la web en inglés, ni el Score ni la Decisión rápida tienen texto en español', async ({ browser }) => {
    const api = await (await anon.get(`/api/public/properties/${slug}/score`)).json()
    const spanishFromApi = [...api.breakdown, ...api.decision].flatMap((x: any) => [x.label, x.detail])

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } })
    await ctx.addCookies([{ name: 'locale', value: 'en', url: BASE_URL }])
    const page = await ctx.newPage()
    await page.goto(`/propiedades/${slug}`)

    const score = page.getByTestId('serendipia-score')
    await score.scrollIntoViewIfNeeded()
    const bars = page.getByTestId('serendipia-score-bars')
    await expect(bars.locator('li')).toHaveCount(4)
    await expect(bars.locator('[data-factor="precio"]')).toContainText('Price vs. area')
    await expect(page.getByTestId('serendipia-score-summary')).toHaveText('Stands out in rental yield; room for improvement: amenities and efficiency.')
    await page.getByTestId('serendipia-score-more').click()
    const detail = page.getByTestId('serendipia-score-detail')
    await expect(detail.locator('[data-factor="precio"] dd')).toHaveText('-14% vs. the average of 1 comparable property')
    await expect(detail.locator('[data-factor="rentabilidad"] dt')).toContainText('Rental yield')
    await expect(detail.locator('[data-factor="rentabilidad"] dd')).toHaveText('6.5% estimated gross annual yield')
    await expect(detail.locator('[data-factor="comodidades"] dd')).toHaveText('pool and garage · energy rating B')
    await expect(detail.locator('[data-factor="entrega"] dd')).toHaveText('Under construction — handover date already committed')

    const decision = page.getByTestId('ficha-quick-decision')
    expect(await decision.locator('[data-decision]').evaluateAll((els) => els.map((e) => e.textContent?.trim()))).toEqual(['Buy', 'Investment', 'Appreciation', 'Liquidity'])
    await decision.getByText('How it is calculated').click()
    const method = page.getByTestId('ficha-quick-decision-method')
    await expect(method).toContainText(`Overall Serendipia Score: ${api.overall}/100`)
    await expect(method).toContainText('6.5% estimated gross annual rental yield')
    await expect(method).toContainText('Under construction — moderate room to grow before handover; yield above the area average (+1.5 pts)')
    await expect(method).toContainText('1 active comparable property in the area · 6.5% yield')

    for (const card of [score, decision]) {
      const text = await card.innerText()
      expect(text, text).not.toMatch(SPANISH)
      for (const s of spanishFromApi) expect(text).not.toContain(s)
    }

    // La misma ficha en español sigue diciendo lo de siempre.
    await ctx.addCookies([{ name: 'locale', value: 'es', url: BASE_URL }])
    await page.reload()
    await expect(page.getByTestId('ficha-quick-decision').locator('[data-decision="revalorizacion"]')).toContainText('Revalorización')
    await page.getByTestId('serendipia-score-more').click()
    await expect(page.getByTestId('serendipia-score-detail').locator('[data-factor="comodidades"] dd')).toHaveText('piscina y garaje · eficiencia B')
    await ctx.close()
  })
})
