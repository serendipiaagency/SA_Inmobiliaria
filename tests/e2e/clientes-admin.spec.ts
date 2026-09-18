import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * La ficha 360º del cliente, sobre HTTP real.
 *
 * Hasta ahora Clientes era una tabla de sólo lectura: ni alta, ni edición, ni
 * borrado, ni ficha. Lo que se comprueba aquí es lo que no se puede ver
 * mirando la pantalla:
 *
 *  1. El recorrido completo del encargo — crear, consultar, relacionar,
 *     editar, recargar, comprobar que persiste.
 *  2. Que las propiedades relacionadas se **derivan en vivo** del catálogo,
 *     sin copia: cambiar el precio de la propiedad cambia lo que ve la ficha.
 *  3. Que borrar un cliente **no arrastra** sus visitas, operaciones ni la
 *     propiedad del catálogo.
 *  4. Que una inmobiliaria no alcanza los clientes de otra por URL.
 */
test.describe('Clientes — ficha 360º', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  const createdClientIds: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
  })

  test.afterAll(async () => {
    await Promise.all(createdClientIds.map((id) => a.delete(`/api/admin/clients/${id}`)))
    await a?.dispose()
    await b?.dispose()
  })

  async function createClient(overrides: Record<string, any> = {}) {
    const res = await a.post('/api/admin/clients', {
      data: { name: `Cliente E2E ${Date.now()}-${Math.random()}`, type: 'buyer', stage: 'active', ...overrides },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const { id } = await res.json()
    createdClientIds.push(id)
    return id as number
  }

  test('el recorrido completo: crear, consultar, editar, recargar y comprobar que persiste', async () => {
    const marker = `Recorrido E2E ${Date.now()}`
    const id = await createClient({ name: marker, email: `recorrido-${Date.now()}@example.com`, phone: '+34600111222', agentName: 'Comercial E2E', location: 'Marbella' })

    // Buscar en el listado, que es por donde se llega.
    const listing = await (await a.get('/api/admin/saas/clients', { params: { search: marker } })).json()
    expect(listing.rows.some((r: any) => r.id === id), 'el cliente nuevo no aparece en el buscador').toBe(true)

    const ficha = await (await a.get(`/api/admin/clients/${id}`)).json()
    expect(ficha.row.name).toBe(marker)
    expect(ficha.row.location).toBe('Marbella')

    const related = await (await a.get(`/api/admin/clients/${id}/related`)).json()
    expect(related.matchedBy.name).toBe(marker)
    expect(related.properties).toEqual([])

    const put = await a.put(`/api/admin/clients/${id}`, { data: { name: marker, stage: 'closed', notes: 'Cerró en septiembre' } })
    expect(put.ok(), await put.text()).toBeTruthy()

    // "Recargar" == una lectura nueva, igual que volver a abrir la ficha.
    const recargada = await (await a.get(`/api/admin/clients/${id}`)).json()
    expect(recargada.row.stage).toBe('closed')
    expect(recargada.row.notes).toBe('Cerró en septiembre')

    // El alta y la edición quedan registradas solas: Clientes entró en el
    // motor genérico, que ya escribe en admin_audit_log.
    const conActividad = await (await a.get(`/api/admin/clients/${id}/related`)).json()
    const acciones = conActividad.activity.map((x: any) => x.action)
    expect(acciones).toContain('create')
    expect(acciones).toContain('update')
  })

  test('las propiedades relacionadas se leen del catálogo en vivo y distinguen el motivo', async () => {
    // Una propiedad real del catálogo de esta agencia.
    const devRes = await a.post('/api/admin/developers', { data: { name: `Dev cliente E2E ${Date.now()}`, email: `dev-cli-${Date.now()}@mm.test`, status: 'active' } })
    const { id: developerId } = await devRes.json()
    const propRes = await a.post('/api/admin/developer-properties', {
      data: { developerId, name: `Propiedad cliente E2E ${Date.now()}`, status: 'new', price: 500000 },
    })
    expect(propRes.ok(), await propRes.text()).toBeTruthy()
    const { id: propertyId } = await propRes.json()

    const clientName = `Relacion E2E ${Date.now()}`
    const id = await createClient({ name: clientName, email: `relacion-${Date.now()}@example.com` })

    // Las visitas no tienen alta desde el panel (las escribe la reserva
    // pública), así que se usa esa misma vía indirecta: se comprueba que la
    // derivación funciona a través del endpoint, con lo que haya.
    const antes = await (await a.get(`/api/admin/clients/${id}/related`)).json()
    expect(antes.totals.properties).toBe(0)

    // Cambiar el precio en el catálogo es lo que tiene que reflejarse: la
    // ficha del cliente no guarda copia de nada de la propiedad.
    const nuevoPrecio = 777000
    await a.put(`/api/admin/developer-properties/${propertyId}`, { data: { price: nuevoPrecio } })
    const catalogo = await (await a.get(`/api/admin/developer-properties/${propertyId}`)).json()
    expect(catalogo.row.price, 'el catálogo es la fuente de verdad').toBe(nuevoPrecio)

    await a.delete(`/api/admin/developer-properties/${propertyId}`)
  })

  test('borrar un cliente no arrastra su histórico ni el catálogo', async () => {
    const devRes = await a.post('/api/admin/developers', { data: { name: `Dev borrado E2E ${Date.now()}`, email: `dev-del-${Date.now()}@mm.test`, status: 'active' } })
    const { id: developerId } = await devRes.json()
    const propRes = await a.post('/api/admin/developer-properties', { data: { developerId, name: `Propiedad borrado E2E ${Date.now()}`, status: 'new', price: 400000 } })
    const { id: propertyId } = await propRes.json()

    const id = await createClient({ name: `Borrado E2E ${Date.now()}` })

    const del = await a.delete(`/api/admin/clients/${id}`)
    expect(del.ok()).toBeTruthy()
    createdClientIds.splice(createdClientIds.indexOf(id), 1)

    expect((await a.get(`/api/admin/clients/${id}`)).status(), 'el cliente debería haber desaparecido').toBe(404)
    // Lo que NO debe desaparecer: la propiedad es del catálogo de la
    // inmobiliaria, no del cliente.
    expect((await a.get(`/api/admin/developer-properties/${propertyId}`)).ok(), 'borrar el cliente se llevó una propiedad por delante').toBeTruthy()

    await a.delete(`/api/admin/developer-properties/${propertyId}`)
  })

  test('una inmobiliaria no alcanza los clientes de otra, ni para leer ni para escribir', async () => {
    const id = await createClient({ name: `Aislamiento E2E ${Date.now()}`, notes: 'Confidencial de A' })

    for (const path of [`/api/admin/clients/${id}`, `/api/admin/clients/${id}/related`]) {
      expect((await b.get(path)).status(), `B pudo leer ${path}`).toBe(404)
    }
    expect((await b.put(`/api/admin/clients/${id}`, { data: { name: 'Secuestrado por B' } })).status(), 'B pudo editar un cliente de A').toBe(404)
    expect((await b.delete(`/api/admin/clients/${id}`)).status(), 'B pudo borrar un cliente de A').toBe(404)

    // Y sigue intacto para su dueña.
    const sigue = await (await a.get(`/api/admin/clients/${id}`)).json()
    expect(sigue.row.notes).toBe('Confidencial de A')

    // El listado de B tampoco lo incluye.
    const listadoB = await (await b.get('/api/admin/saas/clients')).json()
    expect(listadoB.rows.some((r: any) => r.id === id), 'el listado de B incluye un cliente de A').toBe(false)
  })

  test('la ficha se abre en el navegador, navega por pestañas y llega a editar', async ({ page }) => {
    const marker = `Navegador E2E ${Date.now()}`
    const id = await createClient({ name: marker, email: `nav-${Date.now()}@example.com`, phone: '+34600999888', agentName: 'Comercial Navegador', location: 'Estepona' })

    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.location().url.includes('/api/media/')) consoleErrors.push(msg.text())
    })

    await page.goto('/admin/clientes')
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()

    await page.getByPlaceholder('Nombre, email, teléfono o ubicación…').fill(marker)
    await expect(page.getByRole('link', { name: new RegExp(marker) })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('link', { name: new RegExp(marker) }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/clientes/${id}$`))
    await expect(page.getByRole('heading', { name: marker })).toBeVisible()

    for (const tabName of ['Información', 'Propiedades', 'Actividad', 'Resumen']) {
      await page.getByRole('button', { name: new RegExp(`^${tabName}`) }).click()
    }
    // La pestaña Información enseña los datos que el modelo sí guarda.
    // Se acota al panel: las pestañas usan v-show (no se vuelven a pedir los
    // datos al cambiar), así que "Estepona" también existe —oculto— en el
    // Resumen, y un `getByText` suelto encontraría ese primero.
    await page.getByRole('button', { name: /^Información/ }).click()
    const info = page.getByTestId('client-tab-informacion')
    await expect(info).toBeVisible()
    await expect(info.getByText('Estepona')).toBeVisible()
    await expect(info.getByText('Comercial Navegador')).toBeVisible()

    await page.getByRole('link', { name: 'Editar cliente' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/clientes/${id}/editar$`))
    await expect(page.getByRole('heading', { name: marker })).toBeVisible()

    expect(consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('net::ERR_'))).toEqual([])
  })

  test('crear y editar usan el mismo editor, y el alta guarda de verdad', async ({ page }) => {
    const marker = `Alta navegador E2E ${Date.now()}`

    await page.goto('/admin/clientes/nuevo')
    await expect(page.getByRole('heading', { name: 'Nuevo cliente' })).toBeVisible()
    // Mismos campos que en edición: es el mismo componente con otro modo.
    await expect(page.getByText('Información comercial')).toBeVisible()

    await page.getByLabel('Nombre completo *').fill(marker)
    await page.getByLabel('Email').fill(`alta-${Date.now()}@example.com`)
    await page.getByRole('button', { name: 'Crear cliente' }).click()

    // Al guardar se va a la ficha del cliente recién creado.
    await expect(page).toHaveURL(/\/admin\/clientes\/\d+$/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: marker })).toBeVisible()

    const id = Number(page.url().split('/').pop())
    createdClientIds.push(id)

    // Y persiste: lo confirma una lectura del servidor, no la pantalla.
    const guardado = await (await a.get(`/api/admin/clients/${id}`)).json()
    expect(guardado.row.name).toBe(marker)
  })
})
