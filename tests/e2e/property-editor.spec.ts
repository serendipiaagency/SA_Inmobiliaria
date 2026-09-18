import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * El Property Editor rediseñado (components/property-builder/).
 *
 * Lo que prueba este fichero es lo que el rediseño promete y lo que sólo se
 * puede comprobar en un navegador de verdad: que **los cuatro recorridos**
 * — alta y edición, obra nueva («Propiedades (web)») y segunda mano — son el
 * mismo editor, que lo que se escribe en él acaba en la base de datos tal
 * cual, que **no hay autoguardado** (y que el editor no finge que lo haya), y
 * que el armazón se comporta a ancho de móvil.
 *
 * La persistencia campo a campo (plan de pagos, orden de la galería, vídeo,
 * ubicación granular, aislamiento entre inmobiliarias) ya está cubierta a
 * nivel de API en developer-properties-admin.spec.ts,
 * properties-secondhand-admin.spec.ts, property-builder.spec.ts y
 * cross-tenant.spec.ts; aquí no se duplica. Lo que se añade es el camino que
 * recorre una persona: abrir, navegar los pasos, escribir y guardar.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

/**
 * Las secciones siguen montadas cuando no están activas (`v-show`, para no
 * perder lo escrito al cambiar de paso), y los pasos se dibujan dos veces —
 * columna en escritorio, tira horizontal en móvil, alternadas por CSS. Así
 * que casi todo lo del editor existe por duplicado en el DOM y hay que
 * apuntar a lo que de verdad se ve.
 */
const visible = (page: import('@playwright/test').Page, testId: string) => page.locator(`[data-testid="${testId}"]:visible`)
const step = (page: import('@playwright/test').Page, key: string) => visible(page, `property-editor-step-${key}`)

/** Los dos catálogos, con lo único que los distingue en la cabecera. */
const CATALOGUES = [
  { resource: 'developer-properties', newTitle: 'Nueva propiedad' },
  { resource: 'properties', newTitle: 'Nueva propiedad de 2ª mano' },
] as const

test.describe('Property Editor — los cuatro recorridos', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let developerId: number
  /** Una ficha ya existente por catálogo, para los recorridos de edición. */
  const existing: Record<string, number> = {}
  const createdDeveloperProperties: number[] = []
  const createdProperties: number[] = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })

    const dev = await a.post('/api/admin/developers', {
      data: { name: `Editor E2E promotora ${RUN}`, email: `editor-${RUN}@mm.test`, status: 'active' },
    })
    expect(dev.ok(), await dev.text()).toBeTruthy()
    developerId = (await dev.json()).id

    const web = await a.post('/api/admin/developer-properties', {
      data: {
        developerId,
        name: `Editor E2E torre ${RUN}`,
        status: 'under_construction',
        price: 750000,
        bedrooms: 3,
        bathrooms: 2,
        area: 120,
        city: 'E2E-Dubai',
        hasPool: true,
      },
    })
    expect(web.ok(), await web.text()).toBeTruthy()
    existing['developer-properties'] = (await web.json()).id
    createdDeveloperProperties.push(existing['developer-properties'])

    const second = await a.post('/api/admin/properties', {
      data: {
        slug: `editor-e2e-2h-${RUN}`,
        price: 310000,
        transactionType: 'sale',
        status: 'available',
        propertyType: 'Apartment',
        bedrooms: 2,
        city: 'E2E-Marbella',
      },
    })
    expect(second.ok(), await second.text()).toBeTruthy()
    existing.properties = (await second.json()).id
    createdProperties.push(existing.properties)
  })

  test.afterAll(async () => {
    for (const id of createdDeveloperProperties) await a.delete(`/api/admin/developer-properties/${id}`).catch(() => null)
    for (const id of createdProperties) await a.delete(`/api/admin/properties/${id}`).catch(() => null)
    if (developerId) await a.delete(`/api/admin/developers/${developerId}`).catch(() => null)
    await a?.dispose()
  })

  for (const { resource, newTitle } of CATALOGUES) {
    test(`alta y edición de ${resource} son el mismo editor`, async ({ page }) => {
      for (const mode of ['new', 'edit'] as const) {
        const id = mode === 'new' ? 'new' : String(existing[resource])
        await page.goto(`/admin/${resource}/${id}`)

        const editor = page.getByTestId('property-editor')
        await expect(editor).toBeVisible()
        await expect(editor).toHaveAttribute('data-resource', resource)
        await expect(editor).toHaveAttribute('data-mode', mode)

        // Las tres columnas del rediseño, todas presentes en los cuatro casos.
        await expect(page.getByTestId('property-editor-header')).toBeVisible()
        await expect(page.getByTestId('property-editor-steps')).toBeVisible()
        await expect(page.getByTestId('property-editor-preview')).toBeVisible()

        // El «Paso 1 de N» de la cabecera de sección cuenta los mismos pasos
        // que dibuja la columna: si un catálogo declarase una sección que la
        // columna no enseña (o al revés), esto se cae.
        const steps = await page.getByTestId('property-editor-steps').getByRole('button').count()
        expect(steps).toBeGreaterThan(5)
        await expect(visible(page, 'property-editor-step-indicator')).toHaveText(`Paso 1 de ${steps}`)

        if (mode === 'new') {
          await expect(page.getByTestId('property-editor-title')).toHaveText(newTitle)
          await expect(page.getByTestId('property-editor-preview')).toContainText('Sin referencia hasta guardar')
          await expect(page.getByTestId('property-editor-save')).toHaveText('Crear propiedad')
        } else {
          await expect(page.getByTestId('property-editor-preview')).toContainText(`Ref. #${existing[resource]}`)
          await expect(page.getByTestId('property-editor-save')).toHaveText('Guardar cambios')
        }
      }
    })
  }

  test('los pasos se recorren con la columna y con Siguiente, y el último ofrece Finalizar', async ({ page }) => {
    await page.goto(`/admin/properties/${existing.properties}`)
    // El editor se rellena tras hidratar (carga la ficha en onMounted), así
    // que hay que esperarlo antes de contar: `count()` no reintenta y un
    // recuento de 0 haría pasar el bucle de abajo sin hacer nada.
    await expect(page.getByTestId('property-editor-steps')).toBeVisible()
    const total = await page.getByTestId('property-editor-steps').getByRole('button').count()
    expect(total).toBeGreaterThan(5)

    // Por la columna: saltar directamente al paso de precio.
    await step(page, 'price').click()
    await expect(visible(page, 'property-editor-section-title')).toHaveText('Precio')

    // Por el pie: avanzar hasta el final y comprobar que el botón cambia.
    await step(page, 'info').click()
    for (let i = 1; i < total; i++) await visible(page, 'property-editor-next').click()
    await expect(visible(page, 'property-editor-step-indicator')).toHaveText(`Paso ${total} de ${total}`)
    await expect(visible(page, 'property-editor-next')).toHaveCount(0)
    await expect(visible(page, 'property-editor-finish')).toBeVisible()

    await visible(page, 'property-editor-prev').click()
    await expect(visible(page, 'property-editor-step-indicator')).toHaveText(`Paso ${total - 1} de ${total}`)
  })

  test('crear una propiedad de 2ª mano desde el editor la persiste y deja la ficha en modo edición', async ({ page }) => {
    const slug = `editor-ui-2h-${RUN}`
    await page.goto('/admin/properties/new')

    await page.locator('[data-field="slug"] input').fill(slug)
    await page.locator('[data-field="propertyType"] select').selectOption('Villa')

    await step(page, 'price').click()
    await page.locator('[data-field="price"] input').fill('425000')

    await page.getByTestId('property-editor-save').click()

    await expect(page).toHaveURL(/\/admin\/properties\/\d+$/)
    await expect(page.getByTestId('property-editor')).toHaveAttribute('data-mode', 'edit')
    await expect(page.getByTestId('property-editor-save-state')).toHaveText('Guardado')

    const id = Number(page.url().split('/').pop())
    createdProperties.push(id)
    const row = (await (await a.get(`/api/admin/properties/${id}`)).json()).row
    expect(row.slug).toBe(slug)
    expect(row.price).toBe(425000)
    expect(row.propertyType).toBe('Villa')
  })

  test('crear una propiedad web desde el editor persiste nombre, promotora y precio', async ({ page }) => {
    const name = `Editor UI torre ${RUN}`
    await page.goto('/admin/developer-properties/new')

    // Una ficha vacía nunca empieza completa: el progreso sale de campos
    // reales, no de cuántos pasos se han abierto.
    await expect(page.getByTestId('property-editor-progress')).not.toHaveText('100%')

    await page.locator('[data-field="name"] input').fill(name)
    await page.locator('[data-field="developerId"] select').selectOption({ label: `Editor E2E promotora ${RUN}` })
    await page.locator('[data-field="status"] select').selectOption('ready')

    await step(page, 'price').click()
    await page.locator('[data-field="price"] input').fill('980000')

    await page.getByTestId('property-editor-save').click()
    await expect(page).toHaveURL(/\/admin\/developer-properties\/\d+$/)

    const id = Number(page.url().split('/').pop())
    createdDeveloperProperties.push(id)
    const row = (await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row
    expect(row.name).toBe(name)
    expect(row.developerId).toBe(developerId)
    expect(row.price).toBe(980000)
    expect(row.status).toBe('ready')

    // El desplegable enseña la etiqueta en castellano, no el valor crudo que
    // guarda la columna.
    await expect(page.locator('[data-field="status"] select')).toHaveValue('ready')
    await expect(page.locator('[data-field="status"] select option[value="ready"]')).toHaveText('Lista')
  })

  test('cambiar un solo campo desde el editor no pisa el resto de la ficha', async ({ page }) => {
    const id = existing['developer-properties']
    const before = (await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row

    await page.goto(`/admin/developer-properties/${id}`)
    await step(page, 'features').click()
    await page.locator('[data-field="area"] input').fill('177')
    await page.getByTestId('property-editor-save').click()
    await expect(page.getByTestId('property-editor-save-state')).toHaveText('Guardado')

    const after = (await (await a.get(`/api/admin/developer-properties/${id}`)).json()).row
    expect(after.area).toBe(177)
    expect(after.name).toBe(before.name)
    expect(after.price).toBe(before.price)
    expect(after.bedrooms).toBe(before.bedrooms)
    expect(after.hasPool).toBe(before.hasPool)
    expect(after.city).toBe(before.city)
  })

  test('no hay autoguardado: escribir sin guardar no cambia nada y salir avisa', async ({ page }) => {
    const id = existing.properties
    const before = (await (await a.get(`/api/admin/properties/${id}`)).json()).row

    await page.goto(`/admin/properties/${id}`)
    await expect(visible(page, 'property-editor-hint')).toHaveText('Los cambios se guardan al pulsar Guardar.')

    await step(page, 'price').click()
    await page.locator('[data-field="price"] input').fill('1')

    // El editor lo dice en los dos sitios en los que se mira.
    await expect(page.getByTestId('property-editor-save-state')).toHaveText('Cambios sin guardar')
    await expect(visible(page, 'property-editor-hint')).toContainText('sin guardar')

    // Y, sobre todo, no ha mandado nada: el servidor sigue con el precio viejo.
    const untouched = (await (await a.get(`/api/admin/properties/${id}`)).json()).row
    expect(untouched.price).toBe(before.price)

    // Salir con cambios pendientes pide confirmación — si no la pidiera, ese
    // «1» se perdería en silencio.
    const messages: string[] = []
    page.on('dialog', (d) => {
      messages.push(d.message())
      d.accept()
    })
    await page.getByRole('link', { name: 'Volver al listado' }).click()
    await expect(page).toHaveURL(/\/admin\/properties$/)
    expect(messages.join(' ')).toContain('cambios sin guardar')

    const stillUntouched = (await (await a.get(`/api/admin/properties/${id}`)).json()).row
    expect(stillUntouched.price).toBe(before.price)
  })

  test('el editor no abre la ficha de otra inmobiliaria', async ({ page }) => {
    const b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    const created = await b.post('/api/admin/properties', {
      data: { slug: `editor-e2e-tenant-b-${RUN}`, price: 1234567, city: 'E2E-SkylineOnly' },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    const foreignId = (await created.json()).id

    try {
      await page.goto(`/admin/properties/${foreignId}`)
      await expect(page.getByTestId('property-editor-load-error')).toBeVisible()
      // Nada de la ficha ajena llega a pintarse.
      await expect(page.locator('body')).not.toContainText('E2E-SkylineOnly')
      await expect(page.getByTestId('property-editor-save')).toHaveCount(0)
    } finally {
      await b.delete(`/api/admin/properties/${foreignId}`).catch(() => null)
      await b.dispose()
    }
  })

  test('responsive: a ancho de móvil y de tableta no hay desbordamiento horizontal y los pasos siguen accesibles', async ({ page }) => {
    const id = existing['developer-properties']

    for (const [name, size] of [
      ['móvil', { width: 390, height: 844 }],
      ['tableta', { width: 834, height: 1112 }],
    ] as const) {
      await page.setViewportSize(size)
      await page.goto(`/admin/developer-properties/${id}`)
      await expect(page.getByTestId('property-editor')).toBeVisible()

      // Las columnas laterales desaparecen por debajo de xl — el formulario
      // se queda con todo el ancho, que es a lo que se viene.
      await expect(page.getByTestId('property-editor-steps')).toBeHidden()
      await expect(page.getByTestId('property-editor-preview')).toBeHidden()

      // Pero los pasos siguen ahí, en la tira horizontal.
      await step(page, 'location').click()
      await expect(visible(page, 'property-editor-section-title')).toHaveText('Ubicación')

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${name}: la página no debe desplazarse en horizontal`).toBeLessThanOrEqual(1)
    }
  })
})

/**
 * Sólo lectura. El panel ya dejaba *ver* una ficha a quien tiene lectura del
 * área pero no escritura; lo que enseñaba era el formulario completo y un
 * botón de guardar que la API rechaza siempre
 * (server/middleware/01.admin-rbac.ts). Esto comprueba que ahora se dice.
 *
 * Un solo login, por la misma razón que en admin-rbac.spec.ts: /api/auth/login
 * está limitado a 10 intentos por IP y 10 minutos, y toda la suite sale de la
 * misma dirección.
 */
test.describe('Property Editor — permisos', () => {
  const READONLY = { email: `editor-ro-${RUN}@sa-inmobiliaria.com`, password: 'ChangeMe123!' }
  const READONLY_STATE = 'tests/e2e/.auth/property-editor-readonly.json'

  let owner: APIRequestContext
  let userId: number
  let propertyId: number

  test.beforeAll(async () => {
    owner = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })

    const created = await owner.post('/api/admin/users', {
      data: { name: 'Property editor RO', email: READONLY.email, password: READONLY.password, role: 'admin', permissions: '["web:read"]' },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    userId = (await created.json()).id

    const prop = await owner.post('/api/admin/properties', {
      data: { slug: `editor-ro-${RUN}`, price: 200000, city: 'E2E-ReadOnly' },
    })
    expect(prop.ok(), await prop.text()).toBeTruthy()
    propertyId = (await prop.json()).id

    const session = await pwRequest.newContext({ baseURL: BASE_URL })
    const login = await session.post('/api/auth/login', { data: READONLY })
    expect(login.ok(), `login de sólo lectura falló: ${login.status()}`).toBeTruthy()
    await session.storageState({ path: READONLY_STATE })
    await session.dispose()
  })

  test.afterAll(async () => {
    if (propertyId) await owner.delete(`/api/admin/properties/${propertyId}`).catch(() => null)
    if (userId) await owner.delete(`/api/admin/users/${userId}`).catch(() => null)
    await owner?.dispose()
  })

  test('con permiso de sólo lectura la ficha se consulta pero no se edita', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: READONLY_STATE })
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE_URL}/admin/properties/${propertyId}`)
      await expect(page.getByTestId('property-editor')).toBeVisible()
      await expect(page.getByTestId('property-editor-readonly')).toBeVisible()

      // Ni el botón de la cabecera ni el de Finalizar existen…
      await expect(page.getByTestId('property-editor-save')).toHaveCount(0)
      await step(page, 'commercial').click()
      await expect(page.getByTestId('property-editor-finish')).toHaveCount(0)

      // …y los campos están deshabilitados de verdad, no sólo apagados.
      await step(page, 'price').click()
      await expect(page.locator('[data-field="price"] input')).toBeDisabled()

      // Recorrer los pasos sí funciona: consultar la ficha entera es
      // exactamente lo que este permiso concede.
      await step(page, 'info').click()
      await expect(visible(page, 'property-editor-section-title')).toHaveText('Información básica')
    } finally {
      await ctx.close()
    }
  })
})
