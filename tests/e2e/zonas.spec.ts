import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Zonas (docs/zonas.md): guías de región → municipio → barrio de la web
 * pública, dadas de alta por el panel (POST /api/admin/zones) de la
 * inmobiliaria A, y leídas como visitante anónimo en su web (localhost es la
 * organización pública por defecto, la A). La B crea las suyas y ni unas ni
 * otras se cruzan. Los recuentos salen del catálogo real; aquí se comparan
 * con lo que devuelve el propio catálogo, nunca con una cifra escrita.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
const REGION = `zr${RUN}`

const sessionFor = (storageState: string) => pwRequest.newContext({ baseURL: BASE_URL, storageState })

const INTRO = 'Oviedo es la capital de Asturias y una ciudad para vivir a pie: el casco antiguo, el Campo de San Francisco y los barrios residenciales que crecieron alrededor. Esta guía cuenta cómo es cada zona y qué conviene mirar antes de visitar una vivienda.'

test.describe('Zonas: directorio, guías, catálogo y aislamiento', () => {
  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  const ids: Record<string, number> = {}
  let oviedoCount = 0
  let propertyId = 0
  let propertySlug = ''

  test.beforeAll(async () => {
    a = await sessionFor(STATE_A)
    b = await sessionFor(STATE_B)
    anon = await pwRequest.newContext({ baseURL: BASE_URL })

    const create = async (ctx: APIRequestContext, data: Record<string, unknown>) => {
      const res = await ctx.post('/api/admin/zones', { data })
      expect(res.ok(), `no se pudo crear la zona ${data.slug}: ${res.status()} ${await res.text()}`).toBeTruthy()
      return (await res.json()).id as number
    }

    // Una propiedad publicada de A en Oviedo (Centro): la zona la cuenta, la enseña y la ficha enlaza a su guía.
    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora zonas ${RUN}`, email: `zonas-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    ids.developer = (await dev.json()).id
    const prop = await a.post('/api/admin/developer-properties', { data: { developerId: ids.developer, name: `Piso en Oviedo ${RUN}`, price: 245000, bedrooms: 3, bathrooms: 2, area: 95, status: 'new', city: 'Oviedo', community: 'Centro' } })
    expect(prop.ok(), await prop.text()).toBeTruthy()
    propertyId = (await prop.json()).id
    propertySlug = (await (await a.get(`/api/admin/developer-properties/${propertyId}`)).json()).row.slug

    ids.region = await create(a, { name: `Asturias ${RUN}`, slug: REGION, kind: 'region', status: 'published', area: null, intro: 'La región de prueba.', seoTitle: 'Dónde vivir en Asturias: zonas de prueba', lat: 43.36, lng: -5.85, zoom: 8, sortOrder: 0 })
    ids.oviedo = await create(a, {
      name: 'Oviedo', slug: 'oviedo', kind: 'municipality', parentId: ids.region, area: 'ciudades', status: 'published', homePriority: 5, sortOrder: 10,
      subtitle: 'La capital: casco antiguo, parques y barrios tranquilos', intro: INTRO, matchMunicipality: 'Oviedo', lat: 43.3619, lng: -5.8494, zoom: 13,
      sectionsJson: [{ title: 'Estilo de vida', text: 'Una ciudad que se recorre andando.' }, { title: 'Vivienda', text: 'Pisos en el centro y bloques recientes en los barrios nuevos.' }],
      faqJson: [{ q: '¿Es una ciudad para vivir sin coche?', a: 'Sí: casi todo se hace a pie o en autobús urbano.' }],
    })
    ids.barrio = await create(a, {
      name: 'Centro', slug: 'centro', kind: 'neighborhood', parentId: ids.oviedo, status: 'published', sortOrder: 10, matchNeighborhood: 'Centro',
      subtitle: 'El casco antiguo y las calles comerciales', intro: 'El Centro de Oviedo reúne la catedral, el casco antiguo y las calles comerciales de Uría y alrededores.', lat: 43.3625, lng: -5.8448, zoom: 15,
      faqJson: [{ q: '¿Se puede aparcar?', a: 'Difícilmente en la calle; lo habitual es una plaza en un parking.' }],
    })
    ids.sinGuia = await create(a, { name: 'Siero', slug: 'siero', kind: 'municipality', parentId: ids.region, area: 'centro', status: 'published', sortOrder: 20, matchMunicipality: 'Siero', lat: 43.39, lng: -5.66 })
    ids.borrador = await create(a, { name: 'Llanes', slug: 'llanes', kind: 'municipality', parentId: ids.region, area: 'oriente', status: 'draft', sortOrder: 30, intro: 'Borrador aún sin publicar.', matchMunicipality: 'Llanes', lat: 43.42, lng: -4.75 })

    // La inmobiliaria B tiene su propia región, con el mismo slug de municipio: no se mezclan.
    ids.regionB = await create(b, { name: `Skyline ${RUN}`, slug: `${REGION}b`, kind: 'region', status: 'published', intro: 'Región de B.', lat: 43.3, lng: -5.8, sortOrder: 0 })
    ids.oviedoB = await create(b, { name: 'Oviedo', slug: 'oviedo', kind: 'municipality', parentId: ids.regionB, status: 'published', intro: 'El Oviedo de B.', matchMunicipality: 'Oviedo', lat: 43.36, lng: -5.85, sortOrder: 10 })

    const suggest = await (await anon.get('/api/public/location-suggest?q=Oviedo')).json()
    oviedoCount = suggest.items.find((i: any) => i.kind === 'municipality' && i.value === 'Oviedo')?.count ?? 0
  })

  test.afterAll(async () => {
    for (const key of ['borrador', 'sinGuia', 'barrio', 'oviedo', 'region']) if (ids[key]) await a.delete(`/api/admin/zones/${ids[key]}`)
    for (const key of ['oviedoB', 'regionB']) if (ids[key]) await b.delete(`/api/admin/zones/${ids[key]}`)
    if (propertyId) await a.delete(`/api/admin/developer-properties/${propertyId}?hard=1`)
    if (ids.developer) await a.delete(`/api/admin/developers/${ids.developer}`)
    await a?.dispose()
    await b?.dispose()
    await anon?.dispose()
  })

  test('la API del directorio devuelve la región, sus municipios publicados por área y recuentos del catálogo real', async () => {
    const res = await anon.get(`/api/public/zones?region=${REGION}`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.region).toMatchObject({ slug: REGION, kind: 'region', path: `/zonas/${REGION}`, hasGuide: true })
    expect(data.region.seoTitle).toBe('Dónde vivir en Asturias: zonas de prueba')
    const slugs = data.groups.flatMap((g: any) => g.zones.map((z: any) => z.slug))
    expect(slugs).toEqual(['oviedo', 'siero'])
    expect(slugs, 'un borrador no sale en el directorio').not.toContain('llanes')
    expect(data.groups.map((g: any) => [g.area, g.label])).toEqual([['ciudades', 'Principales ciudades'], ['centro', 'Centro']])
    const oviedo = data.groups[0].zones[0]
    expect(oviedo).toMatchObject({ path: `/zonas/${REGION}/oviedo`, catalogUrl: '/propiedades?operacion=venta&municipality=Oviedo', hasGuide: true, childrenCount: 1, areaLabel: 'Principales ciudades' })
    expect(oviedo.count, 'el recuento es el del índice del catálogo').toBe(oviedoCount)
    expect(oviedoCount, 'la inmobiliaria A tiene propiedades publicadas en Oviedo').toBeGreaterThan(0)
    const siero = data.groups[1].zones[0]
    expect(siero.hasGuide).toBe(false)
    expect(data.total).toBe(oviedo.count + siero.count)
    expect((await anon.get('/api/public/zones')).ok()).toBeTruthy()
    expect(((await (await anon.get('/api/public/zones')).json()).regions as any[]).map((r) => r.slug)).toContain(REGION)
  })

  test('la API de la guía trae migas, barrios, cercanas, propiedades del catálogo y el enlace filtrado; 404 para borradores y rutas inexistentes', async () => {
    const res = await anon.get(`/api/public/zones/${REGION}/oviedo`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.zone).toMatchObject({ slug: 'oviedo', kind: 'municipality', intro: INTRO, lat: 43.3619, match: { municipality: 'Oviedo', neighborhood: null } })
    expect(data.zone.sections).toHaveLength(2)
    expect(data.zone.faq).toHaveLength(1)
    expect(data.breadcrumbs).toEqual([{ name: `Asturias ${RUN}`, path: `/zonas/${REGION}` }, { name: 'Oviedo', path: `/zonas/${REGION}/oviedo` }])
    expect(data.children.map((c: any) => c.slug)).toEqual(['centro'])
    expect(data.children[0].path).toBe(`/zonas/${REGION}/oviedo/centro`)
    expect(data.nearby.map((n: any) => n.slug)).toEqual(['siero'])
    expect(data.catalogUrl).toBe('/propiedades?operacion=venta&municipality=Oviedo')
    // Las propiedades son las del catálogo con el mismo filtro: misma búsqueda, mismos ids.
    const catalog = await (await anon.get('/api/public/properties?operacion=venta&municipality=Oviedo&perPage=6')).json()
    expect(data.properties.length).toBeGreaterThan(0)
    expect(data.properties.length).toBeLessThanOrEqual(6)
    const catalogIds = new Set(catalog.rows.map((r: any) => r.id))
    expect(catalogIds.has(propertyId), 'la propiedad creada en Oviedo está en el catálogo filtrado').toBe(true)
    expect(data.properties.some((p: any) => p.id === propertyId), 'la guía enseña la propiedad de Oviedo').toBe(true)
    for (const p of data.properties) expect(catalogIds.has(p.id), `la propiedad ${p.id} no está en el catálogo filtrado`).toBe(true)
    for (const p of data.properties) expect(p, 'la guía no expone campos internos').not.toHaveProperty('internalNotes')

    const barrio = await (await anon.get(`/api/public/zones/${REGION}/oviedo/centro`)).json()
    expect(barrio.zone.match).toEqual({ municipality: 'Oviedo', neighborhood: 'Centro' })
    expect(barrio.catalogUrl).toBe('/propiedades?operacion=venta&municipality=Oviedo&neighborhood=Centro')
    expect(barrio.breadcrumbs).toHaveLength(3)

    expect((await anon.get(`/api/public/zones/${REGION}/llanes`)).status(), 'borrador').toBe(404)
    expect((await anon.get(`/api/public/zones/${REGION}/no-existe`)).status()).toBe(404)
    expect((await anon.get(`/api/public/zones/oviedo`)).status(), 'un municipio no se resuelve sin su región').toBe(404)
    expect((await anon.get(`/api/public/zones?region=${REGION}/oviedo`)).status()).toBe(404)
    expect((await anon.get(`/api/public/zones/${REGION}/oviedo/centro/x/y`)).status()).toBe(404)
  })

  test('aislamiento: las zonas de B no existen en la web de A y las de A no existen en la de B (404, nunca 403)', async () => {
    expect((await anon.get(`/api/public/zones?region=${REGION}b`)).status()).toBe(404)
    expect((await anon.get(`/api/public/zones/${REGION}b/oviedo`)).status()).toBe(404)
    const regionsA = (await (await anon.get('/api/public/zones')).json()).regions.map((r: any) => r.slug)
    expect(regionsA).not.toContain(`${REGION}b`)

    // La web de B, vista por su propia administradora con ?vista_previa=2 (fija la cookie y redirige).
    const previewB = await b.get(`/api/public/zones?vista_previa=2`)
    expect(previewB.ok()).toBeTruthy()
    const regionsB = (await previewB.json()).regions.map((r: any) => r.slug)
    expect(regionsB).toContain(`${REGION}b`)
    expect(regionsB).not.toContain(REGION)
    expect((await b.get(`/api/public/zones/${REGION}/oviedo`)).status()).toBe(404)
    expect((await b.get(`/api/public/zones/${REGION}b/oviedo`)).status()).toBe(200)

    // El panel de B no ve ni edita las zonas de A.
    expect((await b.get(`/api/admin/zones/${ids.oviedo}`)).status()).toBe(404)
    expect((await b.put(`/api/admin/zones/${ids.oviedo}`, { data: { name: 'Hackeado' } })).status()).toBe(404)
    expect((await (await a.get(`/api/admin/zones/${ids.oviedo}`)).json()).row.name).toBe('Oviedo')
    // Y una zona de B no puede colgarse de una región de A.
    const cross = await b.post('/api/admin/zones', { data: { name: 'Colada', slug: `colada-${RUN}`, kind: 'municipality', parentId: ids.region, status: 'published', lat: 43, lng: -5, sortOrder: 1 } })
    expect(cross.ok(), `B no puede colgar una zona de una región de A: ${cross.status()}`).toBeFalsy()
  })

  test('el directorio /zonas/<región> se renderiza en el servidor con buscador, filtro por área, tarjetas y estado vacío', async ({ page }) => {
    const res = await page.goto(`/zonas/${REGION}`)
    expect(res?.status()).toBe(200)
    await expect(page.getByTestId('zone-directory-title')).toHaveText(`Descubre las mejores zonas para vivir en Asturias ${RUN}`)
    await expect(page).toHaveTitle(/Dónde vivir en Asturias: zonas de prueba/)
    await expect(page.getByTestId('zone-directory-total')).toContainText('2 zonas')
    await expect(page.getByTestId('zone-group-ciudades')).toBeVisible()
    await expect(page.getByTestId('zone-group-centro')).toBeVisible()
    const oviedo = page.getByTestId('zone-card-oviedo')
    await expect(oviedo).toHaveAttribute('href', `/zonas/${REGION}/oviedo`)
    await expect(oviedo).toContainText(`${oviedoCount} vivienda`)
    await expect(page.getByTestId('zone-card-siero'), 'sin guía, la tarjeta lleva al catálogo filtrado').toHaveAttribute('href', '/propiedades?operacion=venta&municipality=Siero')
    await expect(page.getByTestId('zone-card-llanes')).toHaveCount(0)

    await page.getByTestId('zone-area-filter').getByRole('button', { name: 'Centro' }).click()
    await expect(page.getByTestId('zone-card-oviedo')).toHaveCount(0)
    await expect(page.getByTestId('zone-card-siero')).toBeVisible()
    await page.getByTestId('zone-area-filter').getByRole('button', { name: 'Todas' }).click()
    await page.getByTestId('zone-search').fill('ovie')
    await expect(page.getByTestId('zone-card-oviedo')).toBeVisible()
    await expect(page.getByTestId('zone-card-siero')).toHaveCount(0)
    await page.getByTestId('zone-search').fill('zzzz')
    await expect(page.getByTestId('zone-empty')).toBeVisible()
    await page.getByTestId('zone-empty').getByRole('button').click()
    await expect(page.getByTestId('zone-card-siero')).toBeVisible()

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(ld.some((s) => s.includes('BreadcrumbList')), 'BreadcrumbList en el directorio').toBe(true)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${BASE_URL}/zonas/${REGION}`)
  })

  test('la guía del municipio: hero con migas y CTA al catálogo, intro, secciones, barrios, viviendas, FAQ, cercanas, CTA final y SEO', async ({ page }) => {
    const res = await page.goto(`/zonas/${REGION}/oviedo`)
    expect(res?.status()).toBe(200)
    await expect(page.getByTestId('zone-title')).toHaveText('Oviedo')
    await expect(page.getByTestId('zone-subtitle')).toHaveText('La capital: casco antiguo, parques y barrios tranquilos')
    await expect(page.getByTestId('zone-breadcrumbs')).toContainText(`Asturias ${RUN}`)
    await expect(page.getByTestId('zone-breadcrumbs').getByRole('link', { name: `Asturias ${RUN}` })).toHaveAttribute('href', `/zonas/${REGION}`)
    await expect(page.getByTestId('zone-cta')).toHaveAttribute('href', '/propiedades?operacion=venta&municipality=Oviedo')
    await expect(page.getByTestId('zone-count')).toContainText(String(oviedoCount))
    await expect(page.getByTestId('zone-intro')).toContainText('Oviedo es la capital de Asturias')
    await expect(page.getByTestId('zone-sections')).toContainText('Estilo de vida')
    await expect(page.getByTestId('zone-child-centro')).toHaveAttribute('href', `/zonas/${REGION}/oviedo/centro`)
    await expect(page.getByTestId('zone-properties')).toBeVisible()
    expect(await page.getByTestId('zone-properties').locator('a[href^="/propiedades/"]').count()).toBeGreaterThan(0)
    await expect(page.getByTestId('zone-faq')).toContainText('¿Es una ciudad para vivir sin coche?')
    await expect(page.getByTestId('zone-nearby-siero')).toBeVisible()
    await expect(page.getByTestId('zone-final')).toContainText('Oviedo')
    await expect(page.getByTestId('zone-final').getByRole('link')).toHaveAttribute('href', '/propiedades?operacion=venta&municipality=Oviedo')
    await expect(page.getByTestId('zone-map')).toBeVisible()

    await expect(page).toHaveTitle(/Vivir en Oviedo, Asturias/)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${BASE_URL}/zonas/${REGION}/oviedo`)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Oviedo es la capital de Asturias/)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Vivir en Oviedo/)
    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((s) => JSON.parse(s))
    const crumbs = ld.find((x) => x['@type'] === 'BreadcrumbList')
    expect(crumbs, 'BreadcrumbList').toBeTruthy()
    expect(crumbs.itemListElement.map((i: any) => i.name)).toEqual(['Inicio', `Asturias ${RUN}`, 'Oviedo'])
    expect(crumbs.itemListElement[2].item).toBe(`${BASE_URL}/zonas/${REGION}/oviedo`)
    expect(await page.locator('h1').count(), 'un solo H1').toBe(1)
  })

  test('la guía del barrio hereda el municipio para el catálogo y los borradores dan 404 en la web', async ({ page }) => {
    expect((await page.goto(`/zonas/${REGION}/oviedo/centro`))?.status()).toBe(200)
    await expect(page.getByTestId('zone-title')).toHaveText('Centro')
    await expect(page.getByTestId('zone-breadcrumbs')).toContainText('Oviedo')
    await expect(page.getByTestId('zone-cta')).toHaveAttribute('href', '/propiedades?operacion=venta&municipality=Oviedo&neighborhood=Centro')
    await expect(page.getByTestId('zone-faq')).toContainText('¿Se puede aparcar?')
    expect((await page.goto(`/zonas/${REGION}/llanes`))?.status(), 'borrador').toBe(404)
    expect((await page.goto(`/zonas/${REGION}/no-existe`))?.status()).toBe(404)
    expect((await page.goto(`/zonas/${REGION}b`))?.status(), 'la región de B no existe en la web de A').toBe(404)
    expect((await page.goto(`/zonas/${REGION}b/oviedo`))?.status()).toBe(404)
  })

  test('sin desbordes horizontales en móvil (directorio y guía)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL: BASE_URL })
    const page = await ctx.newPage()
    for (const path of [`/zonas/${REGION}`, `/zonas/${REGION}/oviedo`]) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${path} desborda ${overflow}px`).toBeLessThanOrEqual(0)
    }
    await ctx.close()
  })

  test('la ficha de una propiedad de Oviedo enlaza a la guía de su zona y /for-property elige barrio o municipio', async ({ page }) => {
    const byMunicipality = await (await anon.get('/api/public/zones/for-property?municipality=Oviedo')).json()
    expect(byMunicipality.zone).toMatchObject({ slug: 'oviedo', path: `/zonas/${REGION}/oviedo`, parentName: `Asturias ${RUN}` })
    const byBarrio = await (await anon.get('/api/public/zones/for-property?municipality=Oviedo&neighborhood=Centro')).json()
    expect(byBarrio.zone).toMatchObject({ slug: 'centro', path: `/zonas/${REGION}/oviedo/centro`, parentName: 'Oviedo' })
    const unknownBarrio = await (await anon.get('/api/public/zones/for-property?municipality=Oviedo&neighborhood=Inventado')).json()
    expect(unknownBarrio.zone.slug, 'sin guía del barrio, la del municipio').toBe('oviedo')
    expect((await (await anon.get('/api/public/zones/for-property?municipality=Narnia')).json()).zone).toBeNull()
    expect((await (await anon.get('/api/public/zones/for-property')).json()).zone).toBeNull()

    await page.goto(`/propiedades/${propertySlug}`)
    const link = page.getByTestId('ficha-zone-link')
    await expect(link).toBeVisible()
    await expect(link).toContainText('Descubre cómo es vivir en')
    await expect(link, 'la propiedad está en el Centro de Oviedo: enlaza a la guía del barrio').toHaveAttribute('href', `/zonas/${REGION}/oviedo/centro`)
  })

  test('la portada y la vista previa del Constructor reciben las zonas con prioridad; el sitemap lista región y guías publicadas', async () => {
    const home = await (await anon.get('/api/public/home')).json()
    expect(Array.isArray(home.zones)).toBe(true)
    const z = home.zones.find((x: any) => x.path === `/zonas/${REGION}/oviedo`)
    expect(z, 'la zona con prioridad 5 sale en la portada').toBeTruthy()
    expect(z.count).toBe(oviedoCount)
    expect(home.zones.some((x: any) => x.slug === 'siero'), 'prioridad 0 no sale').toBe(false)
    const preview = await (await a.get('/api/admin/site-pages/preview-data')).json()
    expect(preview.zones.some((x: any) => x.path === `/zonas/${REGION}/oviedo`)).toBe(true)

    const xml = await (await anon.get('/sitemap.xml')).text()
    expect(xml).toContain(`/zonas/${REGION}</loc>`)
    expect(xml).toContain(`/zonas/${REGION}/oviedo</loc>`)
    expect(xml).toContain(`/zonas/${REGION}/oviedo/centro</loc>`)
    expect(xml, 'sin guía no entra en el sitemap').not.toContain(`/zonas/${REGION}/siero</loc>`)
    expect(xml, 'un borrador no entra en el sitemap').not.toContain(`/zonas/${REGION}/llanes</loc>`)
    expect(xml).not.toContain(`/zonas/${REGION}b`)
  })

  test('el panel lista, filtra y edita las zonas; al despublicar o borrar, desaparecen de la web', async () => {
    const list = await (await a.get('/api/admin/zones?kind=municipality&parentId=' + ids.region)).json()
    const rows: any[] = list.rows || list.items || list
    expect(rows.map((r) => r.slug).sort()).toEqual(['llanes', 'oviedo', 'siero'])
    expect((await a.put(`/api/admin/zones/${ids.borrador}`, { data: { status: 'published' } })).ok()).toBeTruthy()
    expect((await anon.get(`/api/public/zones/${REGION}/llanes`)).status(), 'publicada, ya existe').toBe(200)
    expect((await a.put(`/api/admin/zones/${ids.borrador}`, { data: { status: 'draft' } })).ok()).toBeTruthy()
    expect((await anon.get(`/api/public/zones/${REGION}/llanes`)).status(), 'de vuelta a borrador').toBe(404)
    expect((await a.delete(`/api/admin/zones/${ids.sinGuia}`)).ok()).toBeTruthy()
    const dir = await (await anon.get(`/api/public/zones?region=${REGION}`)).json()
    expect(dir.groups.flatMap((g: any) => g.zones.map((z: any) => z.slug))).toEqual(['oviedo'])
    ids.sinGuia = 0
  })
})
