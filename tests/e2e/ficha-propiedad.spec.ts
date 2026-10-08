import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Ficha pública de una propiedad (#107): Datos clave con iconos y colores,
 * sin etiquetas «IA», «Propiedades destacadas» bajo las similares y el
 * formulario «Atendido por» como entrada real al CRM.
 *
 * El formulario público tiene un límite de 5 envíos cada 10 minutos por IP:
 * cada envío de este fichero sale de una IP de documentación distinta.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const COMMUNITY = `E2E Ficha ${RUN}`
let ipSeq = 0
const ip = () => ({ 'cf-connecting-ip': `198.51.100.${((Date.now() + ipSeq++ * 7) % 250) + 3}` })

test.describe('Ficha pública: Datos clave, destacadas y «Atendido por» → CRM', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let visitor: APIRequestContext
  let agent: { id: number; name: string }
  const props: Record<string, { id: number; slug: string }> = {}
  let foreignSlug = ''
  const cleanup: Array<() => Promise<unknown>> = []

  async function createProperty(ctx: APIRequestContext, developerId: number, name: string, extra: Record<string, any>) {
    const res = await ctx.post('/api/admin/developer-properties', { data: { developerId, name, status: 'new', price: 300000, bedrooms: 3, area: 100, community: COMMUNITY, ...extra } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    const { row } = await (await ctx.get(`/api/admin/developer-properties/${id}`)).json()
    cleanup.push(() => ctx.delete(`/api/admin/developer-properties/${id}?hard=1`))
    return { id, slug: row.slug as string }
  }

  async function sendForm(data: Record<string, any>) {
    return visitor.post('/api/public/contact', { headers: ip(), data: { type: 'contact', form: 'property', privacyAccepted: true, ...data } })
  }

  async function leadsFor(email: string) {
    const res = await (await a.get('/api/admin/leads', { params: { q: email, perPage: '50' } })).json()
    return (res.rows || []) as any[]
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    visitor = await pwRequest.newContext({ baseURL: BASE_URL })

    const dev = await a.post('/api/admin/developers', { data: { name: `Ficha promotora ${RUN}`, email: `ficha-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    const developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))

    const agentName = `Lucía Ficha ${RUN}`
    const tm = await a.post('/api/admin/team', { data: { name: agentName, email: `lucia-${RUN}@mm.test`, position: 'Asesora de obra nueva', whatsapp: '+34 600 111 222', employmentStatus: 'active', showOnWeb: 1 } })
    expect(tm.ok(), await tm.text()).toBeTruthy()
    agent = { id: (await tm.json()).id, name: agentName }
    cleanup.push(() => a.delete(`/api/admin/team/${agent.id}`))

    // A: la que se visita. B, C, D: casi iguales (similares). C, E, F: exclusivas (destacadas).
    props.A = await createProperty(a, developerId, `Ficha A ${RUN}`, { agentId: agent.id, propertyType: 'Apartment', yearBuilt: 2020, hasElevator: 1, hasGarage: 1, hasTerrace: 1, hasPool: 1, hasGarden: 1 })
    props.B = await createProperty(a, developerId, `Ficha B ${RUN}`, {})
    props.C = await createProperty(a, developerId, `Ficha C ${RUN}`, { isExclusive: 1 })
    props.D = await createProperty(a, developerId, `Ficha D ${RUN}`, {})
    props.E = await createProperty(a, developerId, `Ficha E ${RUN}`, { isExclusive: 1, community: `Otra ${RUN}`, price: 900000, bedrooms: 6, area: 400 })
    props.F = await createProperty(a, developerId, `Ficha F ${RUN}`, { isExclusive: 1, community: `Otra ${RUN}`, price: 950000, bedrooms: 6, area: 420 })

    // Una propiedad de OTRA agencia, para intentar colarle un lead.
    const devB = await b.post('/api/admin/developers', { data: { name: `Ficha B-org ${RUN}`, email: `ficha-b-${RUN}@mm.test`, status: 'active' } })
    expect(devB.ok(), await devB.text()).toBeTruthy()
    const devBId = (await devB.json()).id
    cleanup.push(() => b.delete(`/api/admin/developers/${devBId}`))
    foreignSlug = (await createProperty(b, devBId, `Ajena ${RUN}`, {})).slug
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose(), visitor?.dispose()])
  })

  test('destacadas: las exclusivas, sin la actual ni las similares; la ficha trae su comercial con columnas públicas', async () => {
    const res = await (await visitor.get(`/api/public/properties/${props.A.slug}/similar`)).json()
    const similar = res.results.map((r: any) => r.id)
    const featured = res.featured.map((r: any) => r.id)
    expect(similar.sort()).toEqual([props.B.id, props.C.id, props.D.id].sort())
    expect(featured).toContain(props.E.id)
    expect(featured).toContain(props.F.id)
    expect(featured, 'nunca la que se está viendo').not.toContain(props.A.id)
    expect(featured, 'C es exclusiva pero ya sale en similares').not.toContain(props.C.id)

    const ficha = await (await visitor.get(`/api/public/properties/${props.A.slug}`)).json()
    // El alta de Comerciales guarda el WhatsApp (el teléfono sólo llega por otras vías): la ficha llama a ese número.
    expect(ficha.agent).toMatchObject({ id: agent.id, name: agent.name, whatsapp: '+34 600 111 222' })
    for (const secret of ['icalToken', 'nid', 'employeeCode', 'organizationId', 'workingHours']) expect(ficha.agent, secret).not.toHaveProperty(secret)
  })

  test('formulario → Contact + lead de ESA propiedad + comercial + actividad + hilo; doble envío, misma persona y otra propiedad', async () => {
    const email = `ficha-${RUN}@example.com`
    const message = `Me interesa la Ficha A ${RUN}. ¿Tiene plaza de garaje incluida?`
    const submissionId = `sub-${RUN}`.replace(/[^A-Za-z0-9_-]/g, '')

    const rules = ((await (await a.get('/api/admin/lead-routing-rules', { params: { perPage: '100' } })).json()).rows || []) as any[]
    const activeRules = rules.filter((r) => r.enabled === 1 || r.enabled === true)

    const sent = await sendForm({ name: `Visitante Ficha ${RUN}`, email, phone: '+34 611 222 333', message, propertySlug: props.A.slug, submissionId, agentId: 999999, organizationId: 999999 })
    expect(sent.ok(), await sent.text()).toBeTruthy()

    // El mismo envío otra vez (doble clic, reintento): no crea nada.
    const again = await sendForm({ name: `Visitante Ficha ${RUN}`, email, phone: '+34 611 222 333', message, propertySlug: props.A.slug, submissionId })
    expect(await again.json()).toMatchObject({ ok: true, duplicate: true })

    let leads = await leadsFor(email)
    expect(leads, 'un solo lead').toHaveLength(1)
    const detail = await (await a.get(`/api/admin/leads/${leads[0].id}`)).json()
    const lead = detail.row
    expect(lead).toMatchObject({ source: 'web', sourceDetail: 'Ficha de propiedad', propertyId: props.A.id, propertyKind: 'developer', originalMessage: message })
    expect(lead.contactId, 'con su Contact').toBeTruthy()
    expect(lead.createdAt, 'el SLA arranca en la creación').toBeTruthy()
    expect(detail.property?.id ?? lead.propertyId).toBe(props.A.id)
    // Ni el comercial ni la empresa los decide el navegador.
    expect(lead.agentId, 'routing: comercial asignado').toBeTruthy()
    expect(lead.agentId).not.toBe(999999)
    if (!activeRules.length) {
      expect(lead.agentId, 'sin reglas: el comercial responsable de la propiedad').toBe(agent.id)
      expect(JSON.stringify(detail.assignmentHistory)).toContain('formulario de su ficha')
    }

    // Actividad «lead recibido» también en la propiedad.
    const propActivity = await (await a.get('/api/admin/saas/activity', { params: { propertyId: String(props.A.id), propertyKind: 'developer' } })).json()
    expect(propActivity.rows.some((r: any) => r.leadId === lead.id), 'la propiedad ve el lead en su actividad').toBeTruthy()

    // Hilo «Ficha de propiedad» en Comunicaciones, con la constancia del consentimiento.
    const list = await (await a.get('/api/admin/comms/conversations', { params: { source: 'web_form', status: 'all', q: email } })).json()
    expect(list.rows).toHaveLength(1)
    expect(list.rows[0].formType).toBe('property')
    const thread = await (await a.get(`/api/admin/comms/conversations/${list.rows[0].id}`)).json()
    expect(JSON.stringify(thread)).toContain('privacyAcceptedAt')

    // La misma persona vuelve a preguntar por la MISMA propiedad: mismo lead.
    expect((await sendForm({ name: `Visitante Ficha ${RUN}`, email, message: 'Otra pregunta', propertySlug: props.A.slug })).ok()).toBeTruthy()
    expect(await leadsFor(email)).toHaveLength(1)

    // …y por OTRA propiedad: otro lead, el mismo Contact.
    expect((await sendForm({ name: `Visitante Ficha ${RUN}`, email, message: 'Y la B?', propertySlug: props.B.slug })).ok()).toBeTruthy()
    leads = await leadsFor(email)
    expect(leads).toHaveLength(2)
    const both = await Promise.all(leads.map(async (l) => (await (await a.get(`/api/admin/leads/${l.id}`)).json()).row))
    expect(new Set(both.map((l) => l.contactId)).size, 'Contact ≠ lead: una persona, dos intereses').toBe(1)
    expect(both.map((l) => l.propertyId).sort()).toEqual([props.A.id, props.B.id].sort())
    // No se inventa una necesidad de compra.
    const reqs = await (await a.get('/api/admin/saas/buyer-requirements', { params: { contactId: String(both[0].contactId) } })).json()
    expect(reqs).toHaveLength(0)
  })

  test('validación en el servidor: privacidad, teléfono, propiedad de otra agencia y campo trampa', async () => {
    const base = { name: 'Validación', message: 'Hola', propertySlug: props.A.slug }
    expect((await sendForm({ ...base, email: `nopriv-${RUN}@example.com`, privacyAccepted: false })).status()).toBe(422)
    expect((await sendForm({ ...base, email: `badphone-${RUN}@example.com`, phone: 'llámame ya' })).status()).toBe(422)

    const foreignEmail = `ajena-${RUN}@example.com`
    const foreign = await sendForm({ ...base, email: foreignEmail, propertySlug: foreignSlug })
    expect(foreign.status(), 'la propiedad de otra agencia no existe para esta web').toBe(422)
    expect(await leadsFor(foreignEmail)).toHaveLength(0)
    const inB = await (await b.get('/api/admin/leads', { params: { q: foreignEmail } })).json()
    expect(inB.rows || []).toHaveLength(0)

    const trapEmail = `bot-${RUN}@example.com`
    const trap = await sendForm({ ...base, email: trapEmail, website: 'http://spam.example' })
    expect(trap.ok()).toBeTruthy()
    expect(await leadsFor(trapEmail), 'el bot no deja nada').toHaveLength(0)
  })

  test('la web: Datos clave con iconos de colores, sin «IA», «Atendido por» con el comercial real y envío desde el formulario', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: ip() })
    const page = await ctx.newPage()
    await page.goto(`/propiedades/${props.A.slug}`)

    const tiles = page.getByTestId('quick-facts').locator('[data-fact]')
    await expect(tiles.first()).toBeVisible()
    const facts = await tiles.evaluateAll((els) => els.map((e) => ({ key: e.getAttribute('data-fact'), svg: !!e.querySelector('svg path, svg circle, svg rect'), color: getComputedStyle(e.querySelector('.qf-icon') as Element).color })))
    for (const k of ['elevator', 'garage', 'terrace', 'pool', 'garden']) expect(facts.map((f) => f.key)).toContain(k)
    // El año y el tipo van en la fila de cifras bajo el título (#111), no se repiten en las características.
    expect(facts.map((f) => f.key)).not.toContain('yearBuilt')
    await expect(page.getByTestId('ficha-key-facts').locator('[data-fact="yearBuilt"]')).toBeVisible()
    expect(facts.every((f) => f.svg), 'ningún icono vacío').toBeTruthy()
    expect(new Set(facts.map((f) => f.color)).size, 'no todos del mismo color').toBeGreaterThanOrEqual(4)

    await expect(page.locator('main').getByText('IA', { exact: true })).toHaveCount(0)

    const card = page.getByTestId('property-contact-card')
    await expect(card.getByTestId('property-contact-name')).toHaveText(agent.name)
    await expect(card).not.toContainText('Formulario de demostración')
    await expect(card).not.toContainText('Asunto')
    await expect(card.getByTestId('property-contact-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/34600111222\?/)
    await expect(card.getByTestId('property-contact-call')).toHaveAttribute('href', 'tel:+34600111222')

    // Sin aceptar la privacidad no se envía.
    const email = `ui-${RUN}@example.com`
    await card.getByLabel('Nombre').fill(`Visitante UI ${RUN}`)
    await card.getByLabel('Email').fill(email)
    await card.getByLabel('Teléfono').fill('+34 622 333 444')
    await card.getByLabel('Mensaje').fill('Quiero visitarla este sábado')
    await card.getByTestId('property-contact-submit').click()
    await expect(card).toContainText('Tienes que aceptar la política de privacidad')
    await card.getByTestId('property-contact-privacy').check()
    await card.getByTestId('property-contact-submit').dblclick()
    await expect(card.getByTestId('property-contact-success')).toBeVisible({ timeout: 15_000 })
    await expect.poll(async () => (await leadsFor(email)).length).toBe(1)

    // Debajo de las similares, las destacadas (se cargan al llegar a ellas).
    await page.locator('#similares').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('similar-properties')).toBeVisible({ timeout: 15_000 })
    const featured = page.getByTestId('featured-properties')
    await expect(featured).toBeVisible()
    await expect(featured).toContainText(`Ficha E ${RUN}`)
    await expect(featured).not.toContainText(`Ficha A ${RUN}`)
    const similarBox = await page.getByTestId('similar-properties').boundingBox()
    const featuredBox = await featured.boundingBox()
    expect(featuredBox!.y, 'destacadas debajo de similares').toBeGreaterThan(similarBox!.y)
    await ctx.close()
  })
})
