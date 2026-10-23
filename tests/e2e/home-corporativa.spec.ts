import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Bloques corporativos de la portada (docs/home-corporativa.md): «Conoce
 * nuestra inmobiliaria», «Nuestra experiencia, tu tranquilidad», el bloque
 * de comerciales en su diseño editorial y «Nuestras oficinas», publicados en
 * la portada de la inmobiliaria A con una oficina real dada de alta por el
 * panel. Las cifras son recuentos reales; los datos de la oficina, los de su
 * ficha; nada de la inmobiliaria B se cuela.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`

const sessionFor = (storageState: string) => pwRequest.newContext({ baseURL: BASE_URL, storageState })

test.describe('Home corporativa: la inmobiliaria detrás del catálogo', () => {
  // La web de A se ve en el host de pruebas con ?vista_previa=1, que sólo
  // sirve a quien tiene sesión en A (server/utils/sitePreview.ts); las
  // páginas de este spec navegan con esa sesión.
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let originalHome: any
  let officeId = 0
  let hiddenOfficeId = 0
  let officeBId = 0
  let memberId = 0
  let memberSlug = ''
  let stats: Record<string, number> = {}

  test.beforeAll(async () => {
    a = await sessionFor(STATE_A)
    b = await sessionFor(STATE_B)
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const draft = await (await a.get('/api/admin/site-pages/home')).json()
    originalHome = { blocks: draft.blocks, seo: draft.seo, styles: draft.styles }

    const office = await a.post('/api/admin/offices', {
      data: { name: `Oficina Centro ${RUN}`, city: 'Oviedo', province: 'Asturias', address: 'Calle Uría 1', postalCode: '33003', country: 'España', phone: '+34 985 000 999', email: `centro-${RUN}@mm.test`, status: 'active', description: 'Nuestra oficina principal, en pleno centro.', openingHours: 'L-V 9:30-18:30 · S 10:00-14:00', lat: 43.3619, lng: -5.8494, isMain: 1, showOnWeb: 1, sortOrder: 1 },
    })
    expect(office.ok(), await office.text()).toBeTruthy()
    officeId = (await office.json()).id
    const hidden = await a.post('/api/admin/offices', { data: { name: `Oficina Oculta ${RUN}`, city: 'Gijón', status: 'active', showOnWeb: 0, sortOrder: 2 } })
    expect(hidden.ok(), await hidden.text()).toBeTruthy()
    hiddenOfficeId = (await hidden.json()).id
    const officeB = await b.post('/api/admin/offices', { data: { name: `Oficina Skyline ${RUN}`, city: 'Dubai', status: 'active', showOnWeb: 1, isMain: 1 } })
    expect(officeB.ok(), await officeB.text()).toBeTruthy()
    officeBId = (await officeB.json()).id

    memberSlug = `editorial-${RUN}`
    const member = await a.post('/api/admin/team', { data: { name: `Comercial Editorial ${RUN}`, email: `editorial-${RUN}@mm.test`, position: 'Asesora E2E', slug: memberSlug, showOnWeb: 1, description: 'Acompaña a familias que compran su primera vivienda.' } })
    expect(member.ok(), await member.text()).toBeTruthy()
    memberId = (await member.json()).id

    await a.put('/api/admin/site-pages/home', {
      data: {
        seo: {},
        blocks: [
          { id: 'about-e2e', type: 'about-agency', version: 1, content: { eyebrow: 'Sobre nosotros', title: 'Mucho más que encontrar una casa.', text: 'Texto corporativo de prueba.', cta: 'Conoce nuestra inmobiliaria', ctaTo: '/nosotros', image: '', imageAlt: '', stats: ['team', 'offices', 'properties', 'custom1', 'languages'], labelOffices: 'oficinas en Asturias', customValue1: '+15', customLabel1: 'años de experiencia' } },
          { id: 'team-e2e', type: 'team', version: 1, content: { eyebrow: 'Nuestro equipo', title: 'Las personas detrás de cada historia.', text: 'Un equipo local y cercano.', cta: 'Conoce todo el equipo', ctaTo: '/equipo', source: 'manual', manualIds: [], limit: 4, layout: 'editorial' } },
          { id: 'offices-e2e', type: 'offices', version: 1, content: { eyebrow: 'Nuestras oficinas', title: 'Un equipo cercano, estés donde estés.', text: 'Visítanos.', cta: 'Ver todas las oficinas', ctaTo: '/oficinas', source: 'dynamic', limit: 6, layout: 'auto', cardFields: { email: true } } },
          { id: 'trust-e2e', type: 'trust-points', version: 1, content: { eyebrow: 'Por qué elegirnos', title: 'Experiencia local. Tu tranquilidad.', text: '', image: '', count: 3, point1Title: 'Conocemos la zona', point1Text: 'Texto uno.', point2Title: 'Atención personal', point2Text: 'Texto dos.', point3Title: 'Todo en un solo lugar', point3Text: 'Texto tres.', point4Title: 'No debería salir' } },
        ],
      },
    })
    const draftSaved = await (await a.get('/api/admin/site-pages/home')).json()
    const teamBlock = draftSaved.blocks.find((x: any) => x.id === 'team-e2e')
    teamBlock.content.manualIds = [memberId]
    await a.put('/api/admin/site-pages/home', { data: { blocks: draftSaved.blocks, seo: {} } })
    expect((await a.post('/api/admin/site-pages/home/publish')).ok()).toBeTruthy()

    const home = await (await anon.get('/api/public/home')).json()
    stats = home.company?.stats || {}
  })

  test.afterAll(async () => {
    if (originalHome) {
      await a.put('/api/admin/site-pages/home', { data: originalHome })
      await a.post('/api/admin/site-pages/home/publish')
    }
    if (memberId) await a.delete(`/api/admin/team/${memberId}`)
    for (const id of [officeId, hiddenOfficeId]) if (id) await a.delete(`/api/admin/offices/${id}?hard=1`)
    if (officeBId) await b.delete(`/api/admin/offices/${officeBId}?hard=1`)
    await a?.dispose()
    await b?.dispose()
    await anon?.dispose()
  })

  test('la portada recibe el perfil, las cifras reales y las oficinas publicadas de SU inmobiliaria (proyección pública)', async () => {
    const home = await (await anon.get('/api/public/home')).json()
    expect(home.company.companyName).toBeTruthy()
    expect(home.company.stats).toMatchObject({ offices: expect.any(Number), team: expect.any(Number), properties: expect.any(Number), zones: expect.any(Number), languages: expect.any(Number) })
    const offices = home.offices as any[]
    const mine = offices.find((o) => o.id === officeId)
    expect(mine, 'la oficina publicada llega a la portada').toMatchObject({ name: `Oficina Centro ${RUN}`, city: 'Oviedo', openingHours: 'L-V 9:30-18:30 · S 10:00-14:00', lat: 43.3619, lng: -5.8494, isMain: 1, mapsUrl: 'https://www.google.com/maps/search/?api=1&query=43.3619%2C-5.8494' })
    expect(offices[0].id, 'la principal va la primera').toBe(officeId)
    expect(offices.some((o) => o.id === hiddenOfficeId), '«Mostrar en la web» a 0 la retira').toBe(false)
    expect(offices.some((o) => o.name.includes('Skyline')), 'las oficinas de B no se cuelan').toBe(false)
    for (const o of offices) for (const key of ['organizationId', 'code', 'timezone', 'status', 'showOnWeb', 'createdBy', 'deletedAt']) expect(o, `${key} nunca es público`).not.toHaveProperty(key)
    // Las cifras son recuentos reales: las oficinas publicadas de A son exactamente las que devuelve la proyección.
    expect(home.company.stats.offices).toBe(offices.length)
    expect(home.company.stats.team).toBe(home.team.length)
    const catalog = await (await anon.get('/api/public/properties?perPage=1')).json()
    expect(home.company.stats.properties).toBe(catalog.total)
    // La vista previa del Constructor recibe lo mismo.
    const preview = await (await a.get('/api/admin/site-pages/preview-data')).json()
    expect(preview.offices.map((o: any) => o.id)).toEqual(offices.map((o) => o.id))
    expect(preview.company.stats).toEqual(home.company.stats)
  })

  test('«Conoce nuestra inmobiliaria»: texto, botón a Nosotros y cifras (reales, con etiqueta propia, y una propia acreditada)', async ({ page }) => {
    await page.goto('/?vista_previa=1')
    const about = page.getByTestId('about-agency')
    await expect(about).toBeVisible()
    await expect(about.getByRole('heading', { level: 2 })).toHaveText('Mucho más que encontrar una casa.')
    await expect(about.getByRole('link', { name: 'Conoce nuestra inmobiliaria' })).toHaveAttribute('href', '/nosotros')
    const statsEl = page.getByTestId('about-agency-stats')
    await expect(statsEl).toBeVisible()
    // Las cifras que se pintan: las elegidas, en orden, saltando las en vivo
    // a cero (la inmobiliaria A puede no tener viviendas publicadas en la
    // base de pruebas), y nunca más de cuatro.
    const chosen = ['team', 'offices', 'properties', 'custom1', 'languages']
    const expected = chosen.filter((k) => k === 'custom1' || Number(stats[k]) > 0).slice(0, 4)
    const omitted = chosen.filter((k) => !expected.includes(k))
    expect(expected.length, 'al menos comerciales, oficinas y la cifra propia').toBeGreaterThanOrEqual(3)
    for (const k of expected) await expect(page.getByTestId(`about-agency-stat-${k}`), k).toBeVisible()
    for (const k of omitted) await expect(page.getByTestId(`about-agency-stat-${k}`), `${k} no se enseña`).toHaveCount(0)
    expect(await statsEl.locator('[data-testid^="about-agency-stat-"]').count()).toBe(expected.length)
    await expect(page.getByTestId('about-agency-stat-team')).toContainText(String(stats.team))
    await expect(page.getByTestId('about-agency-stat-offices')).toContainText(String(stats.offices))
    await expect(page.getByTestId('about-agency-stat-offices')).toContainText('oficinas en Asturias')
    await expect(page.getByTestId('about-agency-stat-custom1')).toContainText('+15')
    await expect(page.getByTestId('about-agency-stat-custom1')).toContainText('años de experiencia')
  })

  test('el bloque de comerciales en diseño editorial: retrato, nombre, puesto, presentación y enlace al perfil; sin segundo bloque de equipo', async ({ page }) => {
    await page.goto('/?vista_previa=1')
    const editorial = page.getByTestId('team-editorial')
    await expect(editorial).toBeVisible()
    await expect(editorial).toContainText('Las personas detrás de cada historia.')
    await expect(editorial).toContainText('Un equipo local y cercano.')
    const card = page.getByTestId(`team-member-${memberSlug}`)
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('href', `/equipo/${memberSlug}`)
    await expect(card).toContainText(`Comercial Editorial ${RUN}`)
    await expect(card).toContainText('Asesora E2E')
    await expect(card).toContainText('Acompaña a familias')
    await expect(card).toContainText('Ver perfil')
    expect(await page.getByTestId('team-cards').count(), 'el diseño de tarjetas no se pinta a la vez').toBe(0)
    expect(await page.getByTestId('team-editorial').count(), 'un solo bloque de equipo').toBe(1)
    // El perfil del comercial lleva la marca real y un Person con worksFor.
    await page.goto(`/equipo/${memberSlug}`)
    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((s) => JSON.parse(s))
    const person = ld.find((x) => x['@type'] === 'Person')
    expect(person).toMatchObject({ name: `Comercial Editorial ${RUN}`, jobTitle: 'Asesora E2E', worksFor: { '@type': 'RealEstateAgent' } })
    // El título lleva la marca real de la inmobiliaria del host (la A se llama así en la base de pruebas), no un nombre fijo.
    const tenant = await (await anon.get('/api/public/tenant')).json()
    expect(await page.title()).toContain(tenant.companyName || tenant.name)
    expect(person.worksFor.name).toBe(tenant.companyName || tenant.name)
  })

  test('«Nuestras oficinas» con una oficina publicada: composición editorial con ficha, horario, teléfono, email, principal, mapa y «Cómo llegar»', async ({ page }) => {
    await page.goto('/?vista_previa=1')
    const offices = page.getByTestId('offices')
    await expect(offices).toBeVisible()
    await expect(offices.getByRole('link', { name: 'Ver todas las oficinas' })).toHaveAttribute('href', '/oficinas')
    await expect(page.getByTestId('offices-editorial'), 'una sola oficina → editorial').toBeVisible()
    const card = page.getByTestId(`office-card-${officeId}`)
    await expect(card).toContainText(`Oficina Centro ${RUN}`)
    await expect(card).toContainText('Calle Uría 1')
    await expect(card).toContainText('33003 Oviedo')
    await expect(card).toContainText('L-V 9:30-18:30')
    await expect(card).toContainText('+34 985 000 999')
    await expect(card).toContainText(`centro-${RUN}@mm.test`)
    await expect(card.getByTestId('office-main-badge')).toBeVisible()
    await expect(card.getByTestId('office-directions')).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=43.3619%2C-5.8494')
    await expect(page.getByTestId('office-map')).toBeVisible()
    await expect(offices).not.toContainText('Oficina Oculta')
    await expect(offices).not.toContainText('Skyline')
  })

  test('«Nuestra experiencia, tu tranquilidad»: tres argumentos numerados y nada más', async ({ page }) => {
    await page.goto('/?vista_previa=1')
    const trust = page.getByTestId('trust-points')
    await expect(trust).toContainText('Experiencia local. Tu tranquilidad.')
    expect(await page.getByTestId('trust-points-list').locator('article').count()).toBe(3)
    await expect(page.getByTestId('trust-point-1')).toContainText('01')
    await expect(page.getByTestId('trust-point-1')).toContainText('Conocemos la zona')
    await expect(trust).not.toContainText('No debería salir')
    await expect(page.getByTestId('trust-points-photo')).toHaveCount(0)
  })

  test('la portada lleva RealEstateAgent con la oficina como department; /oficinas lista las publicadas y entra en el sitemap', async ({ page }) => {
    await page.goto('/?vista_previa=1')
    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((s) => JSON.parse(s))
    const agent = ld.find((x) => x['@type'] === 'RealEstateAgent')
    expect(agent, 'RealEstateAgent en la portada').toBeTruthy()
    expect(agent['@id']).toBe(`${BASE_URL}/#organization`)
    expect(agent.address).toMatchObject({ '@type': 'PostalAddress', streetAddress: 'Calle Uría 1', addressLocality: 'Oviedo', postalCode: '33003' })
    expect(agent.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 43.3619, longitude: -5.8494 })
    const dept = (agent.department as any[]).find((d) => d['@id'] === `${BASE_URL}/oficinas#oficina-${officeId}`)
    expect(dept).toMatchObject({ '@type': 'RealEstateAgent', telephone: '+34 985 000 999' })
    expect(JSON.stringify(agent)).not.toMatch(/aggregateRating|review|foundingDate|openingHours/)

    const res = await page.goto('/oficinas?vista_previa=1')
    expect(res?.status()).toBe(200)
    await expect(page.getByTestId('offices-page-title')).toBeVisible()
    await expect(page.getByTestId(`offices-page-card-${officeId}`)).toContainText('L-V 9:30-18:30')
    await expect(page.getByTestId(`offices-page-card-${officeId}`).getByTestId('offices-page-directions')).toHaveAttribute('href', /query=43\.3619/)
    await expect(page.getByTestId('offices-page-map')).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${BASE_URL}/oficinas`)
    expect(await page.locator('body').textContent()).not.toContain('Oficina Oculta')
    const xml = await (await anon.get('/sitemap.xml')).text()
    expect(xml).toContain('/oficinas</loc>')
    expect(await page.locator('h1').count()).toBe(1)
  })

  test('la biblioteca del Constructor ofrece los tres bloques en «Empresa» y el inspector de cifras enseña los recuentos en vivo', async ({ page }) => {
    await page.goto('/admin/site-builder')
    const structure = page.locator('aside.border-r')
    await expect(structure.getByText(/^01 · Sobre nosotros$/)).toBeVisible()
    await expect(structure.getByText(/^03 · Oficinas$/)).toBeVisible()
    await page.getByTitle('Añadir sección').click()
    await expect(page.getByText('Añadir sección', { exact: true })).toBeVisible()
    const search = page.getByPlaceholder('Buscar secciones...')
    await search.fill('Nuestras oficinas')
    await expect(page.getByRole('button', { name: /^Nuestras oficinas Tus oficinas reales/ })).toBeVisible()
    await search.fill('Sobre nosotros')
    await expect(page.getByRole('button', { name: /^Sobre nosotros La agencia detrás/ })).toBeVisible()
    await search.fill('Por qué elegirnos')
    await expect(page.getByRole('button', { name: /^Por qué elegirnos Tres o cuatro ventajas/ })).toBeVisible()

    await page.goto('/admin/site-builder')
    await structure.getByText(/^01 · Sobre nosotros$/).click()
    await expect(page.getByTestId('stat-live-offices')).toHaveText(String(stats.offices))
    await expect(page.getByTestId('stat-live-team')).toHaveText(String(stats.team))
  })

  test('sin desbordes horizontales en móvil (portada y /oficinas)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL: BASE_URL, storageState: STATE_A })
    const page = await ctx.newPage()
    for (const path of ['/?vista_previa=1', '/oficinas?vista_previa=1']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${path} desborda ${overflow}px`).toBeLessThanOrEqual(0)
    }
    await ctx.close()
  })

  test('el panel de B no ve ni edita la oficina de A; una oficina con coordenadas inválidas o interruptores raros se rechaza', async () => {
    expect((await b.get(`/api/admin/offices/${officeId}`)).status()).toBe(404)
    expect((await b.put(`/api/admin/offices/${officeId}`, { data: { showOnWeb: 0 } })).status()).toBe(404)
    expect((await a.post('/api/admin/offices', { data: { name: 'Mal', lat: 123, status: 'active' } })).status()).toBe(422)
    expect((await a.post('/api/admin/offices', { data: { name: 'Mal', isMain: 2, status: 'active' } })).status()).toBe(422)
    expect((await a.post('/api/admin/offices', { data: { name: 'Mal', showOnWeb: 'sí', status: 'active' } })).status()).toBe(422)
  })
})
