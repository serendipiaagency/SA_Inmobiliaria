import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * The Constructor Web's two load-bearing guarantees, proved over real HTTP
 * against the running Worker (the unit suite — sitePages.crossTenant.test.ts
 * — proves the same isolation at the DB layer):
 *
 *  1. Draft/Publish separation: editing a page never changes what the public
 *     site serves until Publish is called explicitly.
 *  2. Live data, never a snapshot: a Properties block's content only stores
 *     selection criteria (dynamicFilter/limit), so editing a property through
 *     "Propiedades (web)" must show up on the published landing immediately —
 *     no re-entering the builder, no republish.
 */

test.describe('Constructor Web', () => {
  let a: APIRequestContext
  let originalDraftBody: any

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const draft = await (await a.get('/api/admin/site-pages/home')).json()
    originalDraftBody = { blocks: draft.blocks, seo: draft.seo }
  })

  test.afterAll(async () => {
    // Leave org 1's home page exactly as this run found it, published included.
    await a.put('/api/admin/site-pages/home', { data: originalDraftBody })
    await a.post('/api/admin/site-pages/home/publish')
    await a?.dispose()
  })

  test('editar el borrador no cambia lo publicado hasta pulsar Publicar', async () => {
    const before = await (await a.get('/api/public/site-pages/home')).json()

    const marker = `Draft only ${Date.now()}`
    const put = await a.put('/api/admin/site-pages/home', {
      data: { blocks: [{ id: 'hero', type: 'hero', version: 1, content: { title1: marker } }], seo: {} },
    })
    expect(put.ok()).toBeTruthy()

    const afterDraftSave = await (await a.get('/api/public/site-pages/home')).json()
    expect(afterDraftSave).toEqual(before)

    const publish = await a.post('/api/admin/site-pages/home/publish')
    expect(publish.ok()).toBeTruthy()

    const afterPublish = await (await a.get('/api/public/site-pages/home')).json()
    expect(afterPublish.blocks[0].content.title1).toBe(marker)
  })

  test('rechaza un documento mal formado sin tocar el borrador existente', async () => {
    const before = await (await a.get('/api/admin/site-pages/home')).json()
    const bad = await a.put('/api/admin/site-pages/home', { data: { blocks: 'not-an-array' } })
    expect(bad.status()).toBe(422)
    const after = await (await a.get('/api/admin/site-pages/home')).json()
    expect(after.blocks).toEqual(before.blocks)
  })

  test('un bloque de propiedades con fuente dinámica refleja cambios reales sin republicar', async () => {
    // A "properties" block whose dynamicFilter is 'latest' always renders
    // developer_properties fetched live at request time — publish a page
    // that has one, then create a brand new property and confirm it can
    // show up in /api/public/home (the same live feed the block reads from)
    // without ever touching site_pages again.
    const put = await a.put('/api/admin/site-pages/home', {
      data: {
        blocks: [{ id: 'p', type: 'properties', version: 1, content: { eyebrow: 'e', title: 't', source: 'dynamic', dynamicFilter: 'latest', limit: 12, layout: 'row' } }],
        seo: {},
      },
    })
    expect(put.ok()).toBeTruthy()
    const publish = await a.post('/api/admin/site-pages/home/publish')
    expect(publish.ok()).toBeTruthy()

    const devRes = await a.post('/api/admin/developers', { data: { name: `Live sync dev ${Date.now()}`, email: `livesync-${Date.now()}@mm.test`, status: 'active' } })
    expect(devRes.ok()).toBeTruthy()
    const marker = `Live Sync Property ${Date.now()}`
    const propRes = await a.post('/api/admin/developer-properties', {
      data: { developerId: (await devRes.json()).id, name: marker, status: 'new', price: 999000 },
    })
    expect(propRes.ok()).toBeTruthy()

    // No site-pages call happened between creating the property and this read.
    const homeFeed = await (await a.fetch('/api/public/home')).json()
    const names = homeFeed.projects.map((p: any) => p.name)
    expect(names, 'la propiedad nueva no aparece en el feed en vivo sin republicar').toContain(marker)

    const page = await (await a.get('/api/public/site-pages/home')).json()
    expect(page.blocks[0].content.dynamicFilter, 'el bloque sigue guardando solo el criterio, nunca los datos').toBe('latest')
  })
})
