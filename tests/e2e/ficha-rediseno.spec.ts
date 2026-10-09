import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B, ANON_STATE } from './global-setup'
import { buildPng } from '../../test/unit/helpers/mediaFixtures'

/**
 * Ficha pública rediseñada (#111, REdiseñoficha.png): dos columnas desde
 * arriba, migas con «‹ Anterior / Siguiente ›» en la búsqueda del catálogo,
 * galería con contador, flechas, cinco casillas y «+N fotos», cifras y
 * características, «Ver más» y puntos clave, Serendipia Score con su
 * análisis, precio con evolución sólo si cambió de verdad, indicadores y
 * decisión rápida sólo con datos, y el orden del móvil.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const CITY = `Rediseño ${RUN}`
const LONG = Array.from({ length: 6 }, (_, i) => `Párrafo ${i + 1}: vivienda luminosa, con estancias amplias y bien aprovechadas en una zona tranquila y cerca de todos los servicios del barrio.`).join('\n\n')

test.describe('Ficha rediseñada (#111)', () => {
  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  const p: Record<string, { id: number; slug: string; name: string }> = {}
  let foreignSlug = ''

  async function upload(name: string) {
    const res = await a.post('/api/admin/upload', { multipart: { file: { name, mimeType: 'image/png', buffer: Buffer.from(buildPng(160, 100)) }, folder: 'properties' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).key as string
  }

  async function createProperty(ctx: APIRequestContext, developerId: number, name: string, extra: Record<string, any>) {
    const res = await ctx.post('/api/admin/developer-properties', { data: { developerId, name, price: 250000, bedrooms: 2, bathrooms: 1, area: 80, status: 'new', ...extra } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    const { row } = await (await ctx.get(`/api/admin/developer-properties/${id}`)).json()
    cleanup.push(() => ctx.delete(`/api/admin/developer-properties/${id}?hard=1`))
    return { id, slug: row.slug as string, name }
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: ANON_STATE })

    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora rediseño ${RUN}`, email: `red-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))

    const tm = await a.post('/api/admin/team', { data: { name: `Comercial rediseño ${RUN}`, email: `com-red-${RUN}@mm.test`, position: 'Asesora', employmentStatus: 'active', showOnWeb: 1 } })
    expect(tm.ok(), await tm.text()).toBeTruthy()
    const agentId = (await tm.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/team/${agentId}`))
    const avail = await a.put(`/api/admin/saas/agents/${agentId}/availability`, { data: { slotDurationMinutes: 30, rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '18:00' })) } })
    expect(avail.ok(), await avail.text()).toBeTruthy()

    // La completa: siete fotos, descripción larga, puntos clave, comercial con agenda.
    p.rich = await createProperty(a, developerId, `Rediseño completa ${RUN}`, {
      agentId,
      propertyType: 'Apartment',
      yearBuilt: 2024,
      energyRating: 'A',
      orientation: 'SE',
      hasElevator: 1,
      hasGarage: 1,
      hasTerrace: 1,
      community: `Residencial ${RUN}`,
      description: LONG,
      keyHighlights: 'Vivienda luminosa\nZona tranquila\nCerca de servicios',
      coverImage: await upload('portada.png'),
    })
    for (let i = 1; i < 7; i++) {
      const img = await a.post('/api/admin/project-images', { data: { developerPropertyId: p.rich.id, image: await upload(`foto-${i}.png`), sortOrder: i } })
      expect(img.ok(), await img.text()).toBeTruthy()
    }
    // Comercial publicado pero sin horario: no tiene ningún hueco que ofrecer.
    const tmBusy = await a.post('/api/admin/team', { data: { name: `Comercial sin agenda ${RUN}`, email: `com-sin-${RUN}@mm.test`, position: 'Asesor', employmentStatus: 'active', showOnWeb: 1 } })
    expect(tmBusy.ok(), await tmBusy.text()).toBeTruthy()
    const busyAgentId = (await tmBusy.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/team/${busyAgentId}`))
    p.noSlots = await createProperty(a, developerId, `Rediseño sin huecos ${RUN}`, { agentId: busyAgentId, coverImage: await upload('sin-huecos.png') })
    // La sencilla: una foto, sin comercial, sin historial de precio.
    p.plain = await createProperty(a, developerId, `Rediseño sencilla ${RUN}`, { coverImage: await upload('sencilla.png') })
    // Tres seguidas en una ciudad propia, para Anterior / Siguiente dentro del catálogo.
    for (const k of ['c1', 'c2', 'c3']) p[k] = await createProperty(a, developerId, `Rediseño catálogo ${k} ${RUN}`, { city: CITY })

    const devB = await b.post('/api/admin/developers', { data: { name: `Ajena rediseño ${RUN}`, email: `ajena-red-${RUN}@mm.test`, status: 'active' } })
    expect(devB.ok(), await devB.text()).toBeTruthy()
    const devBId = (await devB.json()).id
    cleanup.push(() => b.delete(`/api/admin/developers/${devBId}`))
    foreignSlug = (await createProperty(b, devBId, `Ajena rediseño ${RUN}`, {})).slug
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose(), anon?.dispose()])
  })

  test('escritorio: dos columnas desde arriba, cifras bajo el título y la columna comercial a la derecha', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${p.rich.slug}`)
    const main = await page.getByTestId('ficha-main').boundingBox()
    const aside = await page.getByTestId('ficha-aside').boundingBox()
    expect(main && aside).toBeTruthy()
    expect(aside!.x, 'la columna comercial va a la derecha').toBeGreaterThan(main!.x + main!.width - 1)
    const share = main!.width / (main!.width + aside!.width)
    expect(share, 'la izquierda ocupa unos dos tercios').toBeGreaterThan(0.62)
    expect(share).toBeLessThan(0.74)
    // La galería y la tarjeta de precio empiezan a la misma altura.
    const photo = await page.getByTestId('gallery-main').boundingBox()
    const price = await page.getByTestId('ficha-aside').getByTestId('ficha-price-card').boundingBox()
    expect(Math.abs(photo!.y - price!.y)).toBeLessThan(6)
    await expect(page.getByTestId('ficha-mobile-price')).toBeHidden()
    await expect(page.getByTestId('ficha-mobile-request-visit')).toBeHidden()

    // Orden de la columna derecha: precio, «Atendido por» (con «Asunto» ya relleno y privacidad), decisión rápida; sin CTA fija aparte.
    const order = await page.getByTestId('ficha-aside').evaluate((el) => [...el.querySelectorAll('[data-testid="ficha-price-card"], [data-testid="property-contact-card"], [data-testid="ficha-quick-decision"]')].map((n) => n.getAttribute('data-testid')))
    expect(order[0]).toBe('ficha-price-card')
    expect(order[1]).toBe('property-contact-card')
    await expect(page.getByTestId('ficha-desktop-cta')).toHaveCount(0)
    const card = page.getByTestId('property-contact-card')
    await expect(card.getByTestId('property-contact-subject')).toHaveValue(p.rich.name)
    await expect(card.getByTestId('property-contact-privacy')).toBeVisible()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.rich.name)
    await expect(page.getByTestId('ficha-location')).toContainText(`Residencial ${RUN}`)
    const facts = await page.getByTestId('ficha-key-facts').locator('[data-fact]').evaluateAll((els) => els.map((e) => e.getAttribute('data-fact')))
    expect(facts).toEqual(['bedrooms', 'bathrooms', 'area', 'energyRating', 'orientation', 'propertyType', 'yearBuilt'])
    const features = await page.getByTestId('quick-facts').locator('[data-fact]').evaluateAll((els) => els.map((e) => e.getAttribute('data-fact')))
    expect(features).toEqual(expect.arrayContaining(['elevator', 'garage', 'terrace']))
    expect(features, 'el año y el tipo no se repiten').not.toContain('yearBuilt')
    expect(features).not.toContain('propertyType')
  })

  test('galería: contador, flechas, cinco casillas y «+N fotos», que abre la galería completa', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${p.rich.slug}`)
    const counter = page.getByTestId('gallery-counter')
    await expect(counter).toHaveText('1 / 7')
    await page.getByTestId('gallery-next').click()
    await expect(counter).toHaveText('2 / 7')
    await page.getByTestId('gallery-prev').click()
    await page.getByTestId('gallery-prev').click()
    await expect(counter, 'da la vuelta').toHaveText('7 / 7')
    await expect(page.getByTestId('gallery-status')).toHaveText(/obra nueva/i)
    // Sólo fotos: sin pestañas.
    await expect(page.getByTestId('gallery-tabs')).toHaveCount(0)
    await expect(page.getByTestId('gallery-thumb')).toHaveCount(4)
    await expect(page.getByTestId('gallery-more')).toHaveText(/\+ 3 fotos/)
    // Las casillas siguen a la foto actual: de vuelta a la primera, la primera casilla es la marcada.
    await page.getByTestId('gallery-next').click()
    await expect(counter).toHaveText('1 / 7')
    await expect(page.getByTestId('gallery-thumb').first()).toHaveAttribute('aria-current', 'true')
    await page.getByTestId('gallery-thumb').nth(2).click()
    await expect(counter).toHaveText('3 / 7')
    await page.getByTestId('gallery-thumb').first().click()
    await page.getByTestId('gallery-more').click()
    await expect(page.getByText('1 / 7', { exact: true }).last()).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Escape')
    await expect(counter, 'la principal se queda en la última vista').toHaveText('2 / 7')

    // Con una sola foto: ni flechas ni casillas.
    await page.goto(`/propiedades/${p.plain.slug}`)
    await expect(page.getByTestId('gallery-counter')).toHaveText('1 / 1')
    await expect(page.getByTestId('gallery-next')).toHaveCount(0)
    await expect(page.getByTestId('gallery-thumbs')).toHaveCount(0)
  })

  test('migas: «Propiedades» vuelve a la búsqueda y Anterior / Siguiente siguen sus resultados', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades?municipality=${encodeURIComponent(CITY)}`)
    await expect(page.getByTestId('catalog-total')).toContainText('3')
    // El catálogo va de la más reciente a la más antigua: c3, c2, c1.
    await page.locator(`a[href="/propiedades/${p.c2.slug}"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`/propiedades/${p.c2.slug}$`))
    const crumbs = page.getByTestId('ficha-breadcrumbs').getByRole('navigation', { name: 'Estás en' })
    await expect(crumbs.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/')
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText(p.c2.name)
    await expect(page.getByTestId('ficha-prev')).toHaveAttribute('href', `/propiedades/${p.c3.slug}`)
    await expect(page.getByTestId('ficha-next')).toHaveAttribute('href', `/propiedades/${p.c1.slug}`)
    await expect(page.getByTestId('ficha-breadcrumb-catalog')).toHaveAttribute('href', /municipality=/)

    await page.getByTestId('ficha-next').click()
    await expect(page).toHaveURL(new RegExp(`/propiedades/${p.c1.slug}$`))
    await expect(page.getByTestId('ficha-prev')).toHaveAttribute('href', `/propiedades/${p.c2.slug}`)
    await expect(page.getByTestId('ficha-next-disabled'), 'la última de la búsqueda').toBeVisible()

    await page.getByTestId('ficha-breadcrumb-catalog').click()
    await expect(page).toHaveURL(/municipality=/)
    await expect(page.getByTestId('catalog-total')).toContainText('3')
  })

  test('sin contexto: las vecinas del orden por defecto, y nada de otra agencia', async ({ browser }) => {
    const nb = await (await anon.get(`/api/public/properties/${p.c2.slug}/neighbors`)).json()
    expect(nb.prev?.slug).toBe(p.c3.slug)
    expect(nb.next?.slug).toBe(p.c1.slug)
    expect(Object.keys(nb.prev || {}).sort(), 'sólo nombre y slug').toEqual(['name', 'slug'])
    expect((await anon.get(`/api/public/properties/${foreignSlug}/neighbors`)).status()).toBe(404)
    expect((await anon.get(`/api/public/properties/no-existe-${RUN}/neighbors`)).status()).toBe(404)

    // Entrando por un enlace directo (sin búsqueda en esta pestaña), los botones usan esas vecinas.
    const ctx = await browser.newContext({ storageState: ANON_STATE, viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await page.goto(`/propiedades/${p.c2.slug}`)
    await expect(page.getByTestId('ficha-prev')).toHaveAttribute('href', `/propiedades/${p.c3.slug}`)
    await expect(page.getByTestId('ficha-next')).toHaveAttribute('href', `/propiedades/${p.c1.slug}`)
    await expect(page.getByTestId('ficha-breadcrumb-catalog')).toHaveAttribute('href', '/propiedades')
    // Comparar desde las migas usa el comparador de siempre.
    await page.getByTestId('ficha-compare').click()
    await expect(page.getByTestId('ficha-compare')).toHaveAttribute('aria-pressed', 'true')
    await ctx.close()
  })

  test('descripción con «Ver más» y los puntos clave; el Score con su análisis completo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${p.rich.slug}`)
    const text = page.getByTestId('ficha-description-text')
    const more = page.getByTestId('ficha-description-more')
    await expect(more).toBeVisible()
    const clamped = await text.evaluate((el) => el.clientHeight < el.scrollHeight)
    expect(clamped, 'recortada al principio').toBe(true)
    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(await text.evaluate((el) => el.clientHeight >= el.scrollHeight - 1)).toBe(true)
    const hl = page.getByTestId('ficha-highlights')
    await expect(hl).toHaveAttribute('data-source', 'editorial')
    for (const h of ['Vivienda luminosa', 'Zona tranquila', 'Cerca de servicios']) await expect(hl).toContainText(h)

    const api = await (await anon.get(`/api/public/properties/${p.rich.slug}/score`)).json()
    const score = page.getByTestId('serendipia-score')
    await score.scrollIntoViewIfNeeded()
    await expect(score).toContainText(String(api.overall))
    await expect(page.getByTestId('serendipia-score-bars').locator('li')).toHaveCount(Math.min(4, api.breakdown.length))
    await expect(page.getByTestId('serendipia-score-summary')).toContainText('Destaca en')
    await page.getByTestId('serendipia-score-more').click()
    // Cada factor dice de qué dato sale, con la frase compuesta en el idioma de la web (useScoreText).
    const detail = page.getByTestId('serendipia-score-detail')
    expect(await detail.locator('[data-factor]').evaluateAll((els) => els.map((e) => e.getAttribute('data-factor')))).toEqual(api.breakdown.map((b: any) => b.key))
    await expect(detail.locator('[data-factor="comodidades"] dd')).toHaveText('garaje, terraza y ascensor · eficiencia A')
    await expect(detail.locator('[data-factor="entrega"] dd')).toHaveText('Obra nueva / sobre plano — mayor plazo hasta la entrega')

    // Sin frases de relleno: la sencilla no tiene recuadro de puntos destacados ni «Lo que debes saber» inventado.
    await page.goto(`/propiedades/${p.plain.slug}`)
    await expect(page.getByTestId('ficha-highlights')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText('Ubicación privilegiada')
    await expect(page.locator('main')).not.toContainText('Acabados de calidad')
  })

  test('precio: €/m² y la evolución sólo tras un cambio de precio real', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${p.plain.slug}`)
    const card = page.getByTestId('ficha-aside').getByTestId('ficha-price-card')
    await expect(card.getByTestId('ficha-price-m2')).toContainText('125')
    await expect(card.getByTestId('ficha-price-trend')).toHaveCount(0)

    const put = await a.put(`/api/admin/developer-properties/${p.plain.id}`, { data: { price: 240000 } })
    expect(put.ok(), await put.text()).toBeTruthy()
    const hist = await (await anon.get(`/api/public/properties/${p.plain.slug}/price-history`)).json()
    expect(hist.history.at(-1)).toMatchObject({ price: 240000, previousPrice: 250000 })
    await page.reload()
    await expect(card.getByTestId('ficha-price-trend')).toContainText('-4%')
    await expect(card.getByTestId('ficha-price-trend')).toContainText('desde')
  })

  test('indicadores y decisión rápida: sólo con datos reales, y la visita a la ficha cuenta', async ({ browser }) => {
    const before = await (await anon.get(`/api/public/properties/${p.c3.slug}/engagement`)).json()
    expect(before.viewsThisWeek).toBe(0)
    // IP propia: el registro de visitas tiene un límite por IP que comparten todas las pruebas.
    const ctx = await browser.newContext({ storageState: ANON_STATE, viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'cf-connecting-ip': `203.0.113.${(Date.now() % 250) + 3}` } })
    const page = await ctx.newPage()
    await page.goto(`/propiedades/${p.c3.slug}`)
    await expect(page.locator('h1')).toBeVisible()
    await expect.poll(async () => (await (await anon.get(`/api/public/properties/${p.c3.slug}/engagement`)).json()).viewsThisWeek).toBe(1)
    // La misma persona vuelve enseguida: no cuenta dos veces, y ya se ve en los indicadores.
    await page.reload()
    const ind = page.getByTestId('ficha-indicators')
    await expect(ind).toBeVisible()
    await expect(ind.locator('[data-indicator="views"]')).toContainText('1 visita esta semana')
    expect((await (await anon.get(`/api/public/properties/${p.c3.slug}/engagement`)).json()).viewsThisWeek).toBe(1)

    const api = await (await anon.get(`/api/public/properties/${p.c3.slug}/score`)).json()
    const expected = (api.decision as any[]).filter((d) => ['comprar', 'inversion', 'revalorizacion', 'liquidez'].includes(d.key) && d.stars != null).map((d) => d.key)
    const decision = page.getByTestId('ficha-quick-decision')
    if (expected.length) {
      await expect(decision.locator('[data-decision]')).toHaveCount(expected.length)
      expect(await decision.locator('[data-decision]').evaluateAll((els) => els.map((e) => e.getAttribute('data-decision')))).toEqual(expected)
      await decision.getByText('Cómo se calcula').click()
      await expect(page.getByTestId('ficha-quick-decision-method')).toContainText((api.decision as any[]).find((d) => d.key === expected[0]).detail)
    } else {
      await expect(decision).toHaveCount(0)
    }
    await ctx.close()
  })

  test('móvil: galería, precio, datos clave, «Solicitar visita» y el resto, sin desbordes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/propiedades/${p.rich.slug}`)
    await expect(page.getByTestId('ficha-mobile-price')).toBeVisible()
    await expect(page.getByTestId('ficha-aside').getByTestId('ficha-price-card')).toBeHidden()
    // La descripción va ahora dentro de la tarjeta principal (megaprompt «ficha»), antes del botón.
    const tops = await page.evaluate(() => ['#fotos', '[data-testid="ficha-mobile-price"]', '[data-testid="ficha-summary"]', '#descripcion', '[data-testid="ficha-mobile-request-visit"]', '[data-testid="ficha-section-nav"]', '#contacto'].map((sel) => Math.round(document.querySelector(sel)!.getBoundingClientRect().top + window.scrollY)))
    expect([...tops].sort((x, y) => x - y), tops.join(', ')).toEqual(tops)
    const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest('[data-testid="ficha-section-nav"], [data-testid="gallery-tabs"]')).slice(0, 6).map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`))
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), wide.join(' | ')).toBeLessThanOrEqual(0)
    await page.getByTestId('ficha-mobile-request-visit').click()
    await expect(page.getByRole('heading', { name: /Reservar/ })).toBeVisible()
  })

  test('visita desde la tarjeta de precio y por videollamada', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${p.rich.slug}`)
    const card = page.getByTestId('ficha-aside').getByTestId('ficha-price-card')
    await expect(card.getByTestId('next-visit-slot')).toBeVisible()
    await card.getByTestId('next-visit-slot').click()
    await expect(page.locator('#book-appt-name')).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar' }).click()
    await card.getByTestId('ficha-video-visit').click()
    await expect(page.getByRole('heading', { name: 'Agendar videollamada' })).toBeVisible()

    // Sin comercial: no hay videollamada que ofrecer, y la próxima visita lleva al formulario.
    await page.goto(`/propiedades/${p.plain.slug}`)
    const plain = page.getByTestId('ficha-aside').getByTestId('ficha-price-card')
    await expect(plain.getByTestId('next-visit-request')).toBeVisible()
    await expect(plain.getByTestId('ficha-video-visit')).toHaveCount(0)

    // Con comercial pero sin ningún hueco libre: tampoco se ofrece la videollamada.
    await page.goto(`/propiedades/${p.noSlots.slug}`)
    const noSlots = page.getByTestId('ficha-aside').getByTestId('ficha-price-card')
    await expect(noSlots.getByTestId('next-visit-request')).toBeVisible()
    await expect(noSlots.getByTestId('ficha-video-visit')).toHaveCount(0)
    // Sin huecos, «Atendido por» no ofrece «Solicitar visita» (no hay horas): queda el formulario.
    await expect(page.getByTestId('property-contact-card')).toBeVisible()
    await expect(page.getByTestId('property-contact-visit')).toHaveCount(0)
    await expect(page.locator('#book-appt-name')).toHaveCount(0)
  })
})
