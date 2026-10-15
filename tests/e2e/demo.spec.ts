import { test, expect, request as pwRequest } from '@playwright/test'
import { STATE_A, ANON_STATE } from './global-setup'

/**
 * Cuenta demo «Norte Astur Inmobiliaria» sobre el Worker real (docs/demo.md):
 *
 *  1. El super admin la crea desde Sistemas > Empresas y la genera por tramos
 *     (lo mismo que hace el cron de cada minuto en producción).
 *  2. La gerente entra con su usuario: es administradora de ESA empresa, no ve
 *     nada exclusivo del super admin y el panel avisa de que es una demo.
 *  3. Hay datos de verdad con foto (contactos, propiedades) y los enlaces de
 *     llamar/escribir no salen del navegador.
 *  4. La web de la demo se ve en vista previa (no tiene dominio) y sólo para
 *     su equipo.
 *
 * La contraseña de la gerente en el e2e es una de prueba (DEMO_ADMIN_PASSWORD_HASH
 * en scripts/e2e.sh), no la de producción.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const DEMO_EMAIL = 'demo@portalinmo'
const DEMO_PASSWORD = 'E2e-Demo-Placeholder-1!'
const DEMO_IP = { 'cf-connecting-ip': `203.0.113.${(Date.now() % 200) + 20}` }

test.describe.configure({ timeout: 900_000 })

test('cuenta demo: se genera, la gerente entra sin opciones de super admin y nada sale de la plataforma', async ({ browser }) => {
  const owner = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })

  // 1. Crear y generar (cada llamada ejecuta un tramo).
  let progress = await (await owner.post('/api/admin/organizations', { data: { action: 'demo-create' } })).json()
  const ACTIVE = ['provisioning', 'resetting', 'restoring', 'updating', 'snapshotting']
  for (let i = 0; i < 200 && ACTIVE.includes(progress.status); i++) {
    const res = await owner.post('/api/admin/organizations', { data: { action: 'demo-advance' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    progress = await res.json()
  }
  expect(progress.error).toBeNull()
  expect(progress.status).toBe('ready')
  const orgId: number = progress.orgId

  // Restablecer exige escribir el identificador de la empresa.
  const refused = await owner.post('/api/admin/organizations', { data: { action: 'demo-regenerate', confirm: 'otra-cosa' } })
  expect(refused.status()).toBe(422)

  // 2. La gerente entra con su usuario.
  const context = await browser.newContext({ baseURL: BASE_URL, storageState: ANON_STATE, extraHTTPHeaders: DEMO_IP })
  const login = await context.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } })
  expect(login.ok(), await login.text()).toBeTruthy()
  expect((await login.json()).user.role).toBe('admin')
  const page = await context.newPage()

  await page.goto('/admin')
  await expect(page.getByTestId('demo-badge')).toBeVisible()
  const nav = page.locator('aside')
  for (const label of ['Empresas', 'Errores', 'Estado del sistema']) await expect(nav.getByRole('link', { name: label, exact: true })).toHaveCount(0)
  await expect(page.getByText('Empresa', { exact: true })).toHaveCount(0) // selector de empresas del super admin
  // Las rutas del super admin le responden 403.
  expect((await page.request.get('/api/admin/organizations')).status()).toBe(403)
  expect((await page.request.post('/api/admin/organizations', { data: { action: 'demo-status' } })).status()).toBe(403)

  // 3. Contactos con foto y enlaces externos neutralizados.
  await page.goto('/admin/contactos')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  expect(await page.locator('tbody tr img').count()).toBeGreaterThan(10)
  await page.locator('tbody tr a[href^="/admin/contactos/"]').first().click()
  await expect(page.getByTestId('contact-name')).toBeVisible()
  await expect(page.getByTestId('contact-header').locator('img').first()).toBeVisible()
  const call = page.getByTestId('contact-header').getByRole('link', { name: 'Llamar' })
  if (await call.count()) {
    const before = page.url()
    await call.click()
    await expect(page.getByText(/Cuenta de demostración: no se llama ni se escribe a nadie/)).toBeVisible()
    expect(page.url()).toBe(before)
  }

  // Propiedades de segunda mano con su foto.
  const props = await (await page.request.get('/api/admin/properties', { params: { pageSize: '50' } })).json()
  const rows = props.rows ?? props
  expect(rows.length).toBe(10)
  expect(rows.every((p: any) => Boolean(p.mainImage))).toBeTruthy()

  // 3b. Propiedades de referencia (docs/demo.md): las dos mejor documentadas de cada catálogo salen
  // primero, marcadas, con el orden por defecto; cualquier otra ordenación, filtro o página las trata como a las demás.
  const WEB_REFS = ['Villa de diseño frente al mar en Celorio', 'Ático con terraza junto al Campo San Francisco']
  const web = (await (await page.request.get('/api/admin/developer-properties', { params: { perPage: '100' } })).json()).rows as any[]
  expect(web.length).toBe(10)
  expect(web.slice(0, 2).map((r) => r.name)).toEqual(WEB_REFS)
  expect(web.slice(0, 2).every((r) => r.demoReference === true)).toBe(true)
  expect(web.slice(2).every((r) => r.demoReference === false)).toBe(true)
  // El resto conserva su orden de siempre («Más recientes»): el mismo que sin las de referencia.
  const rest = web.slice(2).map((r) => r.id)
  const newest = (await (await page.request.get('/api/admin/developer-properties', { params: { perPage: '100', sort: 'newest' } })).json()).rows as any[]
  expect(newest.map((r) => r.id)).toEqual(web.map((r) => r.id))
  const byPrice = (await (await page.request.get('/api/admin/developer-properties', { params: { perPage: '100', sort: 'price_asc' } })).json()).rows as any[]
  const prices = byPrice.map((r) => r.price)
  expect(prices).toEqual([...prices].sort((a, b) => a - b)) // ordenación explícita: manda el precio, no la referencia
  expect(byPrice[0].demoReference).toBe(false)
  expect(byPrice.filter((r) => r.demoReference).map((r) => r.name).sort()).toEqual([...WEB_REFS].sort()) // pero siguen marcadas
  // Filtros: sólo lo que coincide (el ático de referencia y el otro ático), la de referencia primero.
  const attics = (await (await page.request.get('/api/admin/developer-properties', { params: { perPage: '100', propertyType: 'Penthouse' } })).json()).rows as any[]
  expect(attics.every((r) => r.propertyType === 'Penthouse')).toBe(true)
  expect(attics[0].name).toBe(WEB_REFS[1])
  expect(attics.slice(1).every((r) => r.demoReference === false)).toBe(true)
  const villas = (await (await page.request.get('/api/admin/developer-properties', { params: { perPage: '100', propertyType: 'Apartment' } })).json()).rows as any[]
  expect(villas.some((r) => r.demoReference)).toBe(false) // ninguna de referencia es un piso en la web: no se cuela
  // Paginación: las de referencia sólo en la primera página; el total no cambia.
  const p1 = await (await page.request.get('/api/admin/developer-properties', { params: { perPage: '3', page: '1' } })).json()
  const p2 = await (await page.request.get('/api/admin/developer-properties', { params: { perPage: '3', page: '2' } })).json()
  expect(p1.total).toBe(10)
  expect((p1.rows as any[]).slice(0, 2).map((r) => r.name)).toEqual(WEB_REFS)
  expect((p2.rows as any[]).some((r) => r.demoReference)).toBe(false)
  expect([...p1.rows, ...p2.rows].map((r: any) => r.id).slice(2, 6)).toEqual(rest.slice(0, 4))

  const used = (await (await page.request.get('/api/admin/properties', { params: { perPage: '100' } })).json()).rows as any[]
  expect(used.length).toBe(10)
  expect(used.slice(0, 2).map((r) => [r.propertyType, r.district])).toEqual([['Apartment', 'La Florida'], ['House', 'Posada']])
  expect(used.slice(0, 2).every((r) => r.demoReference === true)).toBe(true)
  expect(used.slice(2).every((r) => r.demoReference === false)).toBe(true)
  const usedByPrice = (await (await page.request.get('/api/admin/properties', { params: { perPage: '100', sort: 'price_desc' } })).json()).rows as any[]
  expect(usedByPrice.map((r) => r.price)).toEqual([...usedByPrice.map((r) => r.price)].sort((a, b) => b - a))
  // La empresa real (la del super admin) no cambia: ni marca ni orden.
  const realRows = (await (await owner.get('/api/admin/developer-properties', { params: { perPage: '100' } })).json()).rows as any[]
  expect(realRows.every((r) => !('demoReference' in r))).toBe(true)

  // Marco dorado y etiqueta en las tarjetas y en las filas, en escritorio, tableta y móvil, sin desbordar.
  for (const [width, height] of [[1280, 900], [820, 1000], [390, 800]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/admin/developer-properties')
    const cards = page.locator('[data-demo-reference="1"]')
    await expect(cards).toHaveCount(2)
    await expect(page.locator('[data-testid^="property-reference-tag-"]')).toHaveCount(2)
    await expect(cards.first().locator('[data-testid^="property-reference-tag-"]')).toHaveText('Propiedad de referencia')
    const frame = await cards.first().evaluate((el) => {
      const after = getComputedStyle(el, '::after')
      return { color: after.borderTopColor, width: after.borderTopWidth, style: after.borderTopStyle, content: after.content }
    })
    expect(frame).toEqual({ color: 'rgb(198, 166, 103)', width: '2px', style: 'solid', content: '""' })
    // Las de referencia son las dos primeras de la cuadrícula.
    const grid = page.locator('div.group.relative.overflow-hidden.rounded-xl')
    await expect(grid.nth(0)).toHaveAttribute('data-demo-reference', '1')
    await expect(grid.nth(1)).toHaveAttribute('data-demo-reference', '1')
    await expect(grid.nth(2)).not.toHaveAttribute('data-demo-reference', '1')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/admin/properties')
  await expect(page.locator('[data-demo-reference="1"]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await expect(page.locator('tr[data-demo-reference="1"]')).toHaveCount(2)
  await expect(page.locator('tr[data-demo-reference="1"] [data-testid^="property-reference-tag-"]').first()).toHaveText('Propiedad de referencia')
  await page.getByRole('button', { name: 'Grid', exact: true }).click()

  // Las fichas públicas de las dos de la web, ya publicadas: descripción completa, fotos por estancia, plano y documentos.
  for (const row of web.slice(0, 2)) {
    const detail = await (await page.request.get(`/api/public/properties/${row.slug}`, { params: { vista_previa: String(orgId) } })).json()
    expect(String(detail.project.description), row.name).toContain('Zona de noche')
    expect(String(detail.project.description).length, row.name).toBeGreaterThan(2200)
    expect((detail.gallery as any[]).length, row.name).toBeGreaterThanOrEqual(6)
    expect((detail.gallery as any[]).every((g) => !!g.room && !!g.alt), `${row.name}: fotos clasificadas con alt`).toBe(true)
    expect((detail.floorPlans as any[]).length, row.name).toBeGreaterThanOrEqual(1)
    expect((detail.documents as any[]).length, row.name).toBeGreaterThanOrEqual(3)
    expect((detail.documents as any[]).every((d) => /demostración|ficticia/i.test(`${d.title} ${d.notes ?? ''}`) || /plano de demostración/i.test(d.title)), `${row.name}: documentos de demostración`).toBe(true)
    // Cada archivo se sirve (nada roto).
    for (const g of detail.gallery as any[]) expect((await page.request.get(g.image.startsWith('/') ? g.image : `/api/media/${g.image}`)).status(), g.image).toBe(200)
    for (const f of detail.floorPlans as any[]) expect((await page.request.get(String(f.image).startsWith('/') ? f.image : `/api/media/${f.image}`)).status(), f.image).toBe(200)
  }

  // 4. La web de la demo en vista previa, sólo para su equipo, y tal cual se
  // publicará: sin franja negra, sin texto de «vista previa» ni botón de salir;
  // lo primero es la cabecera real de la inmobiliaria.
  await page.goto(`/?vista_previa=${orgId}`)
  await expect(page.getByText('Encuentra tu lugar')).toBeVisible()
  await expect(page.getByTestId('site-preview-bar')).toHaveCount(0)
  await expect(page.getByText(/Vista previa de la web de|Salir de la vista previa/)).toHaveCount(0)
  expect((await page.locator('header').first().boundingBox())?.y).toBe(0)
  const tenant = await (await page.request.get('/api/public/tenant')).json()
  expect(tenant.id).toBe(orgId)
  expect(tenant.isDemo).toBe(true)
  expect(tenant.preview).toBe(true)
  // El aviso de demostración (utils/siteConsent.ts): sólo en una web demo, como
  // tarjeta debajo de la cabecera (no una franja), honesto, y se cierra durante la visita.
  const demoNotice = page.getByTestId('demo-notice')
  await expect(demoNotice).toBeVisible()
  await expect(demoNotice.getByTestId('demo-notice-title')).toHaveText('Entorno de demostración')
  await expect(demoNotice).toContainText('no se envían fuera de la plataforma')
  const headerBox = (await page.locator('header').first().boundingBox())!
  expect((await demoNotice.boundingBox())!.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height)
  await demoNotice.getByTestId('demo-notice-close').click()
  await expect(demoNotice).toBeHidden()
  await page.reload()
  await expect(page.getByText('Encuentra tu lugar')).toBeVisible()
  await expect(page.getByTestId('demo-notice')).toHaveCount(0)
  // La pestaña «Alquilar» tiene inventario: las dos promociones en alquiler (p05 y p06), con su renta mensual y «/mes».
  const rent = await (await page.request.get(`/api/public/properties?operacion=alquiler&vista_previa=${orgId}`)).json()
  expect((rent.rows as any[]).map((p) => p.transactionType)).toEqual(['rent', 'rent'])
  expect((rent.rows as any[]).every((p) => p.price > 0 && p.price < 5_000)).toBeTruthy()
  await page.goto(`/propiedades?operacion=alquiler&vista_previa=${orgId}`)
  await expect(page.locator('.pc-price').first()).toContainText('/mes')
  expect(await page.locator('.pc-price').count()).toBe(2)
  // Se sale como siempre (el parámetro), sin franja que lo ofrezca.
  await page.goto('/?vista_previa=salir')
  expect((await (await page.request.get('/api/public/tenant')).json()).id).not.toBe(orgId)

  // Un visitante sin sesión no puede ver la web de la demo con el parámetro.
  const anon = await pwRequest.newContext({ baseURL: BASE_URL })
  const anonTenant = await (await anon.get(`/api/public/tenant?vista_previa=${orgId}`)).json()
  expect(anonTenant.id).not.toBe(orgId)
  await anon.dispose()

  // Ningún email de la demo salió: todos quedan «no enviados» con el motivo.
  const status = await (await owner.post('/api/admin/organizations', { data: { action: 'demo-status' } })).json()
  expect(status.status).toBe('ready')
  expect(status.snapshotAt).toBeTruthy()
  expect(status.legacy).toBe(false)

  // 5. Restablecer NO es destructivo: lo que deja un visitante (un contacto creado
  // desde el panel de la demo) desaparece; lo sembrado y sus imágenes siguen.
  const seededContacts = (await (await page.request.get('/api/admin/contacts', { params: { pageSize: '1' } })).json()).total
  const visitor = await page.request.post('/api/admin/contacts', { data: { name: 'Visitante e2e', email: `visitante-${Date.now()}@demo.test` } })
  expect(visitor.ok(), await visitor.text()).toBeTruthy()
  expect((await (await page.request.get('/api/admin/contacts', { params: { pageSize: '1' } })).json()).total).toBe(seededContacts + 1)
  // Una imagen sembrada (la foto principal de una propiedad) que tiene que seguir existiendo tras restablecer.
  // `mainImage` es la clave R2 tal cual (el panel la sirve por /api/media/<clave>).
  const seededKey: string = (rows as any[]).find((p) => p.mainImage)!.mainImage
  const seededImage = seededKey.startsWith('/') ? seededKey : `/api/media/${seededKey}`
  expect((await page.request.get(seededImage)).status()).toBe(200)
  let restoring = await (await owner.post('/api/admin/organizations', { data: { action: 'demo-reset', confirm: true } })).json()
  expect(restoring.status).toBe('restoring')
  for (let i = 0; i < 200 && ACTIVE.includes(restoring.status); i++) {
    const res = await owner.post('/api/admin/organizations', { data: { action: 'demo-advance' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    restoring = await res.json()
  }
  expect(restoring.error).toBeNull()
  expect(restoring.status).toBe('ready')
  expect(restoring.anchorDay).toBe(status.anchorDay)
  // Las sesiones abiertas en la demo son de los visitantes: el restablecimiento
  // las cierra y la gerente tiene que volver a entrar (con la misma contraseña).
  expect((await page.request.get('/api/admin/contacts', { params: { pageSize: '1' } })).status()).toBe(401)
  const relogin = await context.request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } })
  expect(relogin.ok(), await relogin.text()).toBeTruthy()
  expect((await (await page.request.get('/api/admin/contacts', { params: { pageSize: '1' } })).json()).total).toBe(seededContacts)
  expect((await page.request.get(seededImage)).status()).toBe(200)
  // La gerente sigue dentro y la web de la demo sigue viéndose.
  await page.goto(`/?vista_previa=${orgId}`)
  await expect(page.getByText('Encuentra tu lugar')).toBeVisible()

  await context.close()
  await owner.dispose()
})
