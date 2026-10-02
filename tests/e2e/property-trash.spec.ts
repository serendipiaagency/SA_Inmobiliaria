import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Papelera de propiedades (deleted_at, migración 0086).
 *
 * Borrar una propiedad desde el panel ya no la elimina: la manda a la
 * papelera, de donde se restaura o se elimina definitivamente, con el mismo
 * motor genérico que el resto de recursos con papelera
 * (`DELETE`, `?trashed=1`, `POST …/restore`, `DELETE …?hard=1`).
 *
 * Lo que se comprueba aquí, de punta a punta contra el Worker real:
 * borrar → desaparece del listado, de la búsqueda y de la web pública →
 * aparece en la papelera → no se le puede programar nada nuevo → restaurar
 * → vuelve; el borrado definitivo; que otra agencia no ve ni toca la
 * papelera ajena; y el recorrido en el panel, también a 375 px de ancho.
 *
 * TENANT_A es el super_admin del seed: sin cookie de organización activa
 * trabaja sobre la organización 1, que es la que sirve la web pública en
 * localhost — por eso la API pública ve lo que A crea.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

const ids = (res: any) => (res.rows || []).map((r: any) => r.id)

test.describe('Papelera de propiedades', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let developerId: number
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const dev = await a.post('/api/admin/developers', { data: { name: `Papelera promotora ${RUN}`, email: `papelera-${RUN}@mm.test`, status: 'active' } })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    developerId = (await dev.json()).id
    cleanup.push(() => a.delete(`/api/admin/developers/${developerId}`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
    await anon?.dispose()
  })

  async function createWeb(name: string) {
    const res = await a.post('/api/admin/developer-properties', { data: { developerId, name, status: 'new', price: 410000, city: 'E2E-Papelera' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const id = (await res.json()).id as number
    const { row } = await (await a.get(`/api/admin/developer-properties/${id}`)).json()
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${id}?hard=1`))
    return { id, slug: row.slug as string }
  }

  test('obra nueva: borrar → fuera del listado, de la búsqueda y de la web → en la papelera → restaurar → vuelve', async () => {
    const name = `Torre Papelera ${RUN}`
    const { id, slug } = await createWeb(name)

    // Viva: en el listado, en la búsqueda del panel y en la web pública.
    expect(ids(await (await a.get('/api/admin/developer-properties', { params: { q: name } })).json())).toContain(id)
    expect((await anon.get(`/api/public/properties/${slug}`)).status()).toBe(200)
    expect(ids(await (await anon.get('/api/public/properties', { params: { q: name } })).json())).toContain(id)

    // Eliminar = mandar a la papelera.
    const del = await a.delete(`/api/admin/developer-properties/${id}`)
    expect(del.ok(), await del.text()).toBeTruthy()

    expect(ids(await (await a.get('/api/admin/developer-properties', { params: { q: name } })).json()), 'sigue en el listado').not.toContain(id)
    const trash = await (await a.get('/api/admin/developer-properties', { params: { q: name, trashed: 1 } })).json()
    expect(ids(trash), 'no aparece en la papelera').toContain(id)
    expect(trash.rows.find((r: any) => r.id === id).deletedAt).toBeTruthy()

    // La web pública responde como si no existiera.
    expect((await anon.get(`/api/public/properties/${slug}`)).status()).toBe(404)
    expect((await anon.get(`/api/public/properties/${slug}/similar`)).status()).toBe(404)
    expect(ids(await (await anon.get('/api/public/properties', { params: { q: name } })).json())).not.toContain(id)
    // Y la búsqueda de inmueble del panel (Calendar, Comunicaciones) tampoco la ofrece.
    const search = await (await a.get('/api/admin/saas/properties/search', { params: { q: name } })).json()
    expect(search.rows.some((r: any) => r.kind === 'developer' && r.id === id)).toBe(false)

    // La ficha se puede abrir para revisarla, y dice que está en la papelera…
    const ficha = await a.get(`/api/admin/developer-properties/${id}`)
    expect(ficha.status()).toBe(200)
    expect((await ficha.json()).row.deletedAt).toBeTruthy()
    // …pero no se le puede programar nada nuevo: 422 con un motivo claro.
    const schedule = await a.post('/api/admin/scheduler/create', { data: { developerPropertyId: id, steps: [{ channelKey: 'own_web', offsetMinutes: 0 }] } })
    expect(schedule.status()).toBe(422)
    expect(await schedule.text()).toContain('papelera')
    const dup = await a.post(`/api/admin/developer-properties/${id}/duplicate`)
    expect(dup.status()).toBe(422)

    // Restaurar la devuelve tal cual.
    const restore = await a.post(`/api/admin/developer-properties/${id}/restore`)
    expect(restore.ok(), await restore.text()).toBeTruthy()
    expect(ids(await (await a.get('/api/admin/developer-properties', { params: { q: name } })).json())).toContain(id)
    expect(ids(await (await a.get('/api/admin/developer-properties', { params: { q: name, trashed: 1 } })).json())).not.toContain(id)
    expect((await anon.get(`/api/public/properties/${slug}`)).status()).toBe(200)
    expect((await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row.deletedAt).toBeNull()
  })

  test('borrado definitivo: sólo desde la papelera deja de existir del todo', async () => {
    const { id } = await createWeb(`Torre Definitiva ${RUN}`)
    expect((await a.delete(`/api/admin/developer-properties/${id}`)).ok()).toBeTruthy()
    const hard = await a.delete(`/api/admin/developer-properties/${id}?hard=1`)
    expect(hard.ok(), await hard.text()).toBeTruthy()

    expect((await a.get(`/api/admin/developer-properties/${id}`)).status()).toBe(404)
    expect(ids(await (await a.get('/api/admin/developer-properties', { params: { trashed: 1, perPage: 100 } })).json())).not.toContain(id)
    expect((await a.post(`/api/admin/developer-properties/${id}/restore`)).status()).toBe(404)
  })

  test('2ª mano: misma papelera, mismo ciclo', async () => {
    const slug = `papelera-2h-${RUN}`
    const created = await a.post('/api/admin/properties', { data: { slug, price: 250000, transactionType: 'sale', status: 'available', propertyType: 'Apartment', city: 'E2E-Papelera' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const id = (await created.json()).id as number
    cleanup.push(() => a.delete(`/api/admin/properties/${id}?hard=1`))

    expect((await a.delete(`/api/admin/properties/${id}`)).ok()).toBeTruthy()
    expect(ids(await (await a.get('/api/admin/properties', { params: { q: slug } })).json())).not.toContain(id)
    expect(ids(await (await a.get('/api/admin/properties', { params: { q: slug, trashed: 1 } })).json())).toContain(id)

    expect((await a.post(`/api/admin/properties/${id}/restore`)).ok()).toBeTruthy()
    expect(ids(await (await a.get('/api/admin/properties', { params: { q: slug } })).json())).toContain(id)
  })

  test('otra agencia no ve la papelera ajena, ni la restaura, ni la elimina', async () => {
    const name = `Torre Ajena ${RUN}`
    const { id } = await createWeb(name)
    expect((await a.delete(`/api/admin/developer-properties/${id}`)).ok()).toBeTruthy()

    // B pide su papelera con el mismo texto: la de A no está.
    const trashB = await (await b.get('/api/admin/developer-properties', { params: { q: name, trashed: 1 } })).json()
    expect(ids(trashB)).not.toContain(id)
    // Ni la ficha, ni restaurar, ni eliminar definitivamente: 404, como un id que no existe.
    expect((await b.get(`/api/admin/developer-properties/${id}`)).status()).toBe(404)
    expect((await b.post(`/api/admin/developer-properties/${id}/restore`)).status()).toBe(404)
    expect((await b.delete(`/api/admin/developer-properties/${id}?hard=1`)).status()).toBe(404)

    // Sigue intacta en la papelera de A.
    expect(ids(await (await a.get('/api/admin/developer-properties', { params: { q: name, trashed: 1 } })).json())).toContain(id)
  })

  test('panel: eliminar pide «mover a la papelera», la papelera restaura y elimina definitivamente, y a 375 px no hay scroll horizontal', async ({ page }) => {
    const name = `Torre Panel ${RUN}`
    const { id } = await createWeb(name)
    // Vista de lista: la fila tiene el botón «Eliminar» a la vista (en la cuadrícula está en un menú).
    await page.addInitScript(() => localStorage.setItem('sa-admin-developer-properties-view', 'list'))

    await page.goto(`/admin/developer-properties?q=${encodeURIComponent(name)}`)
    const row = page.locator('tbody tr', { hasText: name })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Eliminar', exact: true }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('¿Mover a la papelera?')
    await expect(dialog).toContainText('podrás restaurarla')
    await dialog.getByRole('button', { name: 'Mover a la papelera' }).click()
    await expect(page.locator('tbody tr', { hasText: name })).toHaveCount(0)

    // Papelera, a ancho de móvil.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByTestId('property-trash-toggle').click()
    await expect(page).toHaveURL(/trashed=1/)
    await expect(page.getByTestId('property-trash-notice')).toBeVisible()
    const trashRow = page.getByTestId(`property-trash-row-${id}`)
    await expect(trashRow).toBeVisible()
    await expect(trashRow).toContainText('Borrada el')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, 'la papelera no debe desplazarse en horizontal a 375 px').toBeLessThanOrEqual(1)

    // Abrir la ficha desde la papelera: avisa y deja restaurar desde ahí.
    await trashRow.getByRole('link').first().click()
    await expect(page.getByTestId('property-editor-trashed')).toBeVisible()
    await expect(page.getByTestId('property-share-whatsapp')).toHaveCount(0)
    await page.getByTestId('property-editor-restore').click()
    await expect(page.getByTestId('property-editor-trashed')).toHaveCount(0)
    expect((await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row.deletedAt).toBeNull()

    // Restaurar desde la propia papelera.
    expect((await a.delete(`/api/admin/developer-properties/${id}`)).ok()).toBeTruthy()
    await page.goto(`/admin/developer-properties?trashed=1&q=${encodeURIComponent(name)}`)
    await page.getByTestId(`property-trash-row-${id}`).getByTestId('property-restore').click()
    await expect(page.getByTestId(`property-trash-row-${id}`)).toHaveCount(0)
    await page.getByTestId('property-trash-toggle').click()
    await expect(page.locator('tbody tr', { hasText: name })).toBeVisible()

    // Eliminar definitivamente: confirmación propia, y deja de existir.
    expect((await a.delete(`/api/admin/developer-properties/${id}`)).ok()).toBeTruthy()
    await page.goto(`/admin/developer-properties?trashed=1&q=${encodeURIComponent(name)}`)
    await page.getByTestId(`property-trash-row-${id}`).getByTestId('property-hard-delete').click()
    await expect(dialog).toContainText('¿Eliminar esta propiedad definitivamente?')
    await dialog.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await expect(page.getByTestId('property-trash-empty')).toBeVisible()
    expect((await a.get(`/api/admin/developer-properties/${id}`)).status()).toBe(404)
  })
})
