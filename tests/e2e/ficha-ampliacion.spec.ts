import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B, ANON_STATE } from './global-setup'
import { buildPng, buildValidPdf } from '../../test/unit/helpers/mediaFixtures'

/**
 * Ficha pública ampliada (#110): planos del editor (orden, título y
 * visibilidad) con su visor, «Estado del inmueble» y «El edificio» sólo con lo
 * que consta, «Documentación» (Ver / Descargar), la reserva de
 * visita desde la ficha (privacidad, «Visita reservada», lead y cita con su
 * propiedad, hora ocupada), la llamada fija a «Solicitar visita», las pestañas
 * de la galería sólo con contenido y las secciones del Constructor.
 *
 * La reserva pública tiene un tope por IP: cada reserva de este fichero sale
 * de una IP de documentación distinta.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
let ipSeq = 0
const ip = () => `203.0.113.${((Date.now() + ipSeq++ * 11) % 250) + 3}`

test.describe('Ficha ampliada: planos, estado, edificio, documentos y reserva', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let agent: { id: number; name: string; slug: string }
  let full: { id: number; slug: string }
  let empty: { id: number; slug: string }
  const plans: Record<string, number> = {}
  const cleanup: Array<() => Promise<unknown>> = []

  async function createProperty(developerId: number, name: string, extra: Record<string, any>) {
    const res = await a.post('/api/admin/developer-properties', { data: { developerId, name, price: 250000, bedrooms: 2, bathrooms: 1, area: 80, community: `Ampliación ${RUN}`, ...extra } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    const { row } = await (await a.get(`/api/admin/developer-properties/${id}`)).json()
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    return { id, slug: row.slug as string }
  }

  async function uploadImage(name: string) {
    const res = await a.post('/api/admin/upload', { multipart: { file: { name, mimeType: 'image/png', buffer: Buffer.from(buildPng(120, 80)) }, folder: 'floor-plans' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).key as string
  }

  async function uploadDocument(fields: Record<string, string>) {
    const res = await a.post('/api/admin/property-documents/private-upload', {
      multipart: { file: { name: 'memoria.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await buildValidPdf()) }, propertyKind: 'developer', propertyId: String(full.id), docType: 'other', visibility: 'public', ...fields },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).document
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: ANON_STATE })

    const dev = await a.post('/api/admin/developers', { data: { name: `Ampliación ${RUN}`, email: `ampl-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))

    const agentName = `Inés Agenda ${RUN}`
    const tm = await a.post('/api/admin/team', { data: { name: agentName, email: `ines-${RUN}@mm.test`, position: 'Asesora', employmentStatus: 'active', showOnWeb: 1 } })
    expect(tm.ok(), await tm.text()).toBeTruthy()
    const agentId = (await tm.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/team/${agentId}`))
    // Agenda abierta todos los días de 9 a 18, en huecos de media hora.
    const avail = await a.put(`/api/admin/saas/agents/${agentId}/availability`, { data: { slotDurationMinutes: 30, rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '18:00' })) } })
    expect(avail.ok(), await avail.text()).toBeTruthy()

    full = await createProperty(developerId, `Ampliación completa ${RUN}`, {
      status: 'ready',
      agentId,
      yearBuilt: 2008,
      hasElevator: 1,
      publishedAt: '2026-10-01 10:00:00',
      coverImage: await uploadImage('portada.png'),
    })
    // Ficha ampliada (Property Core): lo que pintan «Estado del inmueble» y «El edificio».
    const sheet = await a.put(`/api/admin/developer-properties/${full.id}`, {
      data: { kitchenEquipment: 'equipped', bathroomsCondition: 'renovated', isRenovated: 0, buildingFloors: 6, unitsPerFloor: 4, buildingCondition: 'good', hasCommunityPool: 1, hasGym: 1 },
    })
    expect(sheet.ok(), await sheet.text()).toBeTruthy()
    empty = await createProperty(developerId, `Ampliación vacía ${RUN}`, { status: 'ready' })

    const ficha = await (await anon.get(`/api/public/properties/${full.slug}`)).json()
    agent = { id: agentId, name: agentName, slug: ficha.agent?.slug }
    expect(agent.slug, 'la ficha trae el comercial con su slug').toBeTruthy()
  })

  test.afterAll(async () => {
    await a.delete('/api/admin/site-pages/ficha-propiedad').catch(() => null)
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose(), anon?.dispose()])
  })

  test('planos: el orden, los títulos y la visibilidad del editor llegan a la web; otra agencia no los toca', async () => {
    const create = async (data: Record<string, any>) => {
      const res = await a.post('/api/admin/floor-plans', { data: { developerPropertyId: full.id, ...data } })
      expect(res.ok(), await res.text()).toBeTruthy()
      return (await res.json()).id as number
    }
    plans.alta = await create({ title: 'Planta alta', image: await uploadImage('alta.png'), sortOrder: 2 })
    plans.baja = await create({ title: '  Planta baja  ', image: await uploadImage('baja.png'), sortOrder: 1 })
    plans.oculto = await create({ title: 'Borrador interno', image: await uploadImage('borrador.png'), sortOrder: 0, isPublic: 0 })
    plans.sinImagen = await create({ title: 'Sin imagen', sortOrder: 3 })

    const pub = await (await anon.get(`/api/public/properties/${full.slug}`)).json()
    expect(pub.floorPlans.map((f: any) => f.title)).toEqual(['Planta baja', 'Planta alta'])
    for (const k of ['developerPropertyId', 'isPublic', 'sortOrder', 'organizationId']) expect(pub.floorPlans[0], k).not.toHaveProperty(k)

    // Cambiar el orden desde el editor (PUT del sortOrder) se refleja en la web.
    expect((await a.put(`/api/admin/floor-plans/${plans.alta}`, { data: { sortOrder: 0 } })).ok()).toBeTruthy()
    const reordered = await (await anon.get(`/api/public/properties/${full.slug}`)).json()
    expect(reordered.floorPlans.map((f: any) => f.title)).toEqual(['Planta alta', 'Planta baja'])

    // Aislamiento: otra agencia ni los lista ni los cambia.
    const foreign = await (await b.get('/api/admin/floor-plans', { params: { developerPropertyId: String(full.id) } })).json()
    expect(foreign.rows ?? []).toEqual([])
    expect((await b.put(`/api/admin/floor-plans/${plans.alta}`, { data: { isPublic: 0 } })).status()).toBe(404)
  })

  test('plano en la ficha: pestañas, visor a pantalla completa con zoom y pestaña «Planos» en la galería', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${full.slug}`)
    const section = page.getByTestId('property-floor-plans')
    await expect(section).toBeVisible()
    await expect(section).toContainText('Planos de la vivienda')
    await expect(page.getByTestId('floor-plan-tab-0')).toHaveText(/Planta alta/)
    await page.getByTestId('floor-plan-tab-1').click()
    await expect(page.getByTestId('floor-plan-image')).toHaveAttribute('alt', /Planta baja/)

    await page.getByTestId('floor-plan-expand').click()
    const viewer = page.getByTestId('floor-plan-viewer')
    await expect(viewer).toBeVisible()
    await expect(page.getByTestId('floor-plan-zoom-level')).toHaveText('100 %')
    await page.getByTestId('floor-plan-zoom-in').click()
    await expect(page.getByTestId('floor-plan-zoom-level')).not.toHaveText('100 %')
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()

    // Galería: sólo las pestañas con contenido.
    const tabs = await page.locator('[data-gallery-tab]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gallery-tab')))
    expect(tabs).toContain('fotos')
    expect(tabs).toContain('plano')
    for (const none of ['video', 'drone', 'noche', 'redes', '360']) expect(tabs, none).not.toContain(none)
    await page.locator('[data-gallery-tab="plano"]').click()
    await expect(page.getByTestId('gallery-plans')).toBeVisible()
  })

  test('estado del inmueble y edificio: lo que consta, separado; sin datos, sin tarjetas ni pestañas', async ({ page }) => {
    await page.goto(`/propiedades/${full.slug}`)
    const condition = page.getByTestId('property-condition')
    await expect(condition).toContainText('Equipada')
    await expect(condition).toContainText('Reformados')
    await expect(condition.locator('[data-fact="renovated"] dd'), 'un «No» marcado se enseña').toHaveText('No')
    const building = page.getByTestId('property-building')
    await expect(building).toContainText('Viviendas por planta')
    await expect(building).toContainText('Piscina y gimnasio')
    await expect(building).toContainText('2008')
    await expect(building, 'la calefacción va en el inmueble, no en el edificio').not.toContainText('Calefacción')

    await page.goto(`/propiedades/${empty.slug}`)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByTestId('property-condition')).toHaveCount(0)
    await expect(page.getByTestId('property-building')).toHaveCount(0)
    await expect(page.getByTestId('property-floor-plans')).toHaveCount(0)
    await expect(page.getByTestId('public-property-documents')).toHaveCount(0)
    const nav = await page.locator('nav a[href^="#"]').allTextContents()
    for (const label of ['Plano', 'Estado', 'Edificio', 'Documentación']) expect(nav.map((s) => s.trim().toLowerCase()), label).not.toContain(label.toLowerCase())
  })

  test('documentación: «Ver» abre en el navegador, el icono descarga y los caducados no salen', async ({ page }) => {
    const doc = await uploadDocument({ title: `Memoria de calidades ${RUN}` })
    await uploadDocument({ title: `Certificado caducado ${RUN}`, expiresAt: '2020-12-31' })
    const pub = await (await anon.get(`/api/public/properties/${full.slug}`)).json()
    const titles = pub.documents.map((d: any) => d.title)
    expect(titles).toContain(doc.title)
    expect(titles.some((t: string) => t.startsWith('Certificado caducado')), 'caducado').toBe(false)

    const view = await anon.get(`${doc.downloadUrl}?ver=1`)
    expect(view.status()).toBe(200)
    expect(view.headers()['content-disposition'] || '').toMatch(/^inline/)
    const download = await anon.get(doc.downloadUrl)
    expect(download.headers()['content-disposition'] || '').toMatch(/^attachment/)

    await page.goto(`/propiedades/${full.slug}`)
    const card = page.getByTestId('public-property-documents')
    await expect(card).toContainText('Documentación')
    const row = card.locator('li', { hasText: doc.title })
    await expect(row.getByTestId('document-view')).toHaveAttribute('href', /\?ver=1$/)
    await expect(row.getByTestId('document-download')).toHaveAttribute('download', '')
  })

  test('reserva desde la ficha: próxima visita real, privacidad obligatoria, «Visita reservada», cita con su propiedad y contacto', async ({ page }) => {
    // Sin la casilla de privacidad, el servidor no reserva.
    const avail = await (await anon.get(`/api/public/agents/${agent.slug}/availability`, { params: { days: '14' } })).json()
    const first = avail.days.flatMap((d: any) => d.slots)[0]
    expect(first, 'la agenda tiene huecos').toBeTruthy()
    expect(avail.timezone).toBeTruthy()
    const noPrivacy = await anon.post(`/api/public/agents/${agent.slug}/book`, { headers: { 'cf-connecting-ip': ip() }, data: { name: 'Sin casilla', email: `sin-${RUN}@example.com`, startAt: first.start, propertyId: full.id } })
    expect(noPrivacy.status()).toBe(422)

    await page.setExtraHTTPHeaders({ 'cf-connecting-ip': ip() })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${full.slug}`)
    // En escritorio, la de la columna derecha (la tarjeta de precio del móvil está oculta, #111).
    const next = page.getByTestId('ficha-aside').getByTestId('next-visit-slot')
    await expect(next).toBeVisible()
    await expect(page.getByTestId('ficha-aside').getByTestId('next-visit-when')).toContainText(first.start.slice(11, 16))
    await next.click()
    // Abre ya con esa hora elegida: directamente los datos.
    await expect(page.locator('#book-appt-name')).toBeVisible()
    const email = `reserva-${RUN}@example.com`
    await page.locator('#book-appt-name').fill(`Visitante Reserva ${RUN}`)
    await page.locator('#book-appt-email').fill(email)
    await page.locator('#book-appt-phone').fill('+34 611 222 444')
    await expect(page.getByTestId('book-submit')).toBeDisabled()
    await page.getByTestId('book-privacy').locator('input').check()
    await page.getByTestId('book-submit').click()
    await expect(page.getByTestId('book-success')).toHaveText('¡Visita reservada!')

    // La cita queda con su propiedad (obra nueva) y con el contacto del lead.
    const visits = (await (await a.get('/api/admin/saas/visits', { params: { agentId: String(agent.id) } })).json()).rows as any[]
    const visit = visits.find((v) => v.propertyId === full.id)
    expect(visit, 'cita creada').toBeTruthy()
    const { row } = await (await a.get('/api/admin/saas/visits', { params: { id: String(visit.id) } })).json()
    expect(row.propertyKind).toBe('developer')
    expect(row.contactId, 'con su Contact').toBeTruthy()
    expect(row.scheduledAt.slice(0, 16)).toBe(first.start.slice(0, 16))

    // La misma hora otra vez: ocupada (409), sin una segunda cita.
    const again = await anon.post(`/api/public/agents/${agent.slug}/book`, { headers: { 'cf-connecting-ip': ip() }, data: { name: 'Otra persona', email: `otra-${RUN}@example.com`, startAt: first.start, propertyId: full.id, privacyAccepted: true } })
    expect(again.status()).toBe(409)
    // Y la próxima visita disponible ya es otra.
    const after = await (await anon.get(`/api/public/agents/${agent.slug}/availability`, { params: { days: '14' } })).json()
    expect(after.days.flatMap((d: any) => d.slots)[0].start).not.toBe(first.start)
  })

  test('un comercial de baja no recibe reservas ni enseña agenda', async () => {
    const tm = await a.post('/api/admin/team', { data: { name: `Baja ${RUN}`, email: `baja-${RUN}@mm.test`, position: 'Asesor', employmentStatus: 'inactive', showOnWeb: 1 } })
    expect(tm.ok(), await tm.text()).toBeTruthy()
    const id = (await tm.json()).id
    cleanup.push(() => a.delete(`/api/admin/team/${id}`))
    const { row } = await (await a.get(`/api/admin/team/${id}`)).json()
    expect((await anon.get(`/api/public/agents/${row.slug}/availability`)).status()).toBe(404)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    expect((await anon.post(`/api/public/agents/${row.slug}/book`, { headers: { 'cf-connecting-ip': ip() }, data: { name: 'X', email: `x-${RUN}@example.com`, startAt: `${tomorrow} 10:00:00`, privacyAccepted: true } })).status()).toBe(404)
  })

  test('«Solicitar visita» fija: en escritorio al final de la columna derecha; en móvil, precio y botón bajo la cabecera, sin desbordes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/propiedades/${full.slug}`)
    await expect(page.locator('h1')).toBeVisible()
    const cta = page.getByTestId('ficha-desktop-cta')
    // Al bajar por la ficha, la llamada se queda a la vista en la columna derecha.
    await page.locator('#ubicacion').scrollIntoViewIfNeeded()
    await expect(cta).toBeInViewport()
    await expect(cta).toContainText(`Ampliación completa ${RUN}`)
    await page.getByTestId('ficha-request-visit').click()
    await expect(page.getByRole('heading', { name: 'Reservar cita' })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/propiedades/${full.slug}`)
    const mobile = page.getByTestId('ficha-mobile-price')
    await expect(mobile).toBeVisible()
    await expect(mobile).toContainText('250')
    await expect(page.getByTestId('ficha-mobile-request-visit')).toBeVisible()
    const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest('nav')).slice(0, 6).map((el) => `${el.tagName}.${String(el.className).slice(0, 60)} ${Math.round(el.getBoundingClientRect().right)}`))
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), wide.join(' | ')).toBeLessThanOrEqual(0)
  })

  test('calculadora: cuánto hace falta y la cuota, con supuestos a la vista y editables', async ({ page }) => {
    await page.goto(`/propiedades/${full.slug}`)
    const calc = page.getByTestId('mortgage-calculator')
    await calc.scrollIntoViewIfNeeded()
    await expect(calc).toBeVisible()
    const cash = await page.getByTestId('mortgage-cash-needed').innerText()
    await expect(page.getByTestId('mortgage-assumptions')).toContainText('Estimación orientativa')
    await page.getByTestId('mortgage-tax').fill('0')
    await page.getByTestId('mortgage-fees').fill('0')
    await expect(page.getByTestId('mortgage-cash-needed')).not.toHaveText(cash)
    await expect(page.getByTestId('mortgage-breakdown')).toContainText('Importe a financiar')
  })

  test('calculadora: con su fragmento de JS lento, lo que se escribe no se pierde al hidratarse', async ({ page }) => {
    // Se hidrata al verse: hasta que llega su fragmento, los campos van desactivados
    // (antes se podía escribir y la hidratación lo borraba; en CI fallaba así).
    await page.route('**/_nuxt/*.js', async (route) => {
      const res = await route.fetch()
      const body = await res.text()
      if (body.includes('mortgage-tax') && body.length < 20000) await new Promise((r) => setTimeout(r, 2500))
      await route.fulfill({ response: res, body })
    })
    await page.goto(`/propiedades/${full.slug}`)
    const calc = page.getByTestId('mortgage-calculator')
    await calc.scrollIntoViewIfNeeded()
    await expect(page.getByTestId('mortgage-tax')).toBeDisabled()
    const cash = await page.getByTestId('mortgage-cash-needed').innerText()
    await page.getByTestId('mortgage-tax').fill('0')
    await expect(page.getByTestId('mortgage-tax')).toHaveValue('0')
    await expect(page.getByTestId('mortgage-cash-needed')).not.toHaveText(cash)
    // Algún fragmento puede seguir retenido en la ruta al cerrar la página: que no cuente como fallo.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  })

  test('Constructor: ordenar y ocultar secciones en el inspector se ve en el lienzo y, al publicar, en la web', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/site-builder?pagina=ficha-propiedad')
    const canvas = page.frameLocator('iframe[title="Vista previa del Constructor Web"]')
    const preview = canvas.getByTestId('page-core-preview')
    await expect(preview).toBeVisible({ timeout: 15_000 })
    await preview.click()
    const inspector = page.getByTestId('page-core-inspector')
    await expect(inspector).toBeVisible()

    // «Ubicación» arriba del todo con sus flechas, y «Hipoteca y costes» oculta.
    const list = inspector.getByTestId('page-core-sections')
    for (let i = 0; i < 20; i++) {
      const up = list.locator('li[data-section="ubicacion"]').getByTestId('page-core-section-up')
      if (await up.isDisabled()) break
      await up.click()
    }
    await expect(list.locator('li').first()).toHaveAttribute('data-section', 'ubicacion')
    await list.locator('li[data-section="hipoteca"]').getByTestId('page-core-section-toggle').uncheck()

    // El lienzo lo enseña igual, antes de publicar.
    const sections = canvas.getByTestId('page-core-sections-preview')
    await expect(sections.locator('li').first()).toHaveAttribute('data-section', 'ubicacion')
    await expect(sections.locator('li[data-section="hipoteca"]')).toHaveCount(0)
    await expect.poll(async () => {
      const draft = await (await a.get('/api/admin/site-pages/ficha-propiedad')).json()
      const core = (draft.blocks as any[]).find((blk) => blk.type === 'page-core')
      return (core?.content?.sections || []).slice(0, 1).map((x: any) => x.key).join() + '|' + (core?.content?.sections || []).filter((x: any) => !x.visible).map((x: any) => x.key).join()
    }, { timeout: 10_000 }).toBe('ubicacion|hipoteca')

    // Sin publicar, la web sigue con el orden de partida.
    const web = await page.context().newPage()
    await web.goto(`/propiedades/${full.slug}`)
    await expect(web.locator('#hipoteca')).toHaveCount(1)

    await page.getByRole('button', { name: 'Publicar cambios' }).click()
    await expect(page.getByTestId('site-page-status-ficha-propiedad')).toHaveText('Publicada')

    await web.goto(`/propiedades/${full.slug}`)
    await expect(web.locator('h1')).toBeVisible()
    await expect(web.locator('#hipoteca')).toHaveCount(0)
    const firstSection = await web.getByTestId('ficha-main').evaluate((main) => {
      // Las secciones del Constructor: sin la galería, la barra de apartados ni la tarjeta principal (#111).
      const kids = [...main.children].filter((el) => el.tagName !== 'HEADER' && el.tagName !== 'NAV' && el.id !== 'fotos' && (el as HTMLElement).offsetHeight > 0)
      kids.sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)
      return kids[0]?.id || kids[0]?.querySelector('[id]')?.id || ''
    })
    expect(firstSection, 'Ubicación, la primera tras la cabecera').toBe('ubicacion')
    const nav = (await web.getByTestId('ficha-section-nav').locator('a[href^="#"]').allTextContents()).map((s) => s.trim())
    expect(nav.slice(0, 2)).toEqual(['Fotos', 'Ubicación'])
    expect(nav).not.toContain('Hipoteca')
    await web.close()

    // Volver a la original: todo como al principio.
    expect((await a.delete('/api/admin/site-pages/ficha-propiedad')).ok()).toBeTruthy()
    await page.goto(`/propiedades/${full.slug}`)
    await expect(page.locator('#hipoteca')).toHaveCount(1)
  })
})
