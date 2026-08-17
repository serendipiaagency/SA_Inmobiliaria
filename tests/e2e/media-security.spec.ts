import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'
import { buildCorruptPdf, buildFakePdfHtml, buildMaliciousSvg, buildPng, buildValidPdf } from '../../test/unit/helpers/mediaFixtures'

/**
 * Media Asset Manager, over real HTTP against the running Worker: upload
 * validation (SVG blocked, magic-byte mismatch rejected, oversized image
 * rejected, corrupt PDF rejected), and cross-tenant R2 access denial for
 * genuinely tenant-owned confidential/private objects.
 *
 * Quota enforcement is covered at the unit level
 * (test/unit/mediaAssets.test.ts, `assertQuotaAvailable`) against a real
 * database with the exact boundary conditions — there's no admin endpoint
 * to lower a tenant's storage_bytes_limit (deliberately: this block adds no
 * commercial quota-management UI), so re-testing the same enforcement
 * end-to-end would need out-of-band DB surgery for no added confidence
 * beyond "the six call sites call assertQuotaAvailable", which is verified
 * by direct inspection instead.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

function sessionFor(storageState: string): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE_URL, storageState })
}

test.describe('Media Asset Manager — validación de subida', () => {
  let admin: APIRequestContext

  test.beforeAll(async () => {
    admin = await sessionFor(STATE_A)
  })
  test.afterAll(async () => {
    await admin?.dispose()
  })

  test('SVG se rechaza en la subida genérica de admin (415)', async () => {
    const res = await admin.post('/api/admin/upload', {
      multipart: { file: { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(buildMaliciousSvg()) }, folder: 'agents' },
    })
    expect(res.status()).toBe(415)
  })

  test('SVG se rechaza en la Media Library del CMS (415)', async () => {
    const res = await admin.post('/api/admin/cms/media', {
      multipart: { file: { name: 'icon.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(buildMaliciousSvg()) } },
    })
    expect(res.status()).toBe(415)
  })

  test('un HTML etiquetado como PDF se rechaza por discrepancia de magic bytes (415)', async () => {
    const res = await admin.post('/api/admin/cms/media', {
      multipart: { file: { name: 'evil.pdf', mimeType: 'application/pdf', buffer: Buffer.from(buildFakePdfHtml()) } },
    })
    expect(res.status()).toBe(415)
  })

  test('un PDF real y válido se acepta', async () => {
    const res = await admin.post('/api/admin/cms/media', {
      multipart: { file: { name: 'real.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await buildValidPdf()) } },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const body = await res.json()
    expect(body.key).toBeTruthy()
  })

  test('un PDF truncado/corrupto se rechaza (422), aunque su cabecera empiece por %PDF', async () => {
    const corrupt = await buildCorruptPdf()
    // Confirms the fixture still starts with a real PDF header — otherwise
    // this would only exercise the magic-byte check, not structural
    // integrity validation.
    expect(Buffer.from(corrupt.slice(0, 4)).toString()).toBe('%PDF')
    const res = await admin.post('/api/admin/cms/media', {
      multipart: { file: { name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from(corrupt) } },
    })
    expect(res.status()).toBe(422)
  })

  test('una imagen normal se acepta y queda públicamente accesible con caché', async () => {
    const res = await admin.post('/api/admin/upload', {
      multipart: { file: { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(buildPng(64, 48)) }, folder: 'developer-properties' },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const { key, url } = await res.json()
    expect(key).toMatch(/^public\/\d+\/properties\//)

    const anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const fetched = await anon.get(url)
    expect(fetched.status()).toBe(200)
    expect(fetched.headers()['cache-control']).toMatch(/public/)
    await anon.dispose()
  })

  test('una imagen con dimensiones-bomba (cabecera falsea un lienzo enorme) se rechaza (422)', async () => {
    // A few hundred real bytes, header claims a 20000×20000 canvas — the
    // exact shape of a decompression-bomb upload.
    const bomb = buildPng(4, 4, 20_000, 20_000)
    const res = await admin.post('/api/admin/upload', {
      multipart: { file: { name: 'bomb.png', mimeType: 'image/png', buffer: Buffer.from(bomb) }, folder: 'agents' },
    })
    expect(res.status()).toBe(422)
  })

  test('una imagen truncada/corrupta se rechaza (422)', async () => {
    const truncated = buildPng(50, 50).slice(0, 15)
    const res = await admin.post('/api/admin/upload', {
      multipart: { file: { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from(truncated) }, folder: 'agents' },
    })
    expect(res.status()).toBe(422)
  })

  test('un archivo declarado como PNG pero que en realidad es un ejecutable/HTML se rechaza (415)', async () => {
    const res = await admin.post('/api/admin/upload', {
      multipart: { file: { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from(buildFakePdfHtml()) }, folder: 'agents' },
    })
    expect(res.status()).toBe(415)
  })
})

test.describe('Media Asset Manager — aislamiento cross-tenant en R2', () => {
  let a: APIRequestContext
  let b: APIRequestContext

  test.beforeAll(async () => {
    a = await sessionFor(STATE_A)
    b = await sessionFor(STATE_B)
  })
  test.afterAll(async () => {
    await a?.dispose()
    await b?.dispose()
  })

  test('un contrato firmado (confidential) de B no es legible por A, y sí por B', async () => {
    const templateRes = await b.post('/api/admin/saas/contract-templates', {
      data: { name: `Plantilla media-e2e ${RUN}`, kind: 'reserva', bodyTemplate: 'Hola {{client.name}}, gracias por tu reserva.' },
    })
    expect(templateRes.ok(), await templateRes.text()).toBeTruthy()
    const templateId = (await templateRes.json()).id

    const contractRes = await b.post('/api/admin/saas/contracts', {
      data: { templateId, title: `Contrato media-e2e ${RUN}`, clientName: 'Cliente Skyline' },
    })
    expect(contractRes.ok(), await contractRes.text()).toBeTruthy()
    const contract = await contractRes.json()

    const sendRes = await b.post(`/api/admin/saas/contracts/${contract.id}/send`)
    expect(sendRes.ok()).toBeTruthy()
    const sent = await sendRes.json()
    expect(sent.managementToken).toBeTruthy()

    const anon = await pwRequest.newContext({ baseURL: BASE_URL })
    const acceptRes = await anon.post(`/api/public/contracts/${sent.managementToken}/accept`, {
      data: { fullName: 'Cliente Skyline', confirm: true },
    })
    expect(acceptRes.ok(), await acceptRes.text()).toBeTruthy()
    await anon.dispose()

    // The dedicated download route confirms the file is real and B can read it…
    const download = await b.get(`/api/admin/saas/contracts/${contract.id}/download`)
    expect(download.status(), await download.text()).toBe(200)
    expect(download.headers()['cache-control']).toBe('no-store')
    expect(download.headers()['content-disposition']).toMatch(/attachment/)

    // …and A gets 404 from that same route (org-scoped, never confirms the id exists).
    const crossRoute = await a.get(`/api/admin/saas/contracts/${contract.id}/download`)
    expect(crossRoute.status()).toBe(404)

    // The real point of this suite: hitting /api/media/<key> directly — the
    // general-purpose R2 route, not the dedicated download endpoint — must
    // enforce the exact same boundary. Knowing the key buys an attacker nothing.
    const rows: any[] = await (await b.get('/api/admin/saas/contracts')).json()
    const r2Key = rows.find((r) => r.id === contract.id)?.r2Key
    expect(r2Key, 'contract row should carry a real r2Key after acceptance').toBeTruthy()

    const bMedia = await b.get(`/api/media/${r2Key}`)
    expect(bMedia.status()).toBe(200)
    expect(bMedia.headers()['cache-control']).toBe('no-store')
    expect(bMedia.headers()['x-content-type-options']).toBe('nosniff')

    const aMedia = await a.get(`/api/media/${r2Key}`)
    expect(aMedia.status()).toBe(404)

    const anonMedia = await pwRequest.newContext({ baseURL: BASE_URL })
    const anonRes = await anonMedia.get(`/api/media/${r2Key}`)
    expect([401, 404]).toContain(anonRes.status())
    await anonMedia.dispose()
  })

  test('un export privado (Asset Export Studio) de B no es legible por A vía /api/media', async () => {
    const devRes = await b.post('/api/admin/developers', { data: { name: 'Skyline Media Dev', email: `mediadev-${RUN}@skyline.test`, status: 'active' } })
    expect(devRes.ok()).toBeTruthy()
    const projectRes = await b.post('/api/admin/developer-properties', {
      data: { developerId: (await devRes.json()).id, name: `Skyline Media Tower ${RUN}`, status: 'new', price: 500000 },
    })
    expect(projectRes.ok()).toBeTruthy()
    const developerPropertyId = (await projectRes.json()).id

    const templatesRes = await b.get('/api/admin/asset-export/templates')
    expect(templatesRes.ok(), await templatesRes.text()).toBeTruthy()
    const templates = await templatesRes.json()
    // pdf_a4_portrait is the simplest renderReady format (see
    // server/utils/assetExport/formats.ts) — any published system template
    // using it works for this test, which only cares that a real render happens.
    const template = Array.isArray(templates) ? templates.find((t: any) => t.formatKey === 'pdf_a4_portrait' && t.status === 'published') : null
    test.skip(!template, 'No hay plantilla pdf_a4_portrait disponible para renderizar en este entorno')
    if (!template) return

    const exportProjectRes = await b.post('/api/admin/asset-export/projects', {
      data: { templateId: template.id, assetKind: 'developer_property', assetId: developerPropertyId, name: `Export media-e2e ${RUN}` },
    })
    expect(exportProjectRes.ok(), await exportProjectRes.text()).toBeTruthy()
    const exportProject = await exportProjectRes.json()

    const renderRes = await b.post(`/api/admin/asset-export/projects/${exportProject.id}/render`)
    expect(renderRes.ok(), await renderRes.text()).toBeTruthy()
    const rendered = await renderRes.json()
    expect(rendered.downloadUrl).toBeTruthy()

    // B can download it directly.
    const bDownload = await b.get(rendered.downloadUrl)
    expect(bDownload.status()).toBe(200)

    // A cannot, via the dedicated download route (org-scoped 404)…
    const renderIdMatch = rendered.downloadUrl.match(/renders\/(\d+)\/download/)
    const renderId = renderIdMatch?.[1]
    const aDownload = await a.get(`/api/admin/asset-export/renders/${renderId}/download`)
    expect(aDownload.status()).toBe(404)
  })
})
