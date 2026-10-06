import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Cierre D3a del núcleo inmobiliario — campos transversales de FASE 0, sobre
 * HTTP real y en el panel:
 *
 *  - Notas del equipo en la ficha de la propiedad (los dos catálogos), de la
 *    cita y de la operación (recurso `notes`: ajeno → 404).
 *  - «Creado por X el Y» en la cabecera del contacto, la ficha de la cita, la
 *    de la operación y cada tarea.
 *  - Papelera de citas: PATCH `{ deleted: true | false }` y GET `?trashed=1`;
 *    lo eliminado no sale en la Lista, el Calendario, el iCal ni los huecos
 *    libres, libera su hueco, y se bloquea (409) lo que ya no es un error
 *    interno. «Eliminar», «Papelera» y «Restaurar» en /admin/visitas.
 *  - Oficina de la tarea (migración 0089): alta y edición validadas en la
 *    agencia, filtro en CRM → Tareas y el KPI «Tareas vencidas» del dashboard.
 *
 * Nada cruza de agencia (404) y sin sesión no se entra (401). Ninguna ruta
 * nueva: el presupuesto de rutas de Nitro está agotado. Comercial, oficinas y
 * días propios (muy en el futuro): no chocan con las citas de otros specs.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

let dayCounter = 0
/**
 * Un día futuro distinto en cada llamada ('YYYY-MM-DD'): dentro de 60 años,
 * lejos de los de cualquier otro spec, y siempre más tarde que los de una
 * ejecución anterior de éste — así sus citas encabezan la Lista de Visitas
 * (las 200 de fecha más tardía) aunque la D1 local acumule ejecuciones.
 */
function nextDay(): string {
  return new Date(Date.now() + (60 * 365 + dayCounter++) * 86_400_000).toISOString().slice(0, 10)
}

test.describe('Cierre D3a — notas, «creado por», papelera de citas y oficina de la tarea', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let me: string
  let officeId: number
  let otherOfficeId: number
  let commercialId: number
  let commercialSlug: string
  let developerId: number
  let developerPropertyId: number
  let agentPropertyId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    // Dentro de un describe con `storageState`, un contexto nuevo hereda la sesión: el anónimo la vacía a propósito.
    anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } })
    me = (await (await a.get('/api/auth/me')).json()).user.name

    for (const [name, set] of [
      [`Oficina D3a ${RUN}`, (id: number) => (officeId = id)],
      [`Oficina D3a otra ${RUN}`, (id: number) => (otherOfficeId = id)],
    ] as const) {
      const res = await a.post('/api/admin/offices', { data: { name } })
      expect(res.ok(), await res.text()).toBeTruthy()
      const id = (await res.json()).id as number
      set(id)
      cleanup.push(() => a.delete(`/api/admin/offices/${id}?hard=1`))
    }

    commercialSlug = `comercial-d3a-${RUN}`
    const team = await a.post('/api/admin/team', { data: { name: `Comercial D3a ${RUN}`, email: `comercial-d3a-${RUN}@example.com`, position: 'Comercial', slug: commercialSlug, officeId } })
    expect(team.ok(), await team.text()).toBeTruthy()
    commercialId = (await team.json()).id
    cleanup.push(() => a.delete(`/api/admin/team/${commercialId}`))
    // Agenda abierta todos los días de 09:00 a 13:00 en tramos de 60 min (para los huecos libres).
    const availability = await a.put(`/api/admin/saas/agents/${commercialId}/availability`, {
      data: { slotDurationMinutes: 60, rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '13:00' })) },
    })
    expect(availability.ok(), await availability.text()).toBeTruthy()

    const dev = await a.post('/api/admin/developers', { data: { name: `Promotora D3a ${RUN}`, email: `dev-d3a-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
    const devProp = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Torre D3a ${RUN}`, status: 'new', price: 480000, transactionType: 'sale', city: 'E2E-D3a' } })
    expect(devProp.ok(), await devProp.text()).toBeTruthy()
    developerPropertyId = (await devProp.json()).id
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${developerPropertyId}?hard=1`))
    const agentProp = await a.post('/api/admin/properties', { data: { slug: `d3a-${RUN}`, price: 260000, transactionType: 'sale', status: 'available', city: 'E2E-D3a' } })
    expect(agentProp.ok(), await agentProp.text()).toBeTruthy()
    agentPropertyId = (await agentProp.json()).id
    cleanup.push(() => a.delete(`/api/admin/properties/${agentPropertyId}?hard=1`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
    await anon?.dispose()
  })

  async function seedContact(tag: string) {
    const res = await a.post('/api/admin/saas/contacts', { data: { name: `D3a ${tag} ${RUN}`, email: `d3a-${tag}-${RUN}@example.com`, force: true } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).id as number
  }

  async function newDeal(tag: string) {
    const buyerContactId = await seedContact(tag)
    const offer = await (await a.post('/api/admin/saas/offers', { data: { propertyId: developerPropertyId, propertyKind: 'developer', buyerContactId, amount: 450000 } })).json()
    await a.post(`/api/admin/saas/offers/${offer.id}/submit`, { data: {} })
    await a.post(`/api/admin/saas/offers/${offer.id}/accept`, { data: {} })
    const res = await a.post('/api/admin/saas/deal-operations', { data: { acceptedOfferId: offer.id } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()) as { id: number }
  }

  async function newAppointment(day: string, hour: string, extra: Record<string, unknown> = {}) {
    const res = await a.post('/api/admin/saas/visits', {
      data: { type: 'meeting', clientName: `Cliente D3a ${RUN}`, agentId: commercialId, scheduledAt: `${day} ${hour}:00`, durationMinutes: 60, propertyId: developerPropertyId, propertyKind: 'developer', ...extra },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()).id as number
  }

  // ---------------------------------------------------------------------------
  // Notas y «Creado por»
  // ---------------------------------------------------------------------------

  test('API: notas en propiedad (los dos catálogos), cita y operación; de otra agencia 404 y sin sesión 401', async () => {
    const appointmentId = await newAppointment(nextDay(), '09:00')
    const deal = await newDeal('notas')
    const targets: Array<Record<string, unknown>> = [
      { entityType: 'property', entityId: developerPropertyId, propertyKind: 'developer' },
      { entityType: 'property', entityId: agentPropertyId, propertyKind: 'agent' },
      { entityType: 'appointment', entityId: appointmentId },
      { entityType: 'deal', entityId: deal.id },
    ]
    for (const target of targets) {
      const created = await a.post('/api/admin/notes', { data: { ...target, body: `Nota D3a ${target.entityType} ${RUN}` } })
      expect(created.ok(), await created.text()).toBeTruthy()
      const rows = (await (await a.get('/api/admin/notes', { params: target as Record<string, string> })).json()).rows
      expect(rows.map((r: any) => r.body)).toContain(`Nota D3a ${target.entityType} ${RUN}`)
      expect(rows[0].authorName).toBe(me)
      // Otra agencia: ni escribe (404) ni lee (lista vacía); sin sesión, 401.
      expect((await b.post('/api/admin/notes', { data: { ...target, body: 'intruso' } })).status()).toBe(404)
      expect((await (await b.get('/api/admin/notes', { params: target as Record<string, string> })).json()).rows).toHaveLength(0)
      expect((await anon.post('/api/admin/notes', { data: { ...target, body: 'x' } })).status()).toBe(401)
    }
  })

  test('API: «Creado por» en el contacto, la cita, la operación y la tarea', async () => {
    const contactId = await seedContact('creador')
    const contact = (await (await a.get(`/api/admin/saas/contacts/${contactId}`)).json()).contact
    expect(contact).toMatchObject({ createdByName: me, createdByDeleted: false })

    const appointmentId = await newAppointment(nextDay(), '10:00')
    expect((await (await a.get('/api/admin/saas/visits', { params: { id: String(appointmentId) } })).json()).row).toMatchObject({ createdByName: me, createdByDeleted: false })

    const deal = await newDeal('creador')
    expect((await (await a.get('/api/admin/saas/deal-operations', { params: { id: String(deal.id) } })).json()).deal).toMatchObject({ createdByName: me })

    const task = await (await a.post('/api/admin/saas/tasks', { data: { type: 'call', title: `Tarea creador D3a ${RUN}` } })).json()
    const row = ((await (await a.get('/api/admin/saas/tasks', { params: { status: 'active' } })).json()).rows as any[]).find((r) => r.id === task.id)
    expect(row).toMatchObject({ createdByName: me, createdByDeleted: false })
  })

  test('panel: notas en la ficha de la propiedad (2ª mano), de la operación y de la cita; «Creado por» en el contacto y la operación', async ({ page }) => {
    await page.goto(`/admin/properties/${agentPropertyId}`)
    const propertyNotes = page.getByTestId('property-notes')
    await expect(propertyNotes).toBeVisible()
    await propertyNotes.getByTestId('note-draft').fill(`Llaves en portería ${RUN}`)
    await propertyNotes.getByTestId('note-add').click()
    await expect(propertyNotes.getByTestId('note-item').first()).toContainText(`Llaves en portería ${RUN}`)

    const deal = await newDeal('panel')
    await page.goto(`/admin/deal-operations/${deal.id}`)
    await expect(page.getByTestId('created-by').first()).toContainText(`Creado por ${me}`)
    const dealNotes = page.getByTestId('deal-notes')
    await dealNotes.getByTestId('note-draft').fill(`Notaría pedida ${RUN}`)
    await dealNotes.getByTestId('note-add').click()
    await expect(dealNotes.getByTestId('note-item').first()).toContainText(`Notaría pedida ${RUN}`)

    const contactId = await seedContact('cabecera')
    await page.goto(`/admin/contactos/${contactId}`)
    await expect(page.getByTestId('contact-header').getByTestId('created-by')).toContainText(`Creado por ${me}`)

    const appointmentId = await newAppointment(nextDay(), '11:00')
    await page.goto('/admin/visitas')
    await page.getByTestId(`visit-row-${appointmentId}`).getByRole('button', { name: `Cliente D3a ${RUN}` }).click()
    const detail = page.getByTestId('appointment-detail')
    await expect(detail.getByTestId('created-by')).toContainText(`Creado por ${me}`)
    const notes = detail.getByTestId('appointment-detail-notes')
    await notes.getByTestId('note-draft').fill(`Trae la nómina ${RUN}`)
    await notes.getByTestId('note-add').click()
    await expect(notes.getByTestId('note-item').first()).toContainText(`Trae la nómina ${RUN}`)
    const stored = (await (await a.get('/api/admin/notes', { params: { entityType: 'appointment', entityId: String(appointmentId) } })).json()).rows
    expect(stored.map((r: any) => r.body)).toContain(`Trae la nómina ${RUN}`)
  })

  // ---------------------------------------------------------------------------
  // Papelera de citas
  // ---------------------------------------------------------------------------

  test('API: eliminar libera el hueco y la saca de la Lista, el Calendario, el iCal y los huecos libres; restaurar la devuelve; otra agencia 404', async () => {
    const day = nextDay()
    const contactId = await seedContact('papelera')
    const id = await newAppointment(day, '10:00', { contactId })
    const freeSlots = async () => {
      const res = await anon.get(`/api/public/agents/${commercialSlug}/availability`, { params: { from: day, days: 1 } })
      expect(res.ok(), await res.text()).toBeTruthy()
      return ((await res.json()).days[0].slots as any[]).map((s) => s.start)
    }
    const icalToken = (await (await a.get(`/api/admin/saas/agents/${commercialId}/availability`)).json()).agent.icalToken
    const ics = async () => (await (await fetch(`${BASE_URL}/calendar/${icalToken}.ics`)).text()).replace(/\r\n /g, '')
    const listed = async (params: Record<string, string>) => ((await (await a.get('/api/admin/saas/visits', { params })).json()).rows as any[]).map((r) => r.id)
    const calendar = async () => ((await (await a.get('/api/admin/saas/calendar', { params: { from: day, to: day, agentId: String(commercialId) } })).json()).rows as any[]).map((r) => r.id)

    expect(await freeSlots()).not.toContain(`${day} 10:00:00`)
    expect(await ics()).toContain(`UID:visit-${id}@`)

    expect((await b.patch(`/api/admin/saas/visits/${id}`, { data: { deleted: true } })).status()).toBe(404)
    expect((await anon.patch(`/api/admin/saas/visits/${id}`, { data: { deleted: true } })).status()).toBe(401)
    const trashed = await a.patch(`/api/admin/saas/visits/${id}`, { data: { deleted: true } })
    expect(trashed.ok(), await trashed.text()).toBeTruthy()

    expect(await listed({})).not.toContain(id)
    expect(await listed({ trashed: '1' })).toContain(id)
    expect(await calendar()).not.toContain(id)
    expect((await a.get('/api/admin/saas/visits', { params: { id: String(id) } })).status()).toBe(404)
    expect(await ics()).not.toContain(`UID:visit-${id}@`)
    expect(await freeSlots()).toContain(`${day} 10:00:00`)
    expect(((await (await b.get('/api/admin/saas/visits', { params: { trashed: '1' } })).json()).rows as any[]).map((r) => r.id)).not.toContain(id)
    // En la papelera ni se edita.
    expect((await a.patch(`/api/admin/saas/visits/${id}`, { data: { notes: 'cambio' } })).status()).toBe(404)

    // La cita buena entra en el mismo hueco; mientras lo ocupe, restaurar la equivocada es 409.
    const right = await newAppointment(day, '10:00', { contactId, clientName: `Cliente buena D3a ${RUN}` })
    const busy = await a.patch(`/api/admin/saas/visits/${id}`, { data: { deleted: false } })
    expect(busy.status()).toBe(409)
    expect(await busy.text()).toContain('franja')
    expect((await a.patch(`/api/admin/saas/visits/${right}`, { data: { status: 'cancelled', cancellationReason: 'Se cambia por otra cita' } })).ok()).toBeTruthy()

    expect((await b.patch(`/api/admin/saas/visits/${id}`, { data: { deleted: false } })).status()).toBe(404)
    const restored = await a.patch(`/api/admin/saas/visits/${id}`, { data: { deleted: false } })
    expect(restored.ok(), await restored.text()).toBeTruthy()
    expect(await restored.json()).toMatchObject({ id, status: 'scheduled' })
    expect(await listed({})).toContain(id)
    expect(await calendar()).toContain(id)

    const activity = await (await a.get('/api/admin/saas/activity', { params: { contactId: String(contactId) } })).json()
    expect(activity.rows.map((r: any) => r.eventType)).toEqual(expect.arrayContaining(['APPOINTMENT_TRASHED', 'APPOINTMENT_RESTORED']))
  })

  test('API: qué bloquea eliminar una cita (409 con el motivo): parada de tour y cita ya realizada', async () => {
    const day = nextDay()
    const tour = await a.post('/api/admin/saas/tours', {
      data: { clientName: `Tour D3a ${RUN}`, clientEmail: `tour-d3a-${RUN}@example.com`, stops: [{ propertyId: developerPropertyId, propertyKind: 'developer', agentId: commercialId, scheduledAt: `${day} 09:00:00`, durationMinutes: 45 }] },
    })
    expect(tour.ok(), await tour.text()).toBeTruthy()
    const stopId = (await tour.json()).stopIds[0]
    const stop = await a.patch(`/api/admin/saas/visits/${stopId}`, { data: { deleted: true } })
    expect(stop.status()).toBe(409)
    expect(await stop.text()).toContain('tour')

    const done = await newAppointment(day, '11:00')
    expect((await a.patch(`/api/admin/saas/visits/${done}`, { data: { status: 'completed' } })).ok()).toBeTruthy()
    const blocked = await a.patch(`/api/admin/saas/visits/${done}`, { data: { deleted: true } })
    expect(blocked.status()).toBe(409)
    expect(await blocked.text()).toContain('realizó')
    expect(((await (await a.get('/api/admin/saas/visits', { params: { trashed: '1' } })).json()).rows as any[]).map((r) => r.id)).not.toContain(done)
  })

  test('panel: «Eliminar» con confirmación, la «Papelera» de Visitas (también a 375 px) y «Restaurar»', async ({ page }) => {
    const id = await newAppointment(nextDay(), '12:00', { clientName: `Cita por error D3a ${RUN}` })
    await page.goto('/admin/visitas')
    const row = page.getByTestId(`visit-row-${id}`)
    await expect(row).toBeVisible()
    await page.getByTestId(`visit-row-${id}-trash`).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('¿Eliminar esta cita creada por error?')
    await dialog.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await expect(page.getByTestId(`visit-row-${id}`)).toHaveCount(0)

    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByTestId('visitas-trash-toggle').click()
    await expect(page).toHaveURL(/bucket=trash/)
    await expect(page.getByTestId('visitas-trash-notice')).toBeVisible()
    const trashedRow = page.getByTestId(`visit-row-${id}`)
    await expect(trashedRow).toBeVisible()
    await expect(trashedRow.getByTestId('created-by')).toContainText(`Creado por ${me}`)
    await expect(trashedRow).toContainText('Agendada')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, 'la papelera de citas no debe desplazar la página en horizontal a 375 px').toBeLessThanOrEqual(1)

    await page.getByTestId(`visit-restore-${id}`).click()
    await expect(page.getByTestId(`visit-row-${id}`)).toHaveCount(0)
    await page.getByTestId('visitas-trash-toggle').click()
    await expect(page.getByTestId(`visit-row-${id}`)).toBeVisible()
    expect((await (await a.get('/api/admin/saas/visits', { params: { id: String(id) } })).json()).row).toMatchObject({ status: 'scheduled' })
  })

  test('panel: «Eliminar» desde la ficha de la cita', async ({ page }) => {
    const id = await newAppointment(nextDay(), '09:00', { clientName: `Ficha D3a ${RUN}` })
    await page.goto('/admin/visitas')
    await page.getByTestId(`visit-row-${id}`).getByRole('button', { name: `Ficha D3a ${RUN}` }).click()
    await page.getByTestId('appointment-detail-trash').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar', exact: true }).click()
    await expect(page.getByTestId('appointment-detail')).toHaveCount(0)
    await expect(page.getByTestId(`visit-row-${id}`)).toHaveCount(0)
    expect(((await (await a.get('/api/admin/saas/visits', { params: { trashed: '1' } })).json()).rows as any[]).map((r) => r.id)).toContain(id)
  })

  // ---------------------------------------------------------------------------
  // Oficina de la tarea
  // ---------------------------------------------------------------------------

  test('API: la oficina de la tarea se valida (ajena 404, mal formada 422), filtra Tareas y cuenta en el dashboard con la misma regla', async () => {
    const otherAgency = await b.post('/api/admin/offices', { data: { name: `Oficina ajena D3a ${RUN}` } })
    expect(otherAgency.ok(), await otherAgency.text()).toBeTruthy()
    const foreignOfficeId = (await otherAgency.json()).id
    cleanup.push(() => b.delete(`/api/admin/offices/${foreignOfficeId}?hard=1`))

    expect((await a.post('/api/admin/saas/tasks', { data: { type: 'call', title: 'Ajena', officeId: foreignOfficeId } })).status()).toBe(404)
    expect((await a.post('/api/admin/saas/tasks', { data: { type: 'call', title: 'Mal', officeId: 'centro' } })).status()).toBe(422)

    const past = '2026-01-05 09:00:00'
    const create = async (data: Record<string, unknown>) => {
      const res = await a.post('/api/admin/saas/tasks', { data: { type: 'call', dueAt: past, ...data } })
      expect(res.ok(), await res.text()).toBeTruthy()
      return (await res.json()) as { id: number; officeId: number | null }
    }
    const inherited = await create({ title: `Hereda D3a ${RUN}`, assigneeId: commercialId }) // la del comercial
    const own = await create({ title: `Otra oficina D3a ${RUN}`, assigneeId: commercialId, officeId: otherOfficeId })
    const direct = await create({ title: `Sin responsable D3a ${RUN}`, officeId })
    expect(inherited.officeId).toBeNull()
    expect(own.officeId).toBe(otherOfficeId)

    const titles = async (office: number) => ((await (await a.get('/api/admin/saas/tasks', { params: { status: 'active', officeId: String(office) } })).json()).rows as any[]).map((r) => r.title).sort()
    expect(await titles(officeId)).toEqual([`Hereda D3a ${RUN}`, `Sin responsable D3a ${RUN}`].sort())
    expect(await titles(otherOfficeId)).toEqual([`Otra oficina D3a ${RUN}`])

    const rows = ((await (await a.get('/api/admin/saas/tasks', { params: { status: 'active', officeId: String(officeId) } })).json()).rows as any[])
    expect(rows.find((r) => r.id === inherited.id)).toMatchObject({ officeName: `Oficina D3a ${RUN}`, officeFromAssignee: true })

    const overdue = async (office: number) => (await (await a.get('/api/admin/saas/overview', { params: { view: 'commercial', officeId: String(office) } })).json()).kpis.overdueTasks
    expect((await overdue(officeId)).value).toBe(2)
    expect((await overdue(otherOfficeId)).value).toBe(1)
    expect((await overdue(officeId)).link).toContain(`officeId=${officeId}`)

    // Cambiarla por PATCH: ajena 404; '' vuelve a «la de su responsable».
    expect((await a.patch(`/api/admin/saas/tasks/${own.id}`, { data: { officeId: foreignOfficeId } })).status()).toBe(404)
    expect((await a.patch(`/api/admin/saas/tasks/${own.id}`, { data: { officeId: '' } })).ok()).toBeTruthy()
    expect(await titles(otherOfficeId)).toEqual([])
    expect((await overdue(officeId)).value).toBe(3)

    for (const t of [inherited, own, direct]) await a.patch(`/api/admin/saas/tasks/${t.id}`, { data: { deleted: true } })
  })

  test('panel: oficina en el formulario de la tarea y filtro por oficina en CRM → Tareas', async ({ page }) => {
    const title = `Tarea oficina panel D3a ${RUN}`
    await page.goto('/admin/tareas')
    await page.getByTestId('task-new').click()
    await page.getByTestId('task-form-title').fill(title)
    await page.getByTestId('task-form-assignee').selectOption(String(commercialId))
    await expect(page.getByTestId('task-form-office').locator('option').first()).toHaveText(`La de su responsable (Oficina D3a ${RUN})`)
    await page.getByTestId('task-form-office').selectOption(String(otherOfficeId))
    await page.getByTestId('task-form-save').click()
    await expect(page.getByTestId('task-form')).toHaveCount(0)

    const task = ((await (await a.get('/api/admin/saas/tasks', { params: { status: 'active' } })).json()).rows as any[]).find((r) => r.title === title)
    expect(task).toMatchObject({ officeId: otherOfficeId, createdByName: me })

    await page.getByTestId('tasks-filter-office').selectOption(String(otherOfficeId))
    await expect(page.getByTestId(`task-row-${task.id}`)).toBeVisible()
    await expect(page.getByTestId(`task-office-${task.id}`)).toContainText(`Oficina D3a otra ${RUN}`)
    await expect(page.getByTestId(`task-row-${task.id}`).getByTestId('created-by')).toContainText(`Creado por ${me}`)
    await page.getByTestId('tasks-filter-office').selectOption(String(officeId))
    await expect(page.getByTestId(`task-row-${task.id}`)).toHaveCount(0)

    // Editar: volver a «la de su responsable».
    await page.getByTestId('tasks-filter-office').selectOption('')
    await page.getByTestId(`task-edit-${task.id}`).click()
    await page.getByTestId('task-form-office').selectOption('')
    await page.getByTestId('task-form-save').click()
    await expect(page.getByTestId(`task-office-${task.id}`)).toContainText('de su responsable')
    await a.patch(`/api/admin/saas/tasks/${task.id}`, { data: { deleted: true } })
  })
})
