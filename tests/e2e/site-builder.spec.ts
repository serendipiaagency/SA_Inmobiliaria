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
  test.use({ storageState: STATE_A })

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

  /**
   * The Block Inspector's ImageField/GalleryField (components/site-builder/
   * inspector/fields/) upload through the same /api/admin/upload as every
   * other admin form, then store the returned key on the block's content —
   * this proves that round trip end to end: upload -> save draft -> "reload"
   * (a fresh GET, same as re-opening the builder) -> publish -> the public
   * page serves the new image. Mirrors the acceptance flow the redesigned
   * Constructor Web inspector was built against.
   */
  test('una imagen subida al inspector persiste en el borrador y llega a lo publicado', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    )
    const upload = await a.post('/api/admin/upload', {
      multipart: { file: { name: 'hero-slide.png', mimeType: 'image/png', buffer: png }, folder: 'site-builder' },
    })
    expect(upload.ok(), await upload.text()).toBeTruthy()
    const { key } = await upload.json()

    const put = await a.put('/api/admin/site-pages/home', {
      data: { blocks: [{ id: 'hero', type: 'hero', version: 1, content: { title1: 'Imagen e2e', slides: [key] } }], seo: {} },
    })
    expect(put.ok()).toBeTruthy()

    // "Reload the builder" == a fresh GET of the same draft endpoint.
    const reloaded = await (await a.get('/api/admin/site-pages/home')).json()
    expect(reloaded.blocks[0].content.slides).toEqual([key])

    const publish = await a.post('/api/admin/site-pages/home/publish')
    expect(publish.ok()).toBeTruthy()

    const publicPage = await (await a.get('/api/public/site-pages/home')).json()
    expect(publicPage.blocks[0].content.slides, 'la imagen subida en el inspector debe llegar a la página pública tras publicar').toEqual([key])
  })

  /**
   * The click-interception fix in SiteBlockRenderer.vue's wrapperAttrs():
   * in Edit mode, a click anywhere in a block must select it, never run
   * the block's real behavior (here, a CTA link's navigation) — and
   * Preview must be the exact opposite: a true simulation where that same
   * click navigates for real. Proves both halves of the guarantee, not
   * just "no error was thrown".
   */
  test('en el lienzo, un clic en un bloque selecciona sin navegar; en Vista previa navega de verdad', async ({ page }) => {
    const put = await a.put('/api/admin/site-pages/home', {
      data: {
        blocks: [{
          id: 'cta-e2e',
          type: 'cta',
          version: 1,
          content: { title: 'CTA e2e', ctaPrimary: 'Contactar E2E', ctaPrimaryTo: '/contacto', align: 'center' },
        }],
        seo: {},
      },
    })
    expect(put.ok()).toBeTruthy()

    await page.goto('/admin/site-builder')
    const frameLocator = page.frameLocator('iframe[title="Vista previa del Constructor Web"]')
    const ctaLink = frameLocator.getByRole('link', { name: 'Contactar E2E' })
    await expect(ctaLink).toBeVisible({ timeout: 10_000 })

    // Edit mode (default): clicking the CTA must select the block, not
    // follow its link — the iframe stays on the canvas route and the
    // Inspector opens showing the block's real label. Scoped to
    // `aside.border-l` specifically: the shell has two <aside>s (the
    // "Estructura" list on the left, `border-r`, and the Inspector on the
    // right, `border-l`) and the selected block's name legitimately shows
    // in both once selected — a bare `page.locator('aside')` is a strict-
    // mode violation.
    await ctaLink.click()
    await expect(page.locator('aside.border-l').getByText('Llamada a la acción')).toBeVisible()
    const canvasFrame = page.frames().find((f) => f.url().includes('/admin/site-builder/canvas'))
    expect(canvasFrame, 'el iframe del lienzo debe seguir cargado').toBeTruthy()
    expect(canvasFrame!.url()).not.toContain('/contacto')

    // Preview mode: the same click must now navigate for real, exactly
    // like the published site.
    await page.getByRole('button', { name: 'Vista previa' }).click()
    await expect(frameLocator.getByRole('link', { name: 'Contactar E2E' })).toBeVisible()
    await frameLocator.getByRole('link', { name: 'Contactar E2E' }).click()
    await expect
      .poll(() => page.frames().some((f) => f.url().includes('/contacto')), { timeout: 10_000 })
      .toBe(true)
  })

  /**
   * The floating block toolbar (SiteBlockRenderer.vue) is rendered *inside*
   * the same wrapper whose capture-phase click handler blocks navigation
   * (see the test above) — without the `[data-block-toolbar]` early-return
   * in that handler, every one of its buttons would be silently swallowed
   * before its own click ever fired. Also covers the "+ Añadir sección
   * aquí" insert-at-position affordance (structure list and canvas gaps
   * both post the same `insert-at` message to the shell), which has its
   * own failure mode: the gap's negative margin makes it overlap the
   * neighboring block, so without an explicit stacking order the block
   * (painted later in DOM order) intercepts the hover/click meant for the
   * gap's insert button.
   */
  test('el toolbar flotante del bloque y "+ Añadir sección aquí" funcionan sin ser interceptados por el bloqueo de navegación', async ({ page }) => {
    const put = await a.put('/api/admin/site-pages/home', {
      data: {
        blocks: [
          { id: 'hero-e2e', type: 'hero', version: 1, content: { title1: 'Hero E2E' } },
          { id: 'cta-e2e', type: 'cta', version: 1, content: { title: 'CTA E2E', ctaPrimary: 'Ir', ctaPrimaryTo: '/contacto' } },
        ],
        seo: {},
      },
    })
    expect(put.ok()).toBeTruthy()

    await page.goto('/admin/site-builder')
    const structure = page.locator('aside.border-r')
    await expect(structure.getByText('01 · Hero')).toBeVisible()

    // Select block 1 and duplicate it via the canvas floating toolbar
    // (not the structure list's own duplicate icon — that path isn't
    // protected by the [data-block-toolbar] exception and would still work
    // even if this fix regressed).
    await structure.getByText('01 · Hero').click()
    const canvasFrame = page.frameLocator('iframe[title="Vista previa del Constructor Web"]')
    const toolbar = canvasFrame.locator('[data-block-toolbar]')
    await expect(toolbar).toBeVisible()
    await toolbar.getByTitle('Duplicar').click()
    await expect(structure.locator('[draggable="true"]')).toHaveCount(3)
    await expect(structure.getByText('02 · Hero')).toBeVisible()

    // "+ Añadir sección aquí" from the structure list, at the very top
    // (before position 1): hover the gap to lift its pointer-events-none,
    // then click, then pick a block from the library — it must land
    // exactly at index 0, not appended at the end.
    const firstGap = structure.locator('.group\\/gap').first()
    await firstGap.hover()
    await firstGap.locator('button').click()
    await expect(page.getByText('Añadir sección', { exact: true })).toBeVisible()
    // The library opens on the "Recomendados" shelf, which doesn't include
    // "Texto" — search overrides the category filter and matches across the
    // whole catalogue, same as picking the "Contenido" category tab would.
    await page.getByPlaceholder('Buscar secciones...').fill('Texto')
    // The preset card's accessible name concatenates its label AND
    // description ("Texto" + "Bloque de texto libre: …") — a bare "Texto"
    // also matches the Inspector's still-mounted "Texto" field label behind
    // the panel, so anchor on the full accessible name instead.
    await page.getByRole('button', { name: /^Texto Bloque de texto libre/ }).click()
    await expect(structure.getByText(/^01 · Texto$/)).toBeVisible()
  })

  /**
   * The section library panel (FASE 3): opens as a docked side panel (not a
   * full-screen modal — the canvas and structure list stay visible behind
   * it), category filtering narrows the grid to real presets, and marking a
   * preset as a favorite surfaces it in its own shelf on reopen.
   */
  test('la biblioteca de secciones filtra por categoría y recuerda los favoritos', async ({ page }) => {
    const put = await a.put('/api/admin/site-pages/home', { data: { blocks: [{ id: 'hero-e2e', type: 'hero', version: 1, content: {} }], seo: {} } })
    expect(put.ok()).toBeTruthy()

    await page.goto('/admin/site-builder')
    await page.getByTitle('Añadir sección').click()
    const panel = page.getByTestId('section-library')
    await expect(panel).toBeVisible()
    // The canvas behind it is still there and visible — not a full-screen modal.
    await expect(page.frameLocator('iframe[title="Vista previa del Constructor Web"]').getByText('EXPLORAR CATÁLOGO')).toBeVisible()

    // "Recomendados" is the default shelf and does not include every preset.
    // exact: true — "Comunidades" (the category tab, later) and a preset's
    // description text ("...comunidades/barrios...") both contain the
    // substring case-insensitively, so a loose match would be ambiguous.
    await expect(panel.getByText('Propiedades — fila', { exact: true })).toBeVisible()
    await expect(panel.getByText('Comunidades', { exact: true })).not.toBeVisible()

    // Switching category narrows to that category's real presets.
    await panel.getByRole('button', { name: 'Explora', exact: true }).click()
    await expect(panel.getByText('Comunidades', { exact: true })).toBeVisible()
    await expect(panel.getByText('Propiedades — fila', { exact: true })).not.toBeVisible()

    // Favorite a preset, close, reopen — it must still show as favorited
    // (a per-browser preference, not page state, so it survives a close).
    await panel.locator('[title="Añadir a favoritos"]').first().click()
    await panel.getByRole('button', { name: 'Cerrar biblioteca de secciones' }).click()
    await expect(panel).not.toBeVisible()
    await page.getByTitle('Añadir sección').click()
    const reopened = page.getByTestId('section-library')
    await expect(reopened.getByText('Favoritos')).toBeVisible()
    // The favorited preset legitimately shows in both the "Favoritos" shelf
    // and its regular category grid below — at least one marked "Quitar de
    // favoritos" is enough to prove the favorite survived the reopen.
    await expect(reopened.locator('[title="Quitar de favoritos"]').first()).toBeVisible()
  })
})
