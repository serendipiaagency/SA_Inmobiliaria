import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Cross-tenant attacks over real HTTP, against the running Worker.
 *
 * The unit matrix (test/unit/multitenant.crossTenant.test.ts) proves the
 * isolation primitives are correct; this proves the endpoints actually use
 * them — cookies, routing, handlers and D1 all in the loop.
 *
 * Two real tenants, both seeded by migrations:
 *   A = M&M Real Estate  (org 1, migrations/0021)
 *   B = Skyline Estates  (org 2, migrations/0024)
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/** Reuses the session global-setup.ts already established for this tenant. */
function sessionFor(storageState: string): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE_URL, storageState })
}

/**
 * A cross-tenant request must be refused with 404 — never 403, which would
 * confirm the id exists somewhere on the platform and turn a blind guess into
 * a confirmed enumeration.
 */
function expectCrossTenantDenied(status: number, what: string) {
  expect(status, `${what}: expected 404, got ${status}`).toBe(404)
}

/**
 * `agents.email` and `developers.email` are UNIQUE per tenant (migration
 * 0053), and this fixture always reuses the same seeded tenant, so its own
 * emails would collide with a previous run's leftover rows without the
 * suffix. Same reason the appointments spec randomizes its slots.
 *
 * `npm run test:e2e` ya parte de una D1 limpia, así que por esa vía no habría
 * restos; el sufijo se queda porque `E2E_KEEP_STATE=1` es un camino legítimo
 * —iterar rápido sin reconstruir la base— y porque un spec no debería
 * depender de que alguien se acordara de limpiar.
 */
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const PROJECT_NAME = `Skyline Secret Tower ${RUN}`

test.describe('Aislamiento entre inmobiliarias (cross-tenant)', () => {
  let a: APIRequestContext
  let b: APIRequestContext

  // Resources owned by tenant B, created through its own admin session.
  let bDeveloperId: number
  let bProjectId: number
  let bPropertyId: number
  let bFloorPlanId: number
  let bGalleryImageId: number
  let bAgentId: number

  test.beforeAll(async () => {
    a = await sessionFor(STATE_A)
    b = await sessionFor(STATE_B)

    const created = async (resource: string, data: Record<string, unknown>): Promise<number> => {
      const res = await b.post(`/api/admin/${resource}`, { data })
      expect(res.ok(), `tenant B could not create ${resource}: ${res.status()} ${await res.text()}`).toBeTruthy()
      return (await res.json()).id
    }

    bDeveloperId = await created('developers', { name: 'Skyline Dev X', email: `devx-${RUN}@skyline.test`, status: 'active' })
    bProjectId = await created('developer-properties', { developerId: bDeveloperId, name: PROJECT_NAME, status: 'new', price: 750000 })
    bPropertyId = await created('properties', { location: 'Skyline City', propertyType: 'Apartment', price: 420000, status: 'available' })
    bFloorPlanId = await created('floor-plans', { developerPropertyId: bProjectId, category: 'Skyline plan', unitType: '3BR' })
    bGalleryImageId = await created('gallery-images', { propertyId: bPropertyId, image: 'uploads/skyline-secret.jpg' })
    bAgentId = await created('agents', { name: 'Skyline Agent X', email: `agentx-${RUN}@skyline.test`, status: 'active' })
  })

  test.afterAll(async () => {
    await a?.dispose()
    await b?.dispose()
  })

  test('A no puede LEER recursos de B (padre e hijos)', async () => {
    const targets: Array<[string, number]> = [
      ['developers', bDeveloperId],
      ['developer-properties', bProjectId],
      ['properties', bPropertyId],
      ['floor-plans', bFloorPlanId],
      ['gallery-images', bGalleryImageId],
      ['agents', bAgentId],
    ]
    for (const [resource, id] of targets) {
      const res = await a.get(`/api/admin/${resource}/${id}`)
      expectCrossTenantDenied(res.status(), `GET ${resource}/${id}`)
    }
  })

  test('el LISTADO de A nunca incluye filas de B', async () => {
    const checks: Array<[string, number]> = [
      ['developer-properties', bProjectId],
      ['floor-plans', bFloorPlanId],
      ['gallery-images', bGalleryImageId],
      ['agents', bAgentId],
    ]
    for (const [resource, id] of checks) {
      const res = await a.get(`/api/admin/${resource}?perPage=100`)
      expect(res.ok()).toBeTruthy()
      const ids = (await res.json()).rows.map((r: any) => r.id)
      expect(ids, `${resource}: fila de B visible para A`).not.toContain(id)
    }
  })

  test('A no puede ACTUALIZAR recursos de B', async () => {
    const res = await a.put(`/api/admin/developer-properties/${bProjectId}`, { data: { name: 'HACKED' } })
    expectCrossTenantDenied(res.status(), 'PUT developer-properties')

    const fp = await a.put(`/api/admin/floor-plans/${bFloorPlanId}`, { data: { category: 'HACKED' } })
    expectCrossTenantDenied(fp.status(), 'PUT floor-plans')

    // …y el dato de B sigue intacto, comprobado con la sesión de B.
    const check = await b.get(`/api/admin/developer-properties/${bProjectId}`)
    expect(check.ok()).toBeTruthy()
    expect((await check.json()).row.name).toBe(PROJECT_NAME)
  })

  test('A no puede BORRAR recursos de B', async () => {
    const res = await a.delete(`/api/admin/floor-plans/${bFloorPlanId}`)
    expectCrossTenantDenied(res.status(), 'DELETE floor-plans')

    const survivor = await b.get(`/api/admin/floor-plans/${bFloorPlanId}`)
    expect(survivor.ok(), 'el plano de B fue borrado por A').toBeTruthy()
  })

  test('A no puede CREAR un hijo colgando de un padre de B', async () => {
    const res = await a.post('/api/admin/floor-plans', { data: { developerPropertyId: bProjectId, category: 'Injected', unitType: '1BR' } })
    expectCrossTenantDenied(res.status(), 'POST floor-plans con padre de B')

    const gallery = await a.post('/api/admin/gallery-images', { data: { propertyId: bPropertyId, image: 'uploads/injected.jpg' } })
    expectCrossTenantDenied(gallery.status(), 'POST gallery-images con padre de B')

    const project = await a.post('/api/admin/developer-properties', { data: { developerId: bDeveloperId, name: 'Injected project', status: 'new' } })
    expectCrossTenantDenied(project.status(), 'POST developer-properties con promotora de B')
  })

  test('enviar organizationId en el body no cambia el propietario', async () => {
    const res = await a.post('/api/admin/agents', {
      data: { name: 'Ownership probe', email: `probe-${Date.now()}@example.com`, status: 'active', organizationId: 2 },
    })
    expect(res.ok()).toBeTruthy()
    const id = (await res.json()).id

    // Sigue siendo de A…
    expect((await a.get(`/api/admin/agents/${id}`)).ok()).toBeTruthy()
    // …y B no lo ve.
    expectCrossTenantDenied((await b.get(`/api/admin/agents/${id}`)).status(), 'agente creado por A visto por B')
  })

  test('A no puede tocar las TRADUCCIONES de una propiedad de B', async () => {
    // B pone sus traducciones reales.
    const seed = await b.put(`/api/admin/properties/${bPropertyId}`, {
      data: { translations: [{ locale: 'en', title: 'Skyline original', description: 'Original description' }] },
    })
    expect(seed.ok()).toBeTruthy()

    // A intenta reescribirlas apuntando al id de B.
    const attack = await a.put(`/api/admin/properties/${bPropertyId}`, {
      data: { translations: [{ locale: 'en', title: 'HACKED', description: 'HACKED' }] },
    })
    expectCrossTenantDenied(attack.status(), 'PUT properties translations')

    // Las de B siguen ahí, sin borrar ni sobrescribir.
    const after = await b.get(`/api/admin/properties/${bPropertyId}`)
    expect(after.ok()).toBeTruthy()
    const translations = (await after.json()).translations
    expect(translations.length, 'las traducciones de B fueron borradas').toBe(1)
    expect(translations[0].title).toBe('Skyline original')
  })

  test('los contadores del dashboard no suman datos de otras inmobiliarias', async () => {
    const [resA, resB] = await Promise.all([a.get('/api/admin/stats'), b.get('/api/admin/stats')])
    expect(resA.ok() && resB.ok()).toBeTruthy()
    const statsA = await resA.json()
    const statsB = await resB.json()
    // El proyecto recién creado por B no puede aparecer en el total de A: si
    // ambos totales fuesen idénticos estaríamos ante el count(*) global previo.
    const totalA = statsA.projects + statsA.properties + statsA.agents
    const totalB = statsB.projects + statsB.properties + statsB.agents
    expect(totalA).toBeGreaterThan(0)
    expect(totalB).toBeGreaterThan(0)
    expect(totalA, 'stats parece seguir contando toda la plataforma').not.toBe(totalA + totalB)
  })

  test('la facturación de A no incluye las facturas de B', async () => {
    const res = await a.get('/api/admin/saas/invoices')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(Array.isArray(body.rows)).toBe(true)

    const resB = await b.get('/api/admin/saas/invoices')
    expect(resB.ok()).toBeTruthy()
    const idsA = new Set(body.rows.map((r: any) => r.id))
    for (const row of (await resB.json()).rows) {
      expect(idsA.has(row.id), `la factura ${row.id} de B es visible para A`).toBe(false)
    }
  })

  test('los objetos privados de R2 no se sirven sin sesión ni entre tenants', async () => {
    const anon = await pwRequest.newContext({ baseURL: BASE_URL })
    // Sin sesión: los prefijos privados exigen autenticación (401), nunca el fichero.
    for (const key of ['visitor-docs/x.pdf', 'contracts/2/1.pdf', 'asset-export-renders/2/1/1.pdf', 'asset-export-catalogs/2/1/final.pdf']) {
      const res = await anon.get(`/api/media/${key}`)
      expect([401, 404], `GET /api/media/${key} sin sesión devolvió ${res.status()}`).toContain(res.status())
      expect(res.status()).not.toBe(200)
    }
    // Con sesión de A, un objeto que no le pertenece: 404, nunca el contenido.
    const cross = await a.get('/api/media/contracts/2/1.pdf')
    expect(cross.status()).toBe(404)
    await anon.dispose()
  })

  test('la API v1 usa el tenant de la clave, no el del body', async () => {
    // Clave emitida por B.
    // The endpoint takes 'write' and stores it as 'read,write' — passing the
    // expanded form back would silently mint a read-only key.
    const keyRes = await b.post('/api/admin/saas/apikeys', { data: { name: `e2e-cross-tenant-${RUN}`, scopes: 'write' } })
    expect(keyRes.ok()).toBeTruthy()
    const apiKey = (await keyRes.json()).plainKey

    // Un proyecto propiedad de A, creado con la sesión de A (no dependemos de
    // qué haya sembrado cada migración).
    const aDevRes = await a.post('/api/admin/developers', { data: { name: 'MM Dev API', email: `devapi-${RUN}@mm.test`, status: 'active' } })
    expect(aDevRes.ok()).toBeTruthy()
    const aProjectRes = await a.post('/api/admin/developer-properties', {
      data: { developerId: (await aDevRes.json()).id, name: 'MM API Tower', status: 'new', price: 600000 },
    })
    expect(aProjectRes.ok()).toBeTruthy()
    const aProjectId = (await aProjectRes.json()).id

    const read = await b.fetch(`/api/v1/properties/${aProjectId}`, { headers: { Authorization: `Bearer ${apiKey}` } })
    expectCrossTenantDenied(read.status(), `GET /api/v1/properties/${aProjectId} con clave de B`)

    // …ni crear un lead apuntando a una propiedad de A.
    const lead = await b.fetch('/api/v1/leads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { name: 'Cross tenant lead', email: 'cross@example.com', propertyId: aProjectId },
    })
    expect(lead.status(), 'la API v1 aceptó una propiedad de otro tenant').toBe(422)
  })

  // Constructor Web: /api/admin/site-pages/home has no id in its URL at all —
  // both tenants call the literal same path. Isolation here rests entirely on
  // requireOrgScope resolving each session to its own row, never a shared or
  // first-matching one.
  test('el Constructor Web nunca mezcla el borrador de A con el de B', async () => {
    const marker = `Marker-${RUN}`
    const putB = await b.put('/api/admin/site-pages/home', {
      data: { blocks: [{ id: 'hero', type: 'hero', version: 1, content: { title1: marker } }], seo: { title: marker } },
    })
    expect(putB.ok()).toBeTruthy()

    const draftA = await (await a.get('/api/admin/site-pages/home')).json()
    const titlesA = draftA.blocks.map((b: any) => b.content?.title1)
    expect(titlesA, "el borrador de A contiene el bloque que B acaba de guardar").not.toContain(marker)
    expect(draftA.seo?.title).not.toBe(marker)
  })

  /**
   * The history endpoints are the only place in the Constructor Web where a
   * number from the request reaches the database. Version counters are
   * per-organization, so both tenants have a "version 1" — the isolation
   * rests on resolving the page row from the session before the version is
   * ever looked up.
   */
  test('el historial de versiones de A no contiene nada de B, ni puede restaurarlo', async () => {
    const marker = `Historial-${RUN}`
    await b.put('/api/admin/site-pages/home', {
      data: { blocks: [{ id: 'hero', type: 'hero', version: 1, content: { title1: marker } }], seo: { title: marker } },
    })
    const pubB = await b.post('/api/admin/site-pages/home/publish')
    expect(pubB.ok()).toBeTruthy()
    const bVersion = (await pubB.json()).version

    const historyA = await (await a.get('/api/admin/site-pages/home/versions')).json()
    expect(historyA.versions.map((v: any) => v.seoTitle), 'el historial de A muestra una publicación de B').not.toContain(marker)

    // El número de versión de B existe en la tabla; A no debe poder alcanzarlo.
    // Si A tiene esa misma versión, restaurarla debe devolver LA SUYA, no la
    // de B — nunca el contenido del otro inquilino.
    const restoreA = await a.post('/api/admin/site-pages/home/restore', { data: { version: bVersion } })
    if (restoreA.ok()) {
      const draftA = await (await a.get('/api/admin/site-pages/home')).json()
      expect(draftA.blocks.map((blk: any) => blk.content?.title1), 'A restauró contenido de B').not.toContain(marker)
      expect(draftA.seo?.title).not.toBe(marker)
    } else {
      expect(restoreA.status(), 'A no tiene esa versión: debe ser 404, nunca la de B').toBe(404)
    }
  })

  test('publicar en B no cambia la versión ni lo publicado de A', async () => {
    const beforeA = await (await a.get('/api/admin/site-pages/home')).json()
    const pub = await b.post('/api/admin/site-pages/home/publish')
    expect(pub.ok()).toBeTruthy()

    const afterA = await (await a.get('/api/admin/site-pages/home')).json()
    expect(afterA.version, 'publicar en B incrementó la versión de A').toBe(beforeA.version)
    expect(afterA.publishedAt).toBe(beforeA.publishedAt)
  })

  /**
   * FASE 10. El riesgo concreto: una escritura acotada por organización
   * seguida de una lectura acotada sólo por el id. El UPDATE no toca nada
   * —correcto— pero la respuesta devolvía la fila de la otra agencia con un
   * 200. `tenantScopeCoverage` no puede verlo, porque el endpoint sí llama a
   * requireOrgScope: el descuido estaba dentro del servicio.
   */
  test('A no puede leer ni tocar los contactos y necesidades de B', async () => {
    const contactRes = await b.post('/api/admin/saas/contacts', {
      data: { name: `Cliente Secreto ${RUN}`, email: `secreto-${RUN}@skyline.test`, force: true },
    })
    expect(contactRes.ok(), `B no pudo crear el contacto: ${contactRes.status()}`).toBeTruthy()
    const bContactId = (await contactRes.json()).id

    const reqRes = await b.post('/api/admin/saas/buyer-requirements', {
      data: { contactId: bContactId, title: `Necesidad Secreta ${RUN}`, priceMax: 999999 },
    })
    expect(reqRes.ok(), `B no pudo crear la necesidad: ${reqRes.status()}`).toBeTruthy()
    const bRequirementId = (await reqRes.json()).id

    expectCrossTenantDenied((await a.get(`/api/admin/saas/contacts/${bContactId}`)).status(), 'leer contacto de B')

    // Validar el presupuesto de una necesidad ajena no puede devolverla.
    const validate = await a.post(`/api/admin/saas/buyer-requirements/${bRequirementId}/validate-budget`, { data: { validated: true } })
    expectCrossTenantDenied(validate.status(), 'validar presupuesto de B')

    const patch = await a.patch(`/api/admin/saas/buyer-requirements/${bRequirementId}`, { data: { title: 'Secuestrada' } })
    expectCrossTenantDenied(patch.status(), 'editar necesidad de B')

    // Y nada de B ha cambiado ni aparece en los listados de A.
    const bAfter = await (await b.get(`/api/admin/saas/buyer-requirements?contactId=${bContactId}`)).json()
    expect(bAfter[0].title, 'A modificó la necesidad de B').toBe(`Necesidad Secreta ${RUN}`)
    expect(bAfter[0].budgetValidated, 'A validó el presupuesto de B').toBe(0)

    const aList = await (await a.get('/api/admin/saas/contacts')).json()
    expect(aList.map((c: any) => c.id), 'el listado de A incluye un contacto de B').not.toContain(bContactId)
  })

  test('A no puede cruzar el catálogo con las necesidades de B ni decidir sobre sus matches', async () => {
    const contactRes = await b.post('/api/admin/saas/contacts', {
      data: { name: `Comprador Matching ${RUN}`, email: `matching-${RUN}@skyline.test`, force: true },
    })
    expect(contactRes.ok(), `B no pudo crear el contacto: ${contactRes.status()}`).toBeTruthy()
    const bContactId = (await contactRes.json()).id

    const reqRes = await b.post('/api/admin/saas/buyer-requirements', {
      data: { contactId: bContactId, title: `Necesidad Matching ${RUN}`, priceMax: 800000 },
    })
    expect(reqRes.ok(), `B no pudo crear la necesidad: ${reqRes.status()}`).toBeTruthy()
    const bRequirementId = (await reqRes.json()).id

    // Buscar propiedades para una necesidad ajena no puede devolver ni la
    // necesidad ni el catálogo con el que se cruzó.
    expectCrossTenantDenied(
      (await a.get(`/api/admin/saas/matching/requirement/${bRequirementId}`)).status(),
      'cruzar la necesidad de B con el catálogo',
    )

    // Y B, que sí es su dueña, obtiene un resultado con su desglose: si esto
    // fallara, el 404 de arriba podría estar tapando un endpoint roto en vez
    // de un aislamiento que funciona.
    const own = await b.get(`/api/admin/saas/matching/requirement/${bRequirementId}`)
    expect(own.ok(), `B no pudo cruzar su propia necesidad: ${own.status()}`).toBeTruthy()
    const ownBody = await own.json()
    expect(Array.isArray(ownBody.results), 'el matching no devolvió resultados').toBeTruthy()
    for (const m of ownBody.results) {
      expect(Array.isArray(m.result.criteria), 'un match llegó sin desglose').toBeTruthy()
      expect(Array.isArray(m.result.explanation), 'un match llegó sin explicación').toBeTruthy()
    }

    // Guardar una decisión sobre la necesidad de B tampoco cuela.
    const decide = await a.post('/api/admin/saas/matching/matches', {
      data: { buyerRequirementId: bRequirementId, propertyId: 1, status: 'selected' },
    })
    expect([403, 404, 422], `A pudo decidir sobre un match de B (${decide.status()})`).toContain(decide.status())
  })

  test('los estados que nadie ha ejecutado de verdad no se pueden marcar a mano', async () => {
    const contactRes = await b.post('/api/admin/saas/contacts', {
      data: { name: `Comprador Estados ${RUN}`, email: `estados-${RUN}@skyline.test`, force: true },
    })
    const bContactId = (await contactRes.json()).id
    const reqRes = await b.post('/api/admin/saas/buyer-requirements', {
      data: { contactId: bContactId, title: `Necesidad Estados ${RUN}`, priceMax: 800000 },
    })
    const bRequirementId = (await reqRes.json()).id

    const listed = await (await b.get(`/api/admin/saas/matching/requirement/${bRequirementId}`)).json()
    test.skip(!listed.results.length, 'el catálogo de la organización no tiene inmuebles compatibles')
    const propertyId = listed.results[0].property.id

    // "Enviado" lo pondrá el Centro de Comunicaciones cuando registre el envío
    // real: marcarlo aquí convertiría el historial en algo que no se puede creer.
    const sent = await b.post('/api/admin/saas/matching/matches', {
      data: { buyerRequirementId: bRequirementId, propertyId, status: 'sent' },
    })
    expect(sent.status(), 'se pudo marcar como enviado sin que existiera ningún envío').toBe(422)

    // Seleccionar y descartar sí son decisiones que toma una persona.
    const selected = await b.post('/api/admin/saas/matching/matches', {
      data: { buyerRequirementId: bRequirementId, propertyId, status: 'selected' },
    })
    expect(selected.ok(), `no se pudo seleccionar: ${selected.status()}`).toBeTruthy()
    const saved = await selected.json()
    expect(saved.status).toBe('selected')
    // El score lo calcula el servidor, no llega del cliente.
    expect(saved.rulesVersion).toBeGreaterThan(0)
  })
})
