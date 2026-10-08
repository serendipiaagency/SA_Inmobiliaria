import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Núcleo inmobiliario, bloque N4 (FASES 10 y 11): editor completo de la
 * necesidad (crear y editar, importancia por criterio), el motor con el
 * estado del inmueble, «Compradores compatibles» en la ficha de propiedad y
 * las acciones sobre cada compatibilidad (enviar, crear selección, crear
 * visita, descartar) — y nada cruza de agencia.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
// Sólo las cifras: con un aleatorio de una cifra, `RUN.slice(-2, -1)` era el guion y la hora salía «1NaN:00:00».
const RUN_DIGITS = RUN.replace(/\D/g, '')
const DISTRICT = `N4-${RUN}`
const visible = (page: import('@playwright/test').Page, testId: string) => page.locator(`[data-testid="${testId}"]:visible`)

test.describe('N4 — necesidades del comprador y matching con acciones', () => {
  // Los tests comparten la necesidad y la propiedad creadas en los primeros.
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let propertyId: number
  let contactId: number
  let requirementId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })

    // Un piso de 2ª mano en un distrito propio de esta corrida: sólo él puede encajar en la zona pedida.
    const p = await a.post('/api/admin/properties', {
      data: { slug: `n4-piso-${RUN}`, propertyType: 'Apartment', transactionType: 'sale', price: 600000, area: 78, bedrooms: 3, bathrooms: 2, city: 'Madrid', district: DISTRICT, condition: 'good', hasTerrace: 1, hasElevator: 1, status: 'available' },
    })
    expect(p.ok(), await p.text()).toBeTruthy()
    propertyId = (await p.json()).id
    cleanup.push(() => a.delete(`/api/admin/properties/${propertyId}`))
    // Las características repasadas: un 0 pasa a significar «no lo tiene».
    expect((await a.post('/api/admin/saas/matching/features-reviewed', { data: { propertyId, propertyKind: 'agent' } })).ok()).toBeTruthy()

    const c = await a.post('/api/admin/saas/contacts', { data: { name: `María N4 ${RUN}`, email: `maria-n4-${RUN}@mm.test`, phone: `+3461${RUN.slice(-7)}`, force: true } })
    expect(c.ok(), await c.text()).toBeTruthy()
    contactId = (await c.json()).id
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
  })

  test('necesidad completa: crear, editar con importancia por criterio, validar y aislamiento', async () => {
    const created = await a.post('/api/admin/saas/buyer-requirements', {
      data: {
        contactId,
        title: `Vivienda N4 ${RUN}`,
        operation: 'sale',
        propertyTypes: ['Apartment', 'Penthouse', 'Duplex'],
        priceMax: 650000,
        areaMin: 80,
        areaMax: 140,
        bedroomsMin: 2,
        bathroomsMin: 1,
        desiredZones: [{ district: DISTRICT, label: DISTRICT }],
        excludedZones: [{ district: `Excluida-${RUN}`, label: `Excluida-${RUN}` }],
        conditionPref: 'good',
        buildPref: 'second_hand',
        desiredDate: '2027-03-01',
        needsMortgage: 1,
        mortgageStatus: 'preapproved',
        financingNotes: 'Preaprobada',
        urgency: 'high',
        importances: { zone: 'required', condition: 'required', terrace: 'required', elevator: 'preferred', garage: 'preferred' },
        features: { terrace: true, elevator: true, garage: true },
      },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    requirementId = (await created.json()).id

    // Editar: se reemplazan los criterios y se guarda la importancia «indiferente» del tipo.
    const patched = await a.patch(`/api/admin/saas/buyer-requirements/${requirementId}`, {
      data: { bathroomsMin: 2, importances: { zone: 'required', condition: 'required', propertyType: 'required', terrace: 'required', elevator: 'preferred', garage: 'preferred' }, features: { terrace: true, elevator: true, garage: true } },
    })
    expect(patched.ok(), await patched.text()).toBeTruthy()
    const list = await (await a.get('/api/admin/saas/buyer-requirements', { params: { contactId } })).json()
    const req = list.find((r: any) => r.id === requirementId)
    expect(req).toMatchObject({ bathroomsMin: 2, conditionPref: 'good', buildPref: 'second_hand', desiredDate: '2027-03-01', mortgageStatus: 'preapproved' })
    expect(req.summary).toContain('Piso/Ático/Dúplex')
    expect(req.criteria.map((c: any) => c.criterionType).sort()).toEqual(['condition', 'elevator', 'garage', 'propertyType', 'terrace', 'zone'])

    // Datos inválidos: 422 con el motivo.
    expect((await a.patch(`/api/admin/saas/buyer-requirements/${requirementId}`, { data: { areaMin: 200, areaMax: 100 } })).status()).toBe(422)
    expect((await a.patch(`/api/admin/saas/buyer-requirements/${requirementId}`, { data: { importances: { price: 'indifferent' } } })).status()).toBe(422)
    expect((await a.patch(`/api/admin/saas/buyer-requirements/${requirementId}`, { data: { desiredZones: [{ district: `Excluida-${RUN}` }] } })).status()).toBe(422)

    // Presupuesto validado: con autor y fecha.
    const validated = await a.post(`/api/admin/saas/buyer-requirements/${requirementId}/validate-budget`, { data: { validated: true } })
    expect((await validated.json()).budgetValidatedAt).toBeTruthy()

    // Otra agencia: ni la edita, ni crea una necesidad en este contacto.
    expect((await b.patch(`/api/admin/saas/buyer-requirements/${requirementId}`, { data: { title: 'Secuestrada' } })).status()).toBe(404)
    expect((await b.post('/api/admin/saas/buyer-requirements', { data: { contactId, title: 'Intrusa' } })).status()).toBe(404)
  })

  test('motor: el estado del inmueble entra en el desglose, en las dos direcciones', async () => {
    const forReq = await (await a.get(`/api/admin/saas/matching/requirement/${requirementId}`)).json()
    const m = forReq.results.find((r: any) => r.propertyKind === 'agent' && r.property.id === propertyId)
    expect(m, 'el piso debe encajar con la necesidad').toBeTruthy()
    const condition = m.result.criteria.find((c: any) => c.key === 'condition')
    expect(condition).toMatchObject({ outcome: 'matched', importance: 'required' })
    // 78 frente a 80 m²: «casi»; sin garaje con la ficha repasada: ✕.
    expect(m.result.explanation.some((l: string) => l.startsWith('△') && l.includes('78 m²'))).toBeTruthy()
    expect(m.result.explanation.some((l: string) => l.startsWith('✕') && l.includes('Garaje'))).toBeTruthy()

    const forProp = await (await a.get(`/api/admin/saas/matching/property/${propertyId}`, { params: { kind: 'agent' } })).json()
    const back = forProp.results.find((r: any) => r.requirement.id === requirementId)
    expect(back.result.score).toBe(m.result.score)
    expect(back.contact).toMatchObject({ id: contactId })

    // Otra agencia no ve los compradores de este inmueble.
    expect((await b.get(`/api/admin/saas/matching/property/${propertyId}`, { params: { kind: 'agent' } })).status()).toBe(404)
  })

  test('acciones: crear selección, crear visita, descartar y recuperar — y otra agencia recibe 404', async () => {
    const sel = await a.post('/api/admin/saas/matching/matches', {
      data: { action: 'selection', buyerRequirementId: requirementId, items: [{ propertyId, propertyKind: 'agent' }], title: `Selección N4 ${RUN}` },
    })
    expect(sel.ok(), await sel.text()).toBeTruthy()
    const selBody = await sel.json()
    expect(selBody).toMatchObject({ created: true, added: 1 })
    const ficha = await (await a.get(`/api/admin/saas/contacts/${contactId}`)).json()
    expect(ficha.selections.map((s: any) => s.title)).toContain(`Selección N4 ${RUN}`)

    const agents = (await (await a.get('/api/admin/saas/agents')).json()).rows
    if (agents.length) {
      const visit = await a.post('/api/admin/saas/matching/matches', {
        data: { action: 'visit', buyerRequirementId: requirementId, propertyId, propertyKind: 'agent', agentId: agents[0].id, scheduledAt: `2031-0${1 + (Number(RUN_DIGITS.slice(-1)) % 8)}-15 1${Number(RUN_DIGITS.slice(-2, -1)) % 8}:00:00` },
      })
      expect([200, 409], await visit.text()).toContain(visit.status())
      if (visit.ok()) {
        const body = await visit.json()
        expect(body.visit).toMatchObject({ contactId, propertyId, propertyKind: 'agent', type: 'property_viewing' })
        cleanup.push(() => a.patch(`/api/admin/saas/visits/${body.visit.id}`, { data: { status: 'cancelled' } }))
      }
    }

    const discarded = await a.post('/api/admin/saas/matching/matches', { data: { buyerRequirementId: requirementId, propertyId, propertyKind: 'agent', status: 'discarded', discardedReason: 'Prueba N4' } })
    expect(await discarded.json()).toMatchObject({ status: 'discarded', discardedReason: 'Prueba N4' })
    const back = await a.post('/api/admin/saas/matching/matches', { data: { buyerRequirementId: requirementId, propertyId, propertyKind: 'agent', status: 'new' } })
    expect((await back.json()).status).toBe('new')

    // Otra agencia, con los ids de A: 404 en todas las acciones.
    expect((await b.post('/api/admin/saas/matching/matches', { data: { action: 'selection', buyerRequirementId: requirementId, items: [{ propertyId, propertyKind: 'agent' }] } })).status()).toBe(404)
    expect((await b.post('/api/admin/saas/matching/matches', { data: { action: 'visit', buyerRequirementId: requirementId, propertyId, propertyKind: 'agent', agentId: agents[0]?.id || 1, scheduledAt: '2031-02-02 10:00:00' } })).status()).toBe(404)
    expect((await b.post('/api/admin/saas/matching/matches', { data: { buyerRequirementId: requirementId, propertyId, propertyKind: 'agent', status: 'discarded' } })).status()).toBe(404)
    expect((await b.post('/api/admin/saas/matching/matches', { data: { action: 'inventada', buyerRequirementId: requirementId } })).status()).toBe(422)
  })

  test('panel: «Nueva necesidad» con el editor completo y «Editar» después', async ({ page }) => {
    await page.goto(`/admin/contactos/${contactId}?tab=necesidades`)
    await page.getByTestId('requirement-new').click()
    const editor = page.locator('[data-testid="requirement-editor"][data-mode="new"]')
    await editor.getByTestId('req-title').fill(`Inversión N4 ${RUN}`)
    await editor.getByTestId('req-operation').selectOption('sale')
    await editor.locator('label', { has: page.getByTestId('req-type-Retail') }).click()
    await editor.getByTestId('req-price-max').fill('400000')
    await editor.getByTestId('req-bathrooms').fill('1')
    await editor.getByTestId('req-exzone-value').fill(`Excluida-${RUN}`)
    await editor.getByTestId('req-exzone-add').click()
    await editor.getByTestId('req-condition').selectOption('to_reform')
    await editor.getByTestId('req-build').selectOption('renovated')
    await editor.locator('[data-testid="req-feature-airConditioning"]').getByTestId('req-imp-airConditioning').selectOption('required')
    await editor.getByTestId('req-desired-date').fill('2027-06-30')
    await editor.getByTestId('req-needs-mortgage').selectOption('0')
    await editor.getByTestId('req-save').click()

    const card = page.locator('[data-testid^="requirement-card-"]').filter({ hasText: `Inversión N4 ${RUN}` })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Local')
    await expect(card).toContainText(`sin Excluida-${RUN}`)
    await expect(card).toContainText('Aire acondicionado imprescindible')
    await expect(card).toContainText('Para reformar')

    // Editar la misma necesidad. En modo edición la tarjeta enseña el
    // formulario (el título pasa a ser el valor de un campo), así que se
    // localiza por su id y no por el texto.
    const cardTestId = (await card.getAttribute('data-testid'))!
    await card.locator('[data-testid^="requirement-edit-"]').click()
    const sameCard = page.getByTestId(cardTestId)
    const edit = sameCard.locator('[data-testid="requirement-editor"][data-mode="edit"]')
    await expect(edit.getByTestId('req-title')).toHaveValue(`Inversión N4 ${RUN}`)
    await edit.getByTestId('req-price-max').fill('450000')
    await edit.getByTestId('req-save').click()
    await expect(sameCard).toContainText('450.000')
  })

  test('ficha de propiedad: paso «Compradores compatibles» con el desglose y descartar con motivo', async ({ page }) => {
    await page.goto(`/admin/properties/${propertyId}`)
    await visible(page, 'property-editor-step-buyer-matches').click()
    const row = page.getByTestId(`property-buyer-${requirementId}`)
    await expect(row).toBeVisible()
    await expect(row).toContainText(`María N4 ${RUN}`)
    await expect(row).toContainText('Estado')
    await expect(row.getByTestId('match-send-property')).toBeEnabled()

    await row.getByTestId('match-discard').click()
    await page.getByTestId('match-discard-reason').fill('Cliente prefiere exterior')
    await page.getByTestId('match-discard-confirm').click()
    await expect(row.getByTestId('match-status')).toHaveText('Descartado')
    await row.getByTestId('match-undiscard').click()
    await expect(row.getByTestId('match-status')).toHaveText('Nuevo')
  })
})
