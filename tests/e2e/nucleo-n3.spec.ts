import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Núcleo inmobiliario, bloque N3 (FASES 12-16): alta manual de leads con
 * deduplicación (unificar / crear igualmente), ficha del lead con todos sus
 * campos, cambio de fase con motivo, perdido con motivo del catálogo e
 * historial, reglas de enrutado por equipo/horario — y nada cruza de agencia.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('N3 — leads: alta, ficha, historial y enrutado', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
  })

  test('alta manual: duplicado → 409, crear igualmente, unificar; edición; sin borrado; otra agencia no lo ve', async () => {
    const email = `n3-${RUN}@example.com`
    const created = await a.post('/api/admin/leads', { data: { name: `Lead N3 ${RUN}`, email, source: 'walk_in', language: 'en', priority: 'high', originalMessage: 'Quiero ver áticos' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const id = (await created.json()).id

    // Mismo email: 409 con el candidato.
    const dup = await a.post('/api/admin/leads', { data: { name: 'Otro', email: email.toUpperCase(), source: 'call' } })
    expect(dup.status()).toBe(409)
    const dupBody = await dup.json()
    expect(dupBody.data.duplicates.map((d: any) => d.leadId)).toContain(id)

    // Unificar: completa el existente, no crea otro.
    const merged = await a.post('/api/admin/leads', { data: { name: 'Otro', email, phone: '+34 699 000 111', source: 'call', mergeIntoLeadId: id } })
    expect(await merged.json()).toMatchObject({ id, merged: true })

    // Crear igualmente.
    const forced = await a.post('/api/admin/leads', { data: { name: 'Segunda oportunidad', email, source: 'call', force: true } })
    expect(forced.ok()).toBeTruthy()
    expect((await forced.json()).id).not.toBe(id)

    // Edición: el mensaje original no se reescribe.
    expect((await a.put(`/api/admin/leads/${id}`, { data: { sourceDetail: 'Feria de otoño', originalMessage: 'otro' } })).ok()).toBeTruthy()
    const detail = await (await a.get(`/api/admin/leads/${id}`)).json()
    expect(detail.row).toMatchObject({ sourceDetail: 'Feria de otoño', originalMessage: 'Quiero ver áticos', phone: '+34 699 000 111', language: 'en', priority: 'high' })
    expect(detail.createdByName).toBeTruthy()

    // Un lead no se borra: se marca como perdido.
    expect((await a.delete(`/api/admin/leads/${id}`)).status()).toBe(405)

    // Otra agencia: ni lo lee, ni lo edita, ni lo usa para unificar.
    expect((await b.get(`/api/admin/leads/${id}`)).status()).toBe(404)
    expect((await b.put(`/api/admin/leads/${id}`, { data: { notes: 'intruso' } })).status()).toBe(404)
    expect((await b.post('/api/admin/leads', { data: { name: 'X', email: `b-${RUN}@example.com`, source: 'web', mergeIntoLeadId: id } })).status()).toBe(404)
  })

  test('reglas de enrutado: equipo ajeno 404, horario mal formado 422, regla de equipo con horario válida', async () => {
    const teamB = await b.post('/api/admin/teams', { data: { name: `Equipo B N3 ${RUN}` } })
    const teamBId = (await teamB.json()).id
    cleanup.push(() => b.delete(`/api/admin/teams/${teamBId}?hard=1`))
    const teamA = await a.post('/api/admin/teams', { data: { name: `Guardia N3 ${RUN}` } })
    const teamAId = (await teamA.json()).id
    cleanup.push(() => a.delete(`/api/admin/teams/${teamAId}?hard=1`))

    expect((await a.post('/api/admin/lead-routing-rules', { data: { name: `Ajena ${RUN}`, scope: 'team', matchValue: String(teamBId) } })).status()).toBe(404)
    expect((await a.post('/api/admin/lead-routing-rules', { data: { name: `Horario ${RUN}`, scope: 'zone', matchValue: 'Centro', scheduleJson: { from: '9h' } } })).status()).toBe(422)
    const ok = await a.post('/api/admin/lead-routing-rules', {
      data: { name: `Guardia ${RUN}`, priority: 999, scope: 'team', matchValue: String(teamAId), enabled: 0, scheduleJson: { days: [6, 7], from: '00:00', to: '23:59', timezone: 'Europe/Madrid' } },
    })
    expect(ok.ok(), await ok.text()).toBeTruthy()
    const ruleId = (await ok.json()).id
    cleanup.push(() => a.delete(`/api/admin/lead-routing-rules/${ruleId}`))
  })

  test('una llamada anotada como contestada fija el primer contacto del lead; propiedad o comercial de otra agencia → 404', async () => {
    const created = await a.post('/api/admin/leads', { data: { name: `Llamada N3 ${RUN}`, phone: `+34 655 ${String(Date.now()).slice(-6)}`, source: 'call' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const leadId = (await created.json()).id
    const cc = await a.post('/api/admin/comms/contacts', { data: { leadId } })
    expect(cc.ok(), await cc.text()).toBeTruthy()
    const contactId = (await cc.json()).contact.id

    const foreignProp = await b.post('/api/admin/properties', { data: { slug: `n3-ajena-${RUN}`, propertyType: 'Apartment', price: 1 } })
    const foreignPropId = (await foreignProp.json()).id
    cleanup.push(() => b.delete(`/api/admin/properties/${foreignPropId}?hard=1`))
    const bTeam = await (await b.get('/api/admin/team')).json()
    const foreignAgentId = bTeam.rows?.[0]?.id

    expect((await a.post('/api/admin/comms/calls/log', { data: { contactId, direction: 'outbound', outcome: 'answered', propertyId: foreignPropId, propertyKind: 'agent' } })).status()).toBe(404)
    if (foreignAgentId) expect((await a.post('/api/admin/comms/calls/log', { data: { contactId, direction: 'outbound', outcome: 'answered', agentId: foreignAgentId } })).status()).toBe(404)

    const logged = await a.post('/api/admin/comms/calls/log', { data: { contactId, direction: 'outbound', outcome: 'answered', durationSeconds: 90 } })
    expect(logged.ok(), await logged.text()).toBeTruthy()
    const detail = await (await a.get(`/api/admin/leads/${leadId}`)).json()
    expect(detail.row.firstContactAt).toBeTruthy()
    expect(detail.row.firstResponseAt).toBeTruthy()
  })

  test('panel: «Nuevo lead» abre su ficha; cambiar fase con motivo y perderlo con motivo quedan en el historial', async ({ page }) => {
    await page.goto('/admin/leads')
    await page.getByTestId('lead-new').click()
    await page.getByTestId('lead-form-name').fill(`Panel N3 ${RUN}`)
    await page.getByTestId('lead-form-phone').fill(`+34 677 ${String(Date.now()).slice(-6)}`)
    await page.getByTestId('lead-form-source').selectOption('call')
    await page.getByTestId('lead-form-priority').selectOption('urgent')
    await page.getByTestId('lead-form-save').click()

    await expect(page).toHaveURL(/\/admin\/leads\/\d+$/)
    await expect(page.getByTestId('lead-name')).toHaveText(`Panel N3 ${RUN}`)
    await expect(page.getByTestId('lead-priority')).toContainText('Urgente')

    // Fase con motivo.
    await page.getByTestId('lead-stage-select').selectOption('contacted')
    await page.getByTestId('lead-stage-reason').fill('Primera llamada hecha')
    await page.getByTestId('lead-stage-save').click()
    await expect(page.getByTestId('lead-stage')).toHaveText('Contactado')
    await expect(page.getByTestId('lead-milestone-first-contact')).not.toContainText('—')

    // Perdido con motivo del catálogo y comentario.
    await page.getByTestId('lead-mark-lost').click()
    await page.getByTestId('lead-lost-reason-not_interested').check()
    await page.getByTestId('lead-lost-note').fill('Ha comprado con otra agencia')
    await page.getByTestId('lead-lost-confirm').click()
    await expect(page.getByTestId('lead-stage')).toContainText('Perdido · No interesado')

    await page.getByTestId('lead-tab-historial').click()
    const rows = page.getByTestId('lead-stage-history-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.first().getByTestId('lead-stage-history-to')).toHaveText('Perdido')
    await expect(rows.first().getByTestId('lead-stage-history-reason')).toHaveText('No interesado — Ha comprado con otra agencia')
    await expect(rows.nth(1).getByTestId('lead-stage-history-reason')).toHaveText('Primera llamada hecha')

    // Reactivar vuelve a la fase en la que estaba.
    await page.getByTestId('lead-reactivate').click()
    await expect(page.getByTestId('lead-stage')).toHaveText('Contactado')
  })

  test('el duplicado se ve en el formulario y se puede unificar desde ahí', async ({ page }) => {
    const email = `n3-ui-${RUN}@example.com`
    const created = await a.post('/api/admin/leads', { data: { name: `Existente ${RUN}`, email, source: 'web' } })
    const id = (await created.json()).id

    await page.goto('/admin/leads')
    await page.getByTestId('lead-new').click()
    await page.getByTestId('lead-form-name').fill(`Repetido ${RUN}`)
    await page.getByTestId('lead-form-email').fill(email)
    await page.getByTestId('lead-form-save').click()
    await expect(page.getByTestId('lead-form-duplicates')).toBeVisible()
    await expect(page.getByTestId(`lead-duplicate-${id}`)).toContainText(`Existente ${RUN}`)
    await page.getByTestId(`lead-duplicate-merge-${id}`).click()
    await expect(page).toHaveURL(new RegExp(`/admin/leads/${id}$`))
  })
})
