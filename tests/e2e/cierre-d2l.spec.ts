import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Cierre del núcleo, bloque D2L — leads, pipeline, deduplicación de
 * contactos y enrutado — sobre HTTP real y en el panel:
 *
 *  - la propiedad del lead se guarda con su catálogo (migración 0089): alta y
 *    edición con el buscador de los dos catálogos, la ficha enlaza la
 *    propiedad, ajena 404, en la papelera 422, sin catálogo 422;
 *  - cada movimiento del panel exige su motivo (fase, perder, reactivar y la
 *    acción masiva), con la ventana de motivos rápidos;
 *  - Contactos → Nuevo con WhatsApp e id externo, y «Unificar» con el
 *    contacto que ya existía (completa sin pisar, queda en su Actividad);
 *  - el idioma llega desde el formulario público y la API v1, normalizado, y
 *    la regla «Idioma» enruta el lead;
 *  - el editor de reglas de enrutado: desplegables y horario.
 *
 * Nada cruza de agencia (404). Sin rutas nuevas (presupuesto de Nitro
 * agotado). Los envíos públicos salen con su propia IP (TEST-NET-3,
 * 203.0.113.x) para no gastar el límite de tasa de otros specs, y la regla de
 * idioma usa el gallego, que ningún otro spec envía.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const PUBLIC_IP = { 'cf-connecting-ip': `203.0.113.${(Date.now() % 200) + 20}` }

test.describe('Cierre D2L — leads, pipeline, contactos y enrutado', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let developerId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    // Dentro de un describe con `storageState`, un contexto nuevo hereda la sesión: el anónimo la vacía a propósito.
    anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } })

    const dev = await a.post('/api/admin/developers', { data: { name: `Dev D2L ${RUN}`, email: `dev-d2l-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await Promise.all([a?.dispose(), b?.dispose(), anon?.dispose()])
  })

  async function developerProperty(name: string) {
    const res = await a.post('/api/admin/developer-properties', { data: { developerId, name, status: 'new', price: 410000, transactionType: 'sale', city: 'E2E-D2L' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    return id
  }
  async function agentProperty(ctx: APIRequestContext, tag: string) {
    const res = await ctx.post('/api/admin/properties', { data: { slug: `d2l-${tag}-${RUN}`, propertyType: 'Apartment', price: 250000 } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    cleanup.push(() => ctx.delete(`/api/admin/properties/${id}?hard=1`))
    return id
  }
  async function newLead(data: Record<string, unknown> = {}) {
    const res = await a.post('/api/admin/leads', { data: { name: `Lead D2L ${RUN}`, email: `lead-d2l-${Math.random().toString(36).slice(2)}-${RUN}@example.com`, source: 'call', force: true, ...data } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).id as number
  }
  const detail = async (id: number) => (await a.get(`/api/admin/leads/${id}`)).json()

  // ---------------------------------------------------------------------------
  // Catálogo de la propiedad del lead
  // ---------------------------------------------------------------------------

  test('la propiedad del lead se guarda con su catálogo y la ficha la enlaza; sin catálogo 422, ajena 404, en la papelera 422', async () => {
    const agentId = await agentProperty(a, 'piso')
    const devId = await developerProperty(`Promo catálogo D2L ${RUN}`)
    const foreignId = await agentProperty(b, 'ajena')

    const id = await newLead({ propertyId: agentId, propertyKind: 'agent' })
    const d1 = await detail(id)
    expect(d1.row).toMatchObject({ propertyId: agentId, propertyKind: 'agent' })
    expect(d1.property).toMatchObject({ id: agentId, kind: 'agent', inferred: false, adminPath: `/admin/properties/${agentId}` })

    // Edición: a la de obra nueva.
    expect((await a.put(`/api/admin/leads/${id}`, { data: { propertyId: devId, propertyKind: 'developer' } })).ok()).toBeTruthy()
    const d2 = await detail(id)
    expect(d2.row).toMatchObject({ propertyId: devId, propertyKind: 'developer', propertyName: `Promo catálogo D2L ${RUN}` })
    expect(d2.property.adminPath).toBe(`/admin/developer-properties/${devId}`)

    expect((await a.post('/api/admin/leads', { data: { name: 'Sin catálogo', email: `sin-cat-${RUN}@example.com`, source: 'call', propertyId: agentId } })).status()).toBe(422)
    expect((await a.post('/api/admin/leads', { data: { name: 'Ajena', email: `ajena-${RUN}@example.com`, source: 'call', propertyId: foreignId, propertyKind: 'agent' } })).status()).toBe(404)
    expect((await a.put(`/api/admin/leads/${id}`, { data: { propertyId: foreignId, propertyKind: 'agent' } })).status()).toBe(404)

    // A la papelera: no se puede elegir como propiedad nueva.
    expect((await a.delete(`/api/admin/properties/${agentId}`)).ok()).toBeTruthy()
    const trashed = await a.post('/api/admin/leads', { data: { name: 'Papelera', email: `papelera-${RUN}@example.com`, source: 'call', propertyId: agentId, propertyKind: 'agent' } })
    expect(trashed.status()).toBe(422)
    expect(await trashed.text()).toContain('papelera')

    // Otra agencia no ve el lead.
    expect((await b.get(`/api/admin/leads/${id}`)).status()).toBe(404)
  })

  // ---------------------------------------------------------------------------
  // Motivo en cada movimiento del panel
  // ---------------------------------------------------------------------------

  test('cada movimiento del panel exige su motivo: fase, perder, reactivar y acción masiva; otra agencia 404', async () => {
    const id = await newLead()
    const patch = (data: Record<string, unknown>, ctx = a) => ctx.patch(`/api/admin/saas/leads/${id}`, { data })

    expect((await patch({ stage: 'contacted' })).status()).toBe(422)
    expect((await patch({ stage: 'contacted', reason: '   ' })).status()).toBe(422)
    expect((await patch({ stage: 'contacted', reason: 'Primera llamada hecha' })).ok()).toBeTruthy()
    expect((await patch({ lost: true })).status()).toBe(422)
    expect((await patch({ lost: true, lostReason: 'no_response', note: 'Tres llamadas sin respuesta' })).ok()).toBeTruthy()
    expect((await patch({ lost: false })).status()).toBe(422)
    expect((await patch({ lost: false, note: 'Ha vuelto a escribir' })).ok()).toBeTruthy()
    expect((await patch({ stage: 'qualified', reason: 'Intruso' }, b)).status()).toBe(404)

    const history = (await detail(id)).stageHistory.map((h: any) => [h.toStage, h.reason])
    expect(history).toEqual([
      ['reactivated', 'Ha vuelto a escribir'],
      ['lost', 'No responde — Tres llamadas sin respuesta'],
      ['contacted', 'Primera llamada hecha'],
    ])

    // Acción masiva: sin motivo el job no llega a crearse.
    expect((await a.post('/api/admin/lead-bulk-jobs', { data: { action: 'change_stage', params: { stage: 'qualified' }, ids: [id] } })).status()).toBe(422)
    const created = await a.post('/api/admin/lead-bulk-jobs', { data: { action: 'change_stage', params: { stage: 'qualified', reason: 'Campaña D2L' }, ids: [id] } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const jobId = (await created.json()).id
    for (let i = 0; i < 10; i++) {
      const res = await (await a.put(`/api/admin/lead-bulk-jobs/${jobId}`, { data: {} })).json()
      if (res.done) break
    }
    const after = await detail(id)
    expect(after.row.stage).toBe('qualified')
    expect(after.stageHistory[0]).toMatchObject({ toStage: 'qualified', reason: 'Acción masiva: Campaña D2L' })
  })

  // ---------------------------------------------------------------------------
  // Contactos: WhatsApp, id externo y «Unificar»
  // ---------------------------------------------------------------------------

  test('alta de contacto: WhatsApp e id externo detectan el duplicado; «Unificar» completa sin pisar y queda en la Actividad; otra agencia 404', async () => {
    const wa = `+3466${String(Date.now()).slice(-7)}`
    const email = `marta-d2l-${RUN}@example.com`
    const created = await a.post('/api/admin/saas/contacts', { data: { name: `Marta D2L ${RUN}`, email, whatsapp: wa, externalSource: 'Idealista', externalId: `D2L-${RUN}` } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const contact = await created.json()
    expect(contact).toMatchObject({ whatsapp: wa, externalSource: 'Idealista', externalId: `D2L-${RUN}` })

    const byWhatsapp = await a.post('/api/admin/saas/contacts', { data: { name: 'Otra Marta', email: `otra-${RUN}@example.com`, whatsapp: wa } })
    expect(byWhatsapp.status()).toBe(409)
    expect((await byWhatsapp.json()).data.duplicates).toEqual(expect.arrayContaining([expect.objectContaining({ contactId: contact.id, matchedOn: 'WhatsApp' })]))
    // El mismo id externo del mismo sistema no admite «crear igualmente».
    expect((await a.post('/api/admin/saas/contacts', { data: { name: 'X', email: `x-${RUN}@example.com`, externalSource: 'Idealista', externalId: `D2L-${RUN}`, force: true } })).status()).toBe(409)
    // Sin sistema, el id externo no vale.
    expect((await a.post('/api/admin/saas/contacts', { data: { name: 'X', email: `y-${RUN}@example.com`, externalId: 'suelto' } })).status()).toBe(422)

    // Unificar: el email nuevo no pisa el suyo; el teléfono que le faltaba, sí se completa.
    const phone = `+3467${String(Date.now()).slice(-7)}`
    const unified = await a.post('/api/admin/saas/contacts', { data: { name: 'Marta', email: `marta-otra-${RUN}@example.com`, phone, country: 'Francia', mergeIntoContactId: contact.id } })
    expect(unified.ok(), await unified.text()).toBeTruthy()
    expect(await unified.json()).toMatchObject({ id: contact.id, merged: true, filled: expect.arrayContaining(['phone', 'country']), skipped: ['email'] })
    const card = await (await a.get(`/api/admin/saas/contacts/${contact.id}`)).json()
    expect(card.contact).toMatchObject({ email, phone, country: 'Francia', name: `Marta D2L ${RUN}` })
    const { rows } = await (await a.get('/api/admin/saas/activity', { params: { contactId: String(contact.id) } })).json()
    expect(rows.map((r: any) => r.eventType)).toContain('CONTACT_UNIFIED')

    // Otra agencia no puede unificar con un contacto de ésta.
    expect((await b.post('/api/admin/saas/contacts', { data: { name: 'Intruso', email: `intruso-${RUN}@example.com`, mergeIntoContactId: contact.id } })).status()).toBe(404)
    expect((await a.get(`/api/admin/saas/contacts/${contact.id}`)).ok()).toBeTruthy()
  })

  // ---------------------------------------------------------------------------
  // Idioma desde la captación y regla «Idioma»
  // ---------------------------------------------------------------------------

  test('el idioma llega del formulario público y de la API v1, normalizado, y la regla «Idioma» enruta el lead', async () => {
    const team = await a.post('/api/admin/team', { data: { name: `Galego D2L ${RUN}`, email: `galego-d2l-${RUN}@example.com`, position: 'Comercial', slug: `galego-d2l-${RUN}` } })
    expect(team.ok(), await team.text()).toBeTruthy()
    const commercialId = (await team.json()).id
    cleanup.push(() => a.delete(`/api/admin/team/${commercialId}`))
    // «Galego» se guarda como el código del catálogo; un idioma desconocido es un 422.
    expect((await a.post('/api/admin/lead-routing-rules', { data: { name: `Klingon ${RUN}`, scope: 'language', matchValue: 'klingon' } })).status()).toBe(422)
    const ruleRes = await a.post('/api/admin/lead-routing-rules', { data: { name: `Galego D2L ${RUN}`, priority: -100000, scope: 'language', matchValue: 'Galego', targetCommercialId: commercialId, enabled: 1 } })
    expect(ruleRes.ok(), await ruleRes.text()).toBeTruthy()
    const ruleId = (await ruleRes.json()).id
    try {
      expect((await (await a.get(`/api/admin/lead-routing-rules/${ruleId}`)).json()).row.matchValue).toBe('gl')

      // Formulario público (visitante sin sesión, con su idioma del navegador).
      const email = `xoan-d2l-${RUN}@example.com`
      const sent = await anon.post('/api/public/contact', { headers: PUBLIC_IP, data: { name: `Xoán D2L ${RUN}`, email, message: 'Ola, quero información', type: 'contact', language: 'gl-ES' } })
      expect(sent.ok(), await sent.text()).toBeTruthy()
      const found = (await (await a.get('/api/admin/saas/leads', { params: { search: email, view: 'table' } })).json()).rows.find((r: any) => r.email === email)
      expect(found, 'el formulario público debe crear el lead').toBeTruthy()
      const fromForm = await detail(found.id)
      expect(fromForm.row).toMatchObject({ language: 'gl', agentId: commercialId })

      // API v1.
      const key = await a.post('/api/admin/saas/apikeys', { data: { name: `D2L ${RUN}`, environment: 'test', scopes: 'write' } })
      const keyBody = await key.json()
      const apiKey = keyBody.key || keyBody.plainKey || keyBody.apiKey
      const v1 = await anon.post('/api/v1/leads', { headers: { Authorization: `Bearer ${apiKey}` }, data: { name: `API D2L ${RUN}`, email: `api-d2l-${RUN}@example.com`, language: 'Galician' } })
      expect(v1.ok(), await v1.text()).toBeTruthy()
      expect((await v1.json()).data).toMatchObject({ language: 'gl', agentId: commercialId })
      expect((await anon.post('/api/v1/leads', { headers: { Authorization: `Bearer ${apiKey}` }, data: { name: 'K', email: `k-d2l-${RUN}@example.com`, language: 'klingon' } })).status()).toBe(422)
    } finally {
      await a.delete(`/api/admin/lead-routing-rules/${ruleId}`).catch(() => null)
    }
  })

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------

  test('panel: alta de lead con el buscador de propiedad y de contacto; la ficha enlaza la propiedad; cambiar de fase pide el motivo', async ({ page }) => {
    const promo = `Promo Panel D2L ${RUN}`
    const devId = await developerProperty(promo)
    const contactName = `Contacto Panel D2L ${RUN}`
    const c = await a.post('/api/admin/saas/contacts', { data: { name: contactName, email: `contacto-panel-d2l-${RUN}@example.com`, force: true } })
    expect(c.ok(), await c.text()).toBeTruthy()

    await page.goto('/admin/leads')
    await page.getByTestId('lead-new').click()
    await page.getByTestId('lead-form-name').fill(`Panel D2L ${RUN}`)
    await page.getByTestId('lead-form-phone').fill(`+34 688 ${String(Date.now()).slice(-6)}`)
    await page.getByTestId('lead-form-source').selectOption('call')
    await page.getByTestId('lead-form-property-input').fill(promo)
    await page.getByTestId('lead-form-property').getByRole('button', { name: new RegExp(promo) }).click()
    await expect(page.getByTestId('lead-form-property')).toContainText('obra nueva')
    await page.getByTestId('lead-form-contact-input').fill(contactName)
    await page.getByTestId('lead-form-contact').getByRole('button', { name: new RegExp(contactName) }).click()
    await page.getByTestId('lead-form-save').click()

    await expect(page).toHaveURL(/\/admin\/leads\/\d+$/)
    await expect(page.getByTestId('lead-contact-link')).toHaveText(contactName)
    await expect(page.getByTestId('lead-property-link')).toHaveText(promo)
    await expect(page.getByTestId('lead-property-link')).toHaveAttribute('href', `/admin/developer-properties/${devId}`)
    await expect(page.getByTestId('lead-property-kind')).toContainText('obra nueva')

    // Cambiar de fase: la ventana del motivo; sin motivo no deja confirmar.
    await page.getByTestId('lead-stage-select').selectOption('contacted')
    await page.getByTestId('lead-stage-save').click()
    await expect(page.getByTestId('lead-stage-reason-modal')).toBeVisible()
    await expect(page.getByTestId('lead-stage-reason-confirm')).toBeDisabled()
    await page.getByTestId('lead-stage-reason-chip-0').click()
    await expect(page.getByTestId('lead-stage-reason-text')).toHaveValue('Primera llamada hecha')
    await page.getByTestId('lead-stage-reason-confirm').click()
    await expect(page.getByTestId('lead-stage')).toHaveText('Contactado')
    await page.getByTestId('lead-tab-historial').click()
    await expect(page.getByTestId('lead-stage-history-reason').first()).toHaveText('Primera llamada hecha')
  })

  test('panel: Contactos → Nuevo con WhatsApp e id externo; ante el duplicado, «Unificar» abre el existente ya completado', async ({ page }) => {
    const email = `unificar-panel-d2l-${RUN}@example.com`
    const existing = await a.post('/api/admin/saas/contacts', { data: { name: `Existente D2L ${RUN}`, email } })
    expect(existing.ok(), await existing.text()).toBeTruthy()
    const existingId = (await existing.json()).id

    await page.goto('/admin/contactos')
    await page.getByTestId('contact-new-toggle').click()
    await page.getByTestId('contact-new-name').fill(`Nueva D2L ${RUN}`)
    await page.getByTestId('contact-new-whatsapp').fill(`+3469${String(Date.now()).slice(-7)}`)
    await page.getByTestId('contact-new-external-source').fill('Fotocasa')
    await page.getByTestId('contact-new-external-id').fill(`F-${RUN}`)
    await page.getByTestId('contact-new-email').fill(email)
    await page.getByTestId('contact-new-email').blur()
    await expect(page.getByTestId('contact-new-duplicates')).toBeVisible()
    await page.getByTestId(`contact-duplicate-unify-${existingId}`).click()

    await expect(page).toHaveURL(new RegExp(`/admin/contactos/${existingId}`))
    await page.getByTestId('contact-tab-ficha').click()
    await expect(page.getByTestId('contact-external-id')).toHaveText(`F-${RUN} (Fotocasa)`)
    const card = await (await a.get(`/api/admin/saas/contacts/${existingId}`)).json()
    expect(card.contact).toMatchObject({ name: `Existente D2L ${RUN}`, email, externalSource: 'Fotocasa', externalId: `F-${RUN}` })
    expect(card.contact.whatsapp).toBeTruthy()
  })

  test('panel: una regla de enrutado se crea con desplegables y el editor de horario genera el JSON que lee el enrutado', async ({ page }) => {
    const office = await a.post('/api/admin/offices', { data: { name: `Oficina D2L ${RUN}` } })
    expect(office.ok(), await office.text()).toBeTruthy()
    const officeId = (await office.json()).id
    cleanup.push(() => a.delete(`/api/admin/offices/${officeId}?hard=1`))
    const team = await a.post('/api/admin/teams', { data: { name: `Guardia D2L ${RUN}` } })
    expect(team.ok(), await team.text()).toBeTruthy()
    const teamId = (await team.json()).id
    cleanup.push(() => a.delete(`/api/admin/teams/${teamId}?hard=1`))

    await page.goto('/admin/lead-routing-rules/new')
    await expect(page.getByTestId('routing-rule-editor')).toBeVisible()
    await page.getByTestId('routing-rule-name').fill(`Guardia fin de semana ${RUN}`)
    await page.getByTestId('routing-rule-priority').fill('9999')
    await page.getByTestId('routing-rule-scope').selectOption('team')
    await page.getByTestId('routing-rule-match-team').selectOption(String(teamId))
    await page.getByTestId('routing-rule-target-office').selectOption(String(officeId))
    await page.getByTestId('routing-rule-schedule-toggle').check()
    await page.getByTestId('routing-rule-preset-weekend').click()
    await expect(page.getByTestId('routing-rule-schedule-summary')).toContainText('Sábado, Domingo')
    // Que no reparta leads de otros specs mientras exista.
    await page.getByTestId('routing-rule-enabled').uncheck()
    await page.getByTestId('routing-rule-save').click()

    await expect(page).toHaveURL(/\/admin\/lead-routing-rules\/\d+$/)
    const ruleId = Number(page.url().split('/').pop())
    cleanup.push(() => a.delete(`/api/admin/lead-routing-rules/${ruleId}`))
    const { row } = await (await a.get(`/api/admin/lead-routing-rules/${ruleId}`)).json()
    expect(row).toMatchObject({ scope: 'team', matchValue: String(teamId), targetOfficeId: officeId, enabled: 0 })
    expect(JSON.parse(row.scheduleJson)).toEqual({ days: [6, 7], from: '00:00', to: '23:59', timezone: 'Europe/Madrid' })

    // El listado enseña el equipo por su nombre, no su id.
    await page.goto('/admin/lead-routing-rules')
    await expect(page.locator('tbody tr', { hasText: `Guardia fin de semana ${RUN}` }).locator('[data-field="matchValue"]')).toHaveText(`Guardia D2L ${RUN}`)
  })
})
