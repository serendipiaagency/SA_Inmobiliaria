import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'
import { buildFakePdfHtml, buildPng, buildValidPdf } from '../../test/unit/helpers/mediaFixtures'

/**
 * Núcleo inmobiliario, bloque N7a (FASES 6, 7, 25 y 26):
 *  - documentos de propiedad con permisos por rol: subir (validado), editar,
 *    conceder/revocar, descargar como equipo / propietario («Mi cuenta») /
 *    público, papelera y otra agencia → 404;
 *  - multimedia: metadatos por foto, ocultar, varios vídeos, el 360 público
 *    sólo con un tour/360 real y borrar una foto sin huérfanos;
 *  - resumen de la ficha y estado de publicación por canal;
 *  - la ficha pública proyectada con publicFields.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
// Los pasos del editor se dibujan dos veces (columna y tira móvil): sólo cuenta el visible.
const visible = (page: import('@playwright/test').Page, testId: string) => page.locator(`[data-testid="${testId}"]:visible`).first()
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test.describe('N7a — documentos, multimedia, resumen y portales', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let b: APIRequestContext
  let anon: APIRequestContext
  let projectId: number
  let projectSlug: string
  const cleanup: Array<() => Promise<unknown>> = []

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    // Sin sesión de verdad: dentro de un describe con `test.use({ storageState })`,
    // Playwright copia esa sesión a los contextos de `request.newContext()`.
    anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } })
    const devs = await (await a.get('/api/admin/developers', { params: { perPage: '1' } })).json()
    const created = await a.post('/api/admin/developer-properties', { data: { developerId: devs.rows[0].id, name: `N7a Torre ${RUN}`, status: 'new', price: 410000, area: 95, city: 'Valencia', country: 'España' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    projectId = (await created.json()).id
    projectSlug = (await (await a.get(`/api/admin/developer-properties/${projectId}`)).json()).row.slug
    cleanup.push(() => a.delete(`/api/admin/developer-properties/${projectId}?hard=1`))
  })

  test.afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => null)
    await a?.dispose()
    await b?.dispose()
    await anon?.dispose()
  })

  async function upload(fields: Record<string, string>, file?: { name: string; mimeType: string; buffer: Buffer }) {
    return a.post('/api/admin/property-documents/private-upload', {
      multipart: {
        file: file ?? { name: 'escritura.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await buildValidPdf()) },
        propertyKind: 'developer',
        propertyId: String(projectId),
        docType: 'deed',
        title: `Escritura ${RUN}`,
        ...fields,
      },
    })
  }

  test('documentos: subida validada, descarga del equipo, otra agencia 404, papelera 404 y restaurar', async () => {
    expect((await upload({}, { name: 'falso.pdf', mimeType: 'application/pdf', buffer: Buffer.from(buildFakePdfHtml()) })).status()).toBe(415)
    expect((await upload({ docType: 'pasaporte' })).status()).toBe(422)
    // Un JSON sin fichero no es un alta.
    expect((await a.post('/api/admin/property-documents', { data: { propertyKind: 'developer', propertyId: projectId, docType: 'deed', title: 'X' } })).status()).toBe(422)

    const res = await upload({ visibility: 'internal', issuedAt: '2025-01-01', expiresAt: '2020-01-01' })
    expect(res.status()).toBe(422) // caducidad anterior a la emisión
    const ok = await upload({ visibility: 'internal', expiresAt: '2020-12-31' })
    expect(ok.ok(), await ok.text()).toBeTruthy()
    const { id, document } = await ok.json()
    expect(document).toMatchObject({ visibility: 'internal', expiryState: 'expired' })

    // El equipo descarga; otra agencia ni lista, ni lee, ni descarga (404, nunca 403).
    const download = await a.get(document.downloadUrl)
    expect(download.status()).toBe(200)
    expect(download.headers()['content-disposition']).toContain('attachment')
    expect((await b.get(document.downloadUrl)).status()).toBe(404)
    expect((await b.get(`/api/admin/property-documents/${id}`)).status()).toBe(404)
    expect((await anon.get(document.downloadUrl)).status()).toBe(404)
    const listB = await (await b.get('/api/admin/property-documents', { params: { propertyKind: 'developer', propertyId: String(projectId) } })).json()
    expect(listB.rows).toEqual([])

    // Editar metadatos.
    expect((await a.put(`/api/admin/property-documents/${id}`, { data: { title: `Escritura revisada ${RUN}`, expiresAt: '2040-01-01' } })).ok()).toBeTruthy()
    expect((await a.put(`/api/admin/property-documents/${id}`, { data: { propertyId: projectId + 1 } })).status()).toBe(422)

    // Papelera: deja de servirse; restaurar lo devuelve.
    expect((await a.delete(`/api/admin/property-documents/${id}`)).ok()).toBeTruthy()
    expect((await a.get(document.downloadUrl)).status()).toBe(404)
    const trash = await (await a.get('/api/admin/property-documents', { params: { propertyKind: 'developer', propertyId: String(projectId), trashed: '1' } })).json()
    expect(trash.rows.map((r: any) => r.id)).toContain(id)
    expect((await a.post(`/api/admin/property-documents/${id}/restore`)).ok()).toBeTruthy()
    expect((await a.get(document.downloadUrl)).status()).toBe(200)
  })

  test('documentos: conceder y revocar; el propietario y el comprador descargan desde «Mi cuenta»', async () => {
    const ownerEmail = `n7a-owner-${RUN}@example.com`
    const owner = await (await a.post('/api/admin/contacts', { data: { name: `Propietaria N7a ${RUN}`, email: ownerEmail, force: true } })).json()
    const buyer = await (await a.post('/api/admin/contacts', { data: { name: `Comprador N7a ${RUN}`, email: `n7a-buyer-${RUN}@example.com`, force: true } })).json()
    const foreign = await (await b.post('/api/admin/contacts', { data: { name: `Ajeno N7a ${RUN}`, email: `n7a-foreign-${RUN}@example.com`, force: true } })).json()
    expect((await a.post('/api/admin/property-contacts', { data: { propertyKind: 'developer', propertyId: projectId, contactId: owner.id, role: 'owner' } })).ok()).toBeTruthy()

    const ownerDoc = (await (await upload({ visibility: 'owner', title: `Nota simple ${RUN}`, docType: 'land_registry_note' })).json()).document
    const buyerDoc = (await (await upload({ visibility: 'authorized_buyer', title: `Planos ${RUN}`, docType: 'plans' })).json()).document

    // Conceder: contacto ajeno 404; propio, ok (dos veces no duplica).
    expect((await a.put(`/api/admin/property-documents/${buyerDoc.id}`, { data: { action: 'grant', contactId: foreign.id } })).status()).toBe(404)
    expect((await a.put(`/api/admin/property-documents/${buyerDoc.id}`, { data: { action: 'grant', contactId: buyer.id } })).ok()).toBeTruthy()
    expect((await (await a.put(`/api/admin/property-documents/${buyerDoc.id}`, { data: { action: 'grant', contactId: buyer.id } })).json()).alreadyGranted).toBe(true)
    const detail = await (await a.get(`/api/admin/property-documents/${buyerDoc.id}`)).json()
    expect(detail.row.grants.map((g: any) => g.contactId)).toEqual([buyer.id])

    // La ficha del contacto dice qué ve y por qué.
    const ownerCard = await (await a.get(`/api/admin/saas/contacts/${owner.id}`)).json()
    const ownerDocs = Object.fromEntries(ownerCard.documents.map((d: any) => [d.id, d]))
    expect(ownerDocs[ownerDoc.id]).toMatchObject({ accessVia: 'owner' })
    const buyerCard = await (await a.get(`/api/admin/saas/contacts/${buyer.id}`)).json()
    expect(buyerCard.documents.map((d: any) => d.id)).toEqual([buyerDoc.id])

    // «Mi cuenta»: una cuenta de cliente con el mismo email que la propietaria.
    const password = `N7a-${RUN}-Pass!`
    const user = await a.post('/api/admin/users', { data: { name: 'Propietaria N7a', email: ownerEmail, password, role: 'user' } })
    expect(user.ok(), await user.text()).toBeTruthy()
    cleanup.push(async () => a.delete(`/api/admin/users/${(await user.json()).id}`))
    const client = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } })
    try {
      // Su propia IP de pruebas (TEST-NET-2): el login está limitado por IP y
      // toda la suite sale de la misma dirección (ver tests/e2e/empresas.spec.ts).
      const login = await client.post('/api/auth/login', { data: { email: ownerEmail, password }, headers: { 'cf-connecting-ip': `198.51.100.${(Date.now() % 200) + 30}` } })
      expect(login.ok(), await login.text()).toBeTruthy()
      const dash = await (await client.get('/api/client/dashboard')).json()
      const titles = dash.documents.map((d: any) => d.title)
      expect(titles).toEqual(expect.arrayContaining([ownerDoc.title, buyerDoc.title]))
      expect(dash.documents[0]).not.toHaveProperty('propertyReference')
      expect((await client.get(ownerDoc.downloadUrl)).status()).toBe(200)
      // Un documento interno de la misma propiedad, no.
      const internalDoc = (await (await upload({ visibility: 'internal', title: `Interno ${RUN}` })).json()).document
      expect((await client.get(internalDoc.downloadUrl)).status()).toBe(404)
    } finally {
      await client.dispose()
    }

    // Revocar.
    expect((await a.put(`/api/admin/property-documents/${buyerDoc.id}`, { data: { action: 'revoke', contactId: buyer.id } })).ok()).toBeTruthy()
    expect((await (await a.get(`/api/admin/saas/contacts/${buyer.id}`)).json()).documents).toEqual([])
  })

  test('documento público: sólo en la web con la propiedad publicada', async () => {
    const doc = (await (await upload({ visibility: 'public', title: `Memoria de calidades ${RUN}`, docType: 'other' })).json()).document
    expect((await anon.get(doc.downloadUrl)).status()).toBe(404)
    let pub = await (await anon.get(`/api/public/properties/${projectSlug}`)).json()
    expect(pub.documents ?? []).toEqual([])
    expect((await a.put(`/api/admin/developer-properties/${projectId}`, { data: { publishedAt: '2026-10-01 10:00:00', description: 'Promoción', coverImage: 'public/1/properties/n7a.jpg' } })).ok()).toBeTruthy()
    pub = await (await anon.get(`/api/public/properties/${projectSlug}`)).json()
    expect(pub.documents.map((d: any) => d.title)).toContain(doc.title)
    expect(pub.documents[0]).not.toHaveProperty('r2Key')
    expect((await anon.get(doc.downloadUrl)).status()).toBe(200)
    // La proyección pública (publicFields) no expone lo interno del registro.
    for (const k of ['developerId', 'locationPrivacy', 'reference', 'createdBy']) expect(pub.project).not.toHaveProperty(k)
  })

  test('multimedia: metadatos por foto, ocultar, varios vídeos, 360 sólo real y borrar sin huérfanos', async () => {
    const photo = await a.post('/api/admin/upload', { multipart: { file: { name: 'salon.png', mimeType: 'image/png', buffer: Buffer.from(buildPng(64, 48)) }, folder: 'project-images' } })
    const key = (await photo.json()).key
    const img = await (await a.post('/api/admin/project-images', { data: { developerPropertyId: projectId, image: key, sortOrder: 0 } })).json()
    expect((await a.put(`/api/admin/project-images/${img.id}`, { data: { title: 'Salón', alt: 'Salón con luz natural', language: 'es' } })).ok()).toBeTruthy()
    expect((await a.put(`/api/admin/project-images/${img.id}`, { data: { language: 'klingon' } })).status()).toBe(422)
    const listed = await (await a.get('/api/admin/project-images', { params: { developerPropertyId: String(projectId) } })).json()
    expect(listed.rows.find((r: any) => r.id === img.id)).toMatchObject({ alt: 'Salón con luz natural', isHidden: 0 })

    let pub = await (await anon.get(`/api/public/properties/${projectSlug}`)).json()
    expect(pub.gallery.map((g: any) => g.image)).toContain(key)
    // Oculta: fuera de la web.
    expect((await a.put(`/api/admin/project-images/${img.id}`, { data: { isHidden: 1 } })).ok()).toBeTruthy()
    pub = await (await anon.get(`/api/public/properties/${projectSlug}`)).json()
    expect(pub.gallery.map((g: any) => g.image)).not.toContain(key)
    // Privada: además su fichero deja de servirse sin sesión.
    expect((await a.put(`/api/admin/project-images/${img.id}`, { data: { isHidden: 0, isPrivate: 1 } })).ok()).toBeTruthy()
    expect((await anon.get(`/api/media/${key}`)).status()).toBe(401)
    expect((await a.get(`/api/media/${key}`)).status()).toBe(200)

    // Varios vídeos; el 360 público no aparece sin un tour o una foto 360 reales.
    for (const url of ['https://youtu.be/n7a-uno', 'https://youtu.be/n7a-dos']) {
      expect((await a.post('/api/admin/property-media', { data: { propertyKind: 'developer', propertyId: projectId, mediaType: 'video', url } })).ok()).toBeTruthy()
    }
    expect((await a.post('/api/admin/property-media', { data: { propertyKind: 'developer', propertyId: projectId, mediaType: 'virtual_tour', url: 'http://inseguro.example' } })).status()).toBe(422)
    pub = await (await anon.get(`/api/public/properties/${projectSlug}`)).json()
    expect(pub.media.filter((m: any) => m.mediaType === 'video')).toHaveLength(2)
    expect(pub.media.some((m: any) => m.mediaType === 'virtual_tour' || m.mediaType === 'pano360')).toBe(false)

    // Otra agencia no ve ni toca la multimedia.
    const mediaRows = await (await a.get('/api/admin/property-media', { params: { propertyKind: 'developer', propertyId: String(projectId) } })).json()
    expect((await b.put(`/api/admin/property-media/${mediaRows.rows[0].id}`, { data: { isHidden: 1 } })).status()).toBe(404)

    // Borrar la foto: su fichero ya no se sirve (media_assets borrado; el cron lo quita de R2).
    expect((await a.delete(`/api/admin/project-images/${img.id}`)).ok()).toBeTruthy()
    expect((await a.get(`/api/media/${key}`)).status()).toBe(404)
  })

  test('resumen de la ficha, portales y defaults', async () => {
    const summary = (await (await a.get(`/api/admin/developer-properties/${projectId}`, { params: { view: 'summary' } })).json()).summary
    expect(summary).toMatchObject({ id: projectId, kind: 'developer' })
    expect(summary.channels.web.state).toMatch(/published|visible/)
    expect(summary.channels.portals.length).toBeGreaterThan(5)
    expect(summary.channels.portals.every((p: any) => p.implemented === false)).toBe(true)
    expect(summary.documents.total).toBeGreaterThan(0)
    expect((await b.get(`/api/admin/developer-properties/${projectId}`, { params: { view: 'summary' } })).status()).toBe(404)
    const defaults = (await (await a.get('/api/admin/properties', { params: { view: 'defaults' } })).json()).defaults
    expect(defaults).toMatchObject({ transactionType: 'sale', locationPrivacy: 'exact' })
  })

  test('el editor muestra el resumen y los pasos Documentos y Portales en los dos catálogos', async ({ page }) => {
    const props = await (await a.get('/api/admin/properties', { params: { perPage: '1' } })).json()
    const targets = [`/admin/developer-properties/${projectId}`, ...(props.rows[0] ? [`/admin/properties/${props.rows[0].id}`] : [])]
    for (const url of targets) {
      await page.goto(url)
      await expect(visible(page, 'property-summary')).toBeVisible()
      await visible(page, 'property-editor-step-documents').click()
      await expect(visible(page, 'property-documents')).toBeVisible()
      await visible(page, 'property-editor-step-portals').click()
      await expect(visible(page, 'property-portals-web')).toBeVisible()
    }
  })
})
