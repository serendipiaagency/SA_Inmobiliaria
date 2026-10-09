import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B, ANON_STATE } from './global-setup'
import { buildPng } from '../../test/unit/helpers/mediaFixtures'

/**
 * Megaprompt «ficha»: descripción bajo el título con «Ver más», referencia
 * comercial «Ref.», «Atendido por» fijo en escritorio con «Solicitar visita»
 * dentro y fondo de marca, la etiqueta energética A–G con los valores reales
 * de Property Core, y secciones sin datos ocultas (también en la barra de
 * apartados) — con una propiedad completa y otra incompleta, en la web y en
 * el Constructor.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const LONG = Array.from({ length: 6 }, (_, i) => `Párrafo ${i + 1}: vivienda luminosa con estancias amplias, cocina independiente y vistas despejadas en una calle tranquila del centro.`).join('\n\n')

test.describe('Ficha: descripción, referencia, «Atendido por», energía y secciones sin datos', () => {
  // El Constructor necesita la sesión del panel; la web pública se ve igual con ella.
  test.use({ storageState: STATE_A })
  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []
  let rich: { id: number; slug: string; name: string }
  let bare: { id: number; slug: string; name: string }

  async function upload(name: string) {
    const res = await a.post('/api/admin/upload', { multipart: { file: { name, mimeType: 'image/png', buffer: Buffer.from(buildPng(160, 100)) }, folder: 'properties' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).key as string
  }

  async function createProperty(developerId: number, name: string, extra: Record<string, any>) {
    const res = await a.post('/api/admin/developer-properties', { data: { developerId, name, price: 320000, bedrooms: 3, bathrooms: 2, area: 95, status: 'ready', ...extra } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    const { row } = await (await a.get(`/api/admin/developer-properties/${id}`)).json()
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    return { id, slug: row.slug as string, name }
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: ANON_STATE })

    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora mejoras ${RUN}`, email: `mej-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))

    const tm = await a.post('/api/admin/team', { data: { name: `Comercial mejoras ${RUN}`, email: `com-mej-${RUN}@mm.test`, position: 'Asesora', employmentStatus: 'active', showOnWeb: 1 } })
    expect(tm.ok(), await tm.text()).toBeTruthy()
    const agentId = (await tm.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/team/${agentId}`))
    const avail = await a.put(`/api/admin/saas/agents/${agentId}/availability`, { data: { slotDurationMinutes: 30, rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '18:00' })) } })
    expect(avail.ok(), await avail.text()).toBeTruthy()

    // La completa: descripción larga, comercial con agenda, coordenadas, certificado energético y referencia.
    rich = await createProperty(developerId, `Mejoras completa ${RUN}`, {
      agentId,
      transactionType: 'sale',
      energyRating: 'E',
      orientation: 'S',
      lat: 43.5453,
      lng: -5.6619,
      community: `Barrio mejoras ${RUN}`,
      description: LONG,
      coverImage: await upload('portada.png'),
    })
    const sheet = await a.put(`/api/admin/developer-properties/${rich.id}`, {
      data: { commercialCode: `NOR-${RUN}`, energyConsumption: 199.2, emissionsRating: 'E', emissionsValue: 42.2, energyCertificateExpiry: '2034-05-20' },
    })
    expect(sheet.ok(), await sheet.text()).toBeTruthy()
    // La incompleta: sin comercial, sin coordenadas, sin certificado ni referencia y con una descripción corta.
    bare = await createProperty(developerId, `Mejoras incompleta ${RUN}`, { transactionType: 'sale', description: 'Piso pequeño junto al parque.' })
  })

  test.afterAll(async () => {
    await a.delete('/api/admin/site-pages/ficha-propiedad').catch(() => null)
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose(), anon?.dispose()])
  })

  test('la referencia y las cifras energéticas salen de Property Core, sólo con sus campos públicos', async () => {
    const pub = await (await anon.get(`/api/public/properties/${rich.slug}`)).json()
    expect(pub.details.commercialCode).toBe(`NOR-${RUN}`)
    expect(pub.project.energyRating).toBe('E')
    expect(Number(pub.details.energyConsumption)).toBe(199.2)
    expect(pub.details.emissionsRating).toBe('E')
    expect(pub.availability).toMatchObject({ similar: true })
    // Ni el número de registro del certificado ni lo interno salen nunca.
    expect(pub.details).not.toHaveProperty('energyCertificateNumber')
    expect(pub.project).not.toHaveProperty('reference')
  })

  test('descripción bajo el título con «Ver más»/«Ver menos», «Ref.» discreta y datos clave debajo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${rich.slug}`)
    const summary = page.getByTestId('ficha-summary')
    await expect(summary.getByTestId('ficha-reference')).toHaveText(new RegExp(`Ref\\.\\s*NOR-${RUN}`))
    // Orden dentro de la tarjeta: título, ubicación, referencia, descripción, datos clave.
    const tops = await page.evaluate(() =>
      ['h1', '[data-testid="ficha-location"]', '[data-testid="ficha-reference"]', '[data-testid="ficha-description"]', '[data-testid="ficha-key-facts"]'].map((sel) => Math.round(document.querySelector(sel)!.getBoundingClientRect().top)),
    )
    expect([...tops].sort((x, y) => x - y), tops.join(', ')).toEqual(tops)
    // Una sola descripción en toda la ficha.
    await expect(page.locator('#descripcion')).toHaveCount(1)
    await expect(page.getByTestId('ficha-description-text')).toHaveCount(1)

    const text = page.getByTestId('ficha-description-text')
    const more = page.getByTestId('ficha-description-more')
    await expect(more).toHaveText(/Ver más/)
    await expect(more).toHaveAttribute('aria-controls', /.+/)
    expect(await text.evaluate((el) => el.clientHeight < el.scrollHeight), 'recortada').toBe(true)
    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    await expect(more).toHaveText(/Ver menos/)
    expect(await text.evaluate((el) => el.clientHeight >= el.scrollHeight - 1)).toBe(true)
    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'false')

    // Corta: sin botón; sin referencia: sin «Ref.».
    await page.goto(`/propiedades/${bare.slug}`)
    await expect(page.getByTestId('ficha-description-text')).toContainText('Piso pequeño junto al parque.')
    await expect(page.getByTestId('ficha-description-more')).toHaveCount(0)
    await expect(page.getByTestId('ficha-reference')).toHaveCount(0)
  })

  test('eficiencia energética: siete clases, la de la vivienda marcada con sus valores reales; sin datos, no sale', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${rich.slug}`)
    const card = page.getByTestId('ficha-energy').getByTestId('energy-card')
    await card.scrollIntoViewIfNeeded()
    await expect(card).toContainText('Eficiencia energética')
    const table = card.getByTestId('energy-table')
    await expect(table.locator('tbody tr')).toHaveCount(7)
    expect(await table.locator('tbody tr').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-letter')))).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    await expect(table.locator('tr[data-active]')).toHaveAttribute('data-letter', 'E')
    // Los valores sólo en la fila de la vivienda, con su coma decimal y marcados también con texto.
    await expect(card.getByTestId('energy-consumption')).toHaveCount(1)
    await expect(card.getByTestId('energy-consumption')).toContainText('199,2')
    await expect(card.getByTestId('energy-consumption')).toContainText('Esta vivienda')
    await expect(card.getByTestId('energy-emissions')).toContainText('42,2')
    await expect(table.locator('tr[data-letter="A"]')).not.toContainText(/\d/)
    await expect(card.getByTestId('energy-certificate')).toContainText('vigente hasta')
    await expect(page.getByTestId('ficha-section-nav')).toContainText('Energía')

    await page.goto(`/propiedades/${bare.slug}`)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByTestId('ficha-energy')).toHaveCount(0)
    await expect(page.getByTestId('ficha-section-nav')).not.toContainText('Energía')
  })

  test('secciones sin datos: ni tarjeta ni pestaña, y cada pestaña lleva a algo que existe', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${bare.slug}`)
    await expect(page.locator('h1')).toBeVisible()
    // Sin coordenadas: ni mapa ni entorno; sin historial: sin evolución de precio; sin orientación: sin sol.
    for (const id of ['ubicacion', 'servicios', 'precio', 'orientacion', 'energia']) await expect(page.locator(`#${id}`), id).toHaveCount(0)
    const nav = (await page.getByTestId('ficha-section-nav').locator('a').allTextContents()).map((s) => s.trim())
    for (const label of ['Ubicación', 'Servicios', 'Precio', 'Sol', 'Energía']) expect(nav, label).not.toContain(label)
    const targets = await page.getByTestId('ficha-section-nav').locator('a').evaluateAll((as) => as.map((el) => el.getAttribute('href')!.slice(1)))
    const missing = await page.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), targets)
    expect(missing, 'pestañas a secciones que no están').toEqual([])

    // La completa sí las tiene.
    await page.goto(`/propiedades/${rich.slug}`)
    for (const id of ['ubicacion', 'orientacion', 'energia']) await expect(page.locator(`#${id}`), id).toHaveCount(1)
  })

  test('«Atendido por» fijo en escritorio bajo la cabecera, con fondo destacado, «Asunto» y «Solicitar visita»', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${rich.slug}`)
    await expect(page.getByTestId('ficha-desktop-cta')).toHaveCount(0)
    const sticky = page.getByTestId('ficha-contact-sticky')
    expect(await sticky.evaluate((el) => getComputedStyle(el).position)).toBe('sticky')
    const card = page.getByTestId('property-contact-card')
    // Fondo suave de marca, distinto del blanco del resto de tarjetas.
    await expect(card).toHaveAttribute('data-tone', 'brand')
    expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)')

    // Al bajar, se queda a la vista y no se mete bajo la cabecera.
    await page.locator('#ubicacion').scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await expect(sticky).toBeInViewport()
    const headerBottom = await page.locator('[data-site-header]').evaluate((el) => el.getBoundingClientRect().bottom)
    const stickyBox = await sticky.boundingBox()
    expect(stickyBox!.y, 'no tapa ni queda tapada por la cabecera').toBeGreaterThanOrEqual(headerBottom - 1)
    expect(stickyBox!.y + stickyBox!.height, 'no se sale por abajo').toBeLessThanOrEqual(900 + 1)
    // No se superpone a las tarjetas de debajo (indicadores, decisión rápida, promotora).
    const after = await page.getByTestId('ficha-aside').evaluate((aside) => {
      const rail = aside.querySelector('.ficha-contact-rail')!
      const sib = rail.nextElementSibling as HTMLElement | null
      return sib ? sib.getBoundingClientRect().top - rail.getBoundingClientRect().bottom : 0
    })
    expect(after).toBeGreaterThanOrEqual(0)

    // «Asunto» opcional, ya relleno con la propiedad, y se envía con el mensaje (lead real del CRM).
    await expect(card.getByTestId('property-contact-subject')).toHaveValue(rich.name)
    await card.getByTestId('property-contact-subject').fill(`Visita ${RUN}`)
    await card.getByLabel('Nombre').fill(`Visitante mejoras ${RUN}`)
    await card.getByLabel('Email').fill(`mej-${RUN}@example.com`)
    await card.getByLabel('Mensaje').fill('¿Se puede ver el sábado?')
    await card.getByTestId('property-contact-privacy').check()
    const sent = page.waitForRequest((r) => r.url().endsWith('/api/public/contact') && r.method() === 'POST')
    await card.getByTestId('property-contact-submit').click()
    expect((await sent).postDataJSON()).toMatchObject({ form: 'property', propertySlug: rich.slug, subject: `Visita ${RUN}` })
    await expect(card.getByTestId('property-contact-success')).toBeVisible({ timeout: 15_000 })

    // «Solicitar visita» abre la agenda real de siempre.
    await card.getByTestId('property-contact-visit').click()
    await expect(page.getByRole('heading', { name: 'Reservar cita' })).toBeVisible()
  })

  test('móvil: «Atendido por» en el flujo, tabla legible y sin desbordes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/propiedades/${rich.slug}`)
    await expect(page.getByTestId('ficha-reference')).toBeVisible()
    expect(await page.getByTestId('ficha-contact-sticky').evaluate((el) => getComputedStyle(el).position)).toBe('static')
    await page.getByTestId('ficha-energy').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('energy-table')).toBeVisible()
    const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest('[data-testid="ficha-section-nav"], [data-testid="gallery-tabs"]')).slice(0, 6).map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`))
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), wide.join(' | ')).toBeLessThanOrEqual(0)
  })

  test('Constructor: referencia, fondo, tabla energética y vacíos se ajustan y avisan; al publicar, la web los sigue', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    // La propiedad de ejemplo del lienzo (la más reciente de la empresa) y si tiene datos energéticos.
    const sample = await (await a.get('/api/admin/site-pages/ficha-sample')).json()
    expect(sample.property, 'hay propiedad de ejemplo').toBeTruthy()
    const sampleHasEnergy = !!(sample.property.project.energyRating || sample.property.details?.emissionsRating || sample.property.details?.energyConsumption != null || sample.property.details?.emissionsValue != null)

    await page.goto('/admin/site-builder?pagina=ficha-propiedad')
    const canvas = page.frameLocator('iframe[title="Vista previa del Constructor Web"]')
    const preview = canvas.getByTestId('page-core-preview')
    await expect(preview).toBeVisible({ timeout: 15_000 })
    await preview.click()
    const inspector = page.getByTestId('page-core-inspector')
    await expect(inspector).toBeVisible()

    // Aviso sólo editando: la sección sin datos sigue en la lista, marcada.
    const energyItem = canvas.getByTestId('page-core-sections-preview').locator('li[data-section="energia"]')
    await expect(energyItem).toBeVisible({ timeout: 10_000 })
    if (sampleHasEnergy) await expect(energyItem.getByTestId('energy-card')).toBeVisible()
    else await expect(energyItem.getByTestId('page-core-section-empty')).toContainText('se ocultará en la web pública')

    // Ocultar la referencia, fondo blanco y la tabla compacta.
    await inspector.getByTestId('page-core-show-reference').getByRole('switch').click()
    await inspector.getByTestId('page-core-contact-tone').getByRole('button', { name: 'Blanco' }).click()
    // La zona no tiene pestañas: la presentación de la tabla va en el mismo inspector.
    await inspector.getByTestId('energy-opt-layout').getByRole('button', { name: 'Compacta' }).click()
    await expect(canvas.getByTestId('page-core-contact-preview')).toHaveAttribute('data-tone', 'white')
    await expect(canvas.getByTestId('page-core-reference-preview')).toHaveCount(0)
    await expect.poll(async () => {
      const draft = await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
      const core = (draft.blocks as any[]).find((blk) => blk.type === 'page-core')?.content || {}
      return `${core.showReference}|${core.contactTone}|${core.energy?.layout}`
    }, { timeout: 10_000 }).toBe('false|white|compact')

    await page.getByRole('button', { name: 'Publicar cambios' }).click()
    await expect(page.getByTestId('site-page-status-ficha-propiedad')).toHaveText('Publicada')

    const web = await page.context().newPage()
    await web.setViewportSize({ width: 1440, height: 900 })
    await web.goto(`/propiedades/${rich.slug}`)
    await expect(web.locator('h1')).toBeVisible()
    await expect(web.getByTestId('ficha-reference')).toHaveCount(0)
    await expect(web.getByTestId('property-contact-card')).toHaveAttribute('data-tone', 'white')
    // Compacta: la letra y las cifras, sin las siete filas.
    await expect(web.getByTestId('ficha-energy').getByTestId('energy-table')).toHaveCount(0)
    await expect(web.getByTestId('ficha-energy').getByTestId('energy-summary')).toContainText('199,2')
    await web.close()

    expect((await a.delete('/api/admin/site-pages/ficha-propiedad')).ok()).toBeTruthy()
  })

  test('Constructor: el bloque «Eficiencia energética» de la biblioteca sólo en la ficha, y en la web sólo con datos', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/site-builder?pagina=ficha-propiedad')
    const canvas = page.frameLocator('iframe[title="Vista previa del Constructor Web"]')
    await expect(canvas.getByTestId('page-core-preview')).toBeVisible({ timeout: 15_000 })
    await page.getByTitle('Añadir sección').click()
    const library = page.getByTestId('section-library')
    await library.getByPlaceholder('Buscar secciones...').fill('Eficiencia')
    await page.getByRole('button', { name: /^Eficiencia energética La etiqueta A–G/ }).click()
    await expect(canvas.locator('[data-testid="energy-block"], [data-testid="energy-block-empty"]').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('energy-block-inspector')).toBeVisible()
    // Como bloque de la biblioteca, el diseño va en su pestaña.
    await expect(page.getByTestId('energy-opt-layout')).toHaveCount(0)
    await page.locator('aside.border-l').getByRole('button', { name: 'Diseño', exact: true }).click()
    await expect(page.getByTestId('energy-opt-layout')).toBeVisible()
    await expect.poll(async () => {
      const draft = await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
      return (draft.blocks as any[]).filter((blk) => blk.type === 'energy-efficiency').length
    }, { timeout: 10_000 }).toBe(1)
    await page.getByRole('button', { name: 'Publicar cambios' }).click()
    await expect(page.getByTestId('site-page-status-ficha-propiedad')).toHaveText('Publicada')

    // En la portada no se ofrece: no hay propiedad que enseñar.
    await page.goto('/admin/site-builder')
    await page.getByTitle('Añadir sección').click()
    await page.getByTestId('section-library').getByPlaceholder('Buscar secciones...').fill('Eficiencia')
    await expect(page.getByRole('button', { name: /^Eficiencia energética La etiqueta A–G/ })).toHaveCount(0)

    const web = await page.context().newPage()
    await web.goto(`/propiedades/${rich.slug}`)
    await expect(web.getByTestId('energy-block').getByTestId('energy-card')).toContainText('199,2')
    await web.goto(`/propiedades/${bare.slug}`)
    await expect(web.locator('h1')).toBeVisible()
    await expect(web.getByTestId('energy-block')).toHaveCount(0)
    await expect(web.getByTestId('energy-block-empty')).toHaveCount(0)
    await web.close()

    expect((await a.delete('/api/admin/site-pages/ficha-propiedad')).ok()).toBeTruthy()
  })

  test('aislamiento: la propiedad de ejemplo del Constructor es siempre de la propia empresa', async () => {
    const mine = await (await a.get('/api/admin/site-pages/ficha-sample')).json()
    const theirs = await (await b.get('/api/admin/site-pages/ficha-sample')).json()
    expect(mine.property?.project?.id).toBeTruthy()
    expect(theirs.property?.project?.id ?? null).not.toBe(mine.property.project.id)
    expect(String(theirs.property?.project?.name || '')).not.toContain(RUN)
    expect((await anon.get('/api/admin/site-pages/ficha-sample')).status()).toBeGreaterThanOrEqual(401)
  })
})
