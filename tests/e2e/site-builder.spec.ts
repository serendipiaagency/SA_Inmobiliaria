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

  /**
   * Version history, over real HTTP. The point of restoring is that it is
   * *not* a republish: it puts the old page back on the editor's desk, and
   * the public site only changes when someone deliberately publishes again.
   * That two-step is the whole safety net — a test that only checked "the
   * draft came back" would miss the half that matters.
   */
  test('restaurar una versión devuelve el borrador sin cambiar la web pública hasta republicar', async () => {
    const v1Marker = `Portada v1 ${Date.now()}`
    await a.put('/api/admin/site-pages/home', {
      data: { blocks: [{ id: 'hero', type: 'hero', version: 1, content: { title1: v1Marker } }], seo: { title: v1Marker } },
    })
    const v1 = (await (await a.post('/api/admin/site-pages/home/publish')).json()).version

    const v2Marker = `Portada v2 ${Date.now()}`
    await a.put('/api/admin/site-pages/home', {
      data: { blocks: [{ id: 'hero', type: 'hero', version: 1, content: { title1: v2Marker } }], seo: { title: v2Marker } },
    })
    const v2 = (await (await a.post('/api/admin/site-pages/home/publish')).json()).version
    expect(v2).toBe(v1 + 1)

    const history = await (await a.get('/api/admin/site-pages/home/versions')).json()
    expect(history.versions[0].version, 'el historial debe venir de la más reciente a la más antigua').toBe(v2)
    expect(history.versions[0].isCurrent, 'la versión más reciente es la que sirve la web').toBe(true)
    expect(history.versions.find((v: any) => v.version === v1)).toBeTruthy()

    const restore = await a.post('/api/admin/site-pages/home/restore', { data: { version: v1 } })
    expect(restore.ok(), await restore.text()).toBeTruthy()

    const draft = await (await a.get('/api/admin/site-pages/home')).json()
    expect(draft.blocks[0].content.title1, 'el borrador debe volver a la versión restaurada').toBe(v1Marker)
    expect(draft.hasUnpublishedChanges, 'tras restaurar quedan cambios sin publicar, por definición').toBe(true)
    expect(draft.version, 'restaurar no incrementa la versión publicada').toBe(v2)

    const stillLive = await (await a.get('/api/public/site-pages/home')).json()
    expect(stillLive.blocks[0].content.title1, 'restaurar NO debe cambiar la web pública').toBe(v2Marker)

    // Sólo ahora, y con un acto explícito, lo restaurado se hace público.
    const v3 = (await (await a.post('/api/admin/site-pages/home/publish')).json()).version
    expect(v3).toBe(v2 + 1)
    const live = await (await a.get('/api/public/site-pages/home')).json()
    expect(live.blocks[0].content.title1).toBe(v1Marker)
  })

  test('restaurar rechaza una versión inexistente o mal formada sin tocar el borrador', async () => {
    const before = await (await a.get('/api/admin/site-pages/home')).json()

    const missing = await a.post('/api/admin/site-pages/home/restore', { data: { version: 999_999 } })
    expect(missing.status()).toBe(404)
    const malformed = await a.post('/api/admin/site-pages/home/restore', { data: { version: 'la última' } })
    expect(malformed.status()).toBe(422)

    const after = await (await a.get('/api/admin/site-pages/home')).json()
    expect(after.blocks).toEqual(before.blocks)
  })

  /**
   * The same restore, driven through the actual UI rather than the API: the
   * toolbar button, the panel, the confirmation, and — the part only a
   * browser can prove — the canvas iframe re-rendering with the restored
   * content.
   */
  test('el historial restaura desde la interfaz y el lienzo refleja la versión restaurada', async ({ page }) => {
    const oldMarker = `Antigua ${Date.now()}`
    await a.put('/api/admin/site-pages/home', {
      data: { blocks: [{ id: 'hero', type: 'hero', version: 1, content: { title1: oldMarker } }], seo: {} },
    })
    const oldVersion = (await (await a.post('/api/admin/site-pages/home/publish')).json()).version

    await a.put('/api/admin/site-pages/home', {
      data: { blocks: [{ id: 'hero', type: 'hero', version: 1, content: { title1: `Nueva ${Date.now()}` } }], seo: {} },
    })
    await a.post('/api/admin/site-pages/home/publish')

    await page.goto('/admin/site-builder')
    const frameLocator = page.frameLocator('iframe[title="Vista previa del Constructor Web"]')
    await expect(frameLocator.getByText(oldMarker)).toHaveCount(0)

    await page.getByRole('button', { name: 'Historial de versiones publicadas' }).click()
    await expect(page.getByTestId('version-history')).toBeVisible()

    await page.getByTestId(`restore-v${oldVersion}`).click()
    await page.getByRole('button', { name: 'Restaurar al borrador' }).click()

    await expect(page.getByTestId('version-history')).toBeHidden()
    await expect(frameLocator.getByText(oldMarker).first()).toBeVisible({ timeout: 10_000 })
    // Y sigue sin publicarse: el botón vuelve a ofrecer publicar.
    await expect(page.getByRole('button', { name: 'Publicar cambios' })).toBeVisible()
  })

  /**
   * El bloque de comerciales, con la misma garantía que el de propiedades:
   * guarda criterio, no copias. Lo que se comprueba es que el dato llega en
   * vivo desde /api/public/home — si el bloque guardase los nombres, editar
   * la ficha del comercial no cambiaría nada hasta republicar.
   */
  test('el bloque de comerciales lee el equipo en vivo y respeta "mostrar en la web"', async () => {
    const marker = `Comercial Bloque ${Date.now()}`
    const created = await a.post('/api/admin/team', {
      data: { name: marker, email: `bloque-${Date.now()}@mm.test`, position: 'Asesor E2E', slug: `bloque-${Date.now()}`, showOnWeb: 1 },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    const memberId = (await created.json()).id

    await a.put('/api/admin/site-pages/home', {
      data: {
        blocks: [{ id: 'team-e2e', type: 'team', version: 1, content: { eyebrow: 'e', title: 'Equipo', source: 'dynamic', limit: 12, layout: 'cards' } }],
        seo: {},
      },
    })
    expect((await a.post('/api/admin/site-pages/home/publish')).ok()).toBeTruthy()

    const feed = await (await a.fetch('/api/public/home')).json()
    expect(feed.team.map((m: any) => m.name), 'el comercial nuevo no llega al feed en vivo').toContain(marker)

    // Despublicarlo lo saca del feed sin tocar el Constructor Web: la
    // visibilidad la manda la ficha, no el bloque.
    await a.put(`/api/admin/team/${memberId}`, { data: { showOnWeb: 0 } })
    const afterHiding = await (await a.fetch('/api/public/home')).json()
    expect(afterHiding.team.map((m: any) => m.name), 'sigue saliendo tras quitarle "mostrar en la web"').not.toContain(marker)

    const page = await (await a.get('/api/public/site-pages/home')).json()
    expect(page.blocks[0].content.source, 'el bloque debe guardar criterio, nunca las personas').toBe('dynamic')
    expect(JSON.stringify(page.blocks[0].content), 'el bloque ha guardado una copia del comercial').not.toContain(marker)

    await a.delete(`/api/admin/team/${memberId}`)
  })

  /**
   * El formulario de captación y la reserva de visita son los dos únicos
   * bloques con efecto real: uno crea un lead en el CRM, el otro ocupa un
   * hueco en la agenda de un comercial. En el lienzo el clic está
   * interceptado, pero **Vista previa dispara handlers de verdad** — es su
   * razón de ser. Sin bloqueo, revisar la portada antes de publicarla
   * llenaría el CRM de datos inventados.
   *
   * Esto se comprueba en el navegador porque es lo único que puede
   * distinguir "el botón está ahí" de "el botón está desactivado".
   */
  test('los bloques de captación quedan desactivados en el editor y en Vista previa', async ({ page }) => {
    // Un comercial publicado propio, para no depender de lo que hayan dejado
    // otras pruebas: sin ninguno, el bloque de reserva saldría desactivado
    // por falta de agenda y esta prueba pasaría sin demostrar nada.
    const agent = await a.post('/api/admin/team', {
      data: { name: `Agenda E2E ${Date.now()}`, email: `agenda-${Date.now()}@mm.test`, position: 'Asesor', showOnWeb: 1 },
    })
    expect(agent.ok(), await agent.text()).toBeTruthy()
    const agentId = (await agent.json()).id

    const put = await a.put('/api/admin/site-pages/home', {
      data: {
        blocks: [
          { id: 'lead-e2e', type: 'lead-form', version: 1, content: { title: 'Cuéntanos qué buscas', submitLabel: 'Quiero que me llamen', showPhone: true } },
          { id: 'visit-e2e', type: 'book-visit', version: 1, content: { title: 'Reserva una visita', ctaLabel: 'Reservar una visita', channel: 'in_person' } },
        ],
        seo: {},
      },
    })
    expect(put.ok(), await put.text()).toBeTruthy()

    await page.goto('/admin/site-builder')
    const canvas = page.frameLocator('iframe[title="Vista previa del Constructor Web"]')

    // En el lienzo el botón no lleva `disabled` (un botón deshabilitado no
    // recibe clics y no se podría seleccionar para editarlo): lo que protege
    // ahí es la intercepción del clic en fase de captura más el guard del
    // handler, y el botón lo dice con aria-disabled. En Vista previa —donde
    // los clics sí llegan— vuelve a estar deshabilitado de verdad.
    const submit = canvas.getByRole('button', { name: 'Quiero que me llamen' })
    await expect(submit).toBeVisible({ timeout: 10_000 })
    await expect(submit, 'el formulario debe declararse desactivado en el lienzo').toHaveAttribute('aria-disabled', 'true')

    const book = canvas.getByRole('button', { name: 'Reservar una visita' })
    await expect(book, 'la reserva debe declararse desactivada en el lienzo').toHaveAttribute('aria-disabled', 'true')

    // Los dos avisan de POR QUÉ están desactivados. Comprobarlo distingue
    // "bloqueado por estar en el editor" de "bloqueado por no haber agenda",
    // que se ven igual en el botón.
    await expect(canvas.getByText(/Desactivado mientras editas/)).toHaveCount(2)

    // Vista previa es el caso que de verdad importa: ahí los clics sí llegan.
    await page.getByRole('button', { name: 'Vista previa' }).click()
    await expect(canvas.getByRole('button', { name: 'Quiero que me llamen' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Reservar una visita' })).toBeDisabled()

    await a.delete(`/api/admin/team/${agentId}`)
  })

  test('el formulario de captación publicado crea un lead real con su referencia', async () => {
    const reference = `Portada E2E ${Date.now()}`
    await a.put('/api/admin/site-pages/home', {
      data: { blocks: [{ id: 'lead-pub', type: 'lead-form', version: 1, content: { title: 'Contacto', subject: reference } }], seo: {} },
    })
    expect((await a.post('/api/admin/site-pages/home/publish')).ok()).toBeTruthy()

    const published = await (await a.get('/api/public/site-pages/home')).json()
    expect(published.blocks[0].content.subject, 'la referencia interna debe llegar a lo publicado').toBe(reference)

    // El bloque publica en /api/public/contact — el mismo camino ya
    // limitado por IP que usa la página de Contacto, no uno nuevo. Aquí se
    // recorre ese camino tal cual lo haría el visitante.
    const visitorEmail = `lead-${Date.now()}@example.com`
    const sent = await a.post('/api/public/contact', {
      data: { name: 'Visitante E2E', email: visitorEmail, phone: '+34600000000', message: 'Busco piso de 3 habitaciones', type: 'contact', subject: reference },
    })
    expect(sent.ok(), await sent.text()).toBeTruthy()

    const leads = await (await a.get('/api/admin/saas/leads')).json()
    const lead = leads.rows?.find((l: any) => l.email === visitorEmail)
    expect(lead, 'el envío no ha creado un lead en el CRM').toBeTruthy()
    expect(lead.source).toBe('web')
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

  /**
   * The Inspector's three tabs (FASE 4): "Contenido"/"Diseño"/"Avanzado"
   * show mutually exclusive sets of InspectorSection instances (routed via
   * provide/inject in InspectorSection.vue, not a prop threaded through
   * every *Inspector.vue), and switching to a different block resets back
   * to "Contenido" rather than leaving the admin stranded on a tab the new
   * block has nothing under.
   */
  test('el Inspector separa Contenido/Diseño/Avanzado y vuelve a Contenido al cambiar de bloque', async ({ page }) => {
    const put = await a.put('/api/admin/site-pages/home', {
      data: {
        blocks: [
          { id: 'props-1', type: 'properties', version: 1, content: { title: 'Propiedades', source: 'dynamic', dynamicFilter: 'latest', limit: 4, layout: 'row' } },
          { id: 'hero-1', type: 'hero', version: 1, content: { title1: 'Hero' } },
        ],
        seo: {},
      },
    })
    expect(put.ok()).toBeTruthy()

    await page.goto('/admin/site-builder')
    await page.locator('aside.border-r').getByText(/^01 · Propiedades$/).click()
    const inspector = page.locator('aside.border-l')
    await expect(inspector.getByText('Eyebrow', { exact: true })).toBeVisible()
    // "Diseño" content (the layout picker) is not shown while on "Contenido".
    await expect(inspector.getByText('Fila', { exact: true })).not.toBeVisible()

    await inspector.getByRole('button', { name: 'Diseño', exact: true }).click()
    await expect(inspector.getByText('Fila', { exact: true })).toBeVisible()
    await expect(inspector.getByText('Eyebrow', { exact: true })).not.toBeVisible()

    // Switching blocks resets the tab back to "Contenido".
    await page.locator('aside.border-r').getByText(/^02 · Hero$/).click()
    await expect(inspector.getByText('Eyebrow', { exact: true })).toBeVisible()
  })

  /**
   * FASE 5: the Inspector panel collapses like the Estructura panel always
   * has — the canvas immediately reclaims the width (proving the fit/zoom
   * ResizeObserver reacts to it, not just window resizes), and the
   * selection survives the collapse/expand round trip.
   */
  test('el panel del Inspector se contrae, el lienzo gana el espacio, y la selección sobrevive', async ({ page }) => {
    const put = await a.put('/api/admin/site-pages/home', { data: { blocks: [{ id: 'hero-1', type: 'hero', version: 1, content: {} }], seo: {} } })
    expect(put.ok()).toBeTruthy()

    await page.goto('/admin/site-builder')
    await page.locator('aside.border-r').getByText(/^01 ·/).click()
    const zoomLabel = page.getByTitle('Ajustar al área disponible')
    const before = await zoomLabel.textContent()

    await page.getByTitle('Contraer inspector').click()
    await expect(page.locator('aside.border-l')).toHaveClass(/w-11/)
    // Auto-fit zoom must have recalculated once the canvas gained the width
    // the Inspector used to occupy — not stayed frozen at the old value.
    await expect.poll(async () => zoomLabel.textContent()).not.toBe(before)

    await page.getByTitle('Expandir inspector').click()
    await expect(page.locator('aside.border-l')).not.toHaveClass(/w-11/)
    await expect(page.locator('aside.border-r [draggable="true"]').first()).toHaveClass(/border-ink/)
    await expect(page.locator('aside.border-l').getByText('01 · Hero')).toBeVisible()
  })
})

/**
 * El editor visual directo: la página del lienzo es un canvas editable.
 * Pulsar un título lo selecciona y abre SUS opciones (no las del bloque);
 * doble clic lo edita ahí mismo; fuente, tamaño y color cambian el lienzo al
 * instante; los datos dinámicos se distinguen de los estáticos; todo se
 * autoguarda, se deshace, se publica y llega a la web pública con la misma
 * hoja de estilos. Cada prueba se apoya en la anterior sólo a través de la
 * API (borrador conocido), nunca del estado del navegador.
 */
test.describe('Constructor Web — edición directa sobre el lienzo', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext
  let originalDraftBody: any
  const CANVAS = 'iframe[title="Vista previa del Constructor Web"]'

  async function draft() {
    return (await a.get('/api/admin/site-pages/home')).json()
  }
  async function setDraft(blocks: any[], extra: Record<string, any> = {}) {
    const res = await a.put('/api/admin/site-pages/home', { data: { blocks, seo: {}, ...extra } })
    expect(res.ok(), await res.text()).toBeTruthy()
  }

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const d = await draft()
    originalDraftBody = { blocks: d.blocks, seo: d.seo, styles: d.styles }
  })

  test.afterAll(async () => {
    await a.put('/api/admin/site-pages/home', { data: originalDraftBody })
    await a.post('/api/admin/site-pages/home/publish')
    await a?.dispose()
  })

  test('pulsar un título lo selecciona; doble clic lo edita inline; el inspector y el borrador siguen al lienzo', async ({ page }) => {
    await setDraft([{ id: 'text-e2e', type: 'text', version: 1, content: { title: 'Encuentra tu hogar ideal', body: 'Cuerpo de prueba', align: 'left', maxWidth: 'md' } }])

    await page.goto('/admin/site-builder')
    const canvas = page.frameLocator(CANVAS)
    const title = canvas.locator('[data-sb-node="text-e2e:title"]')
    await expect(title).toBeVisible({ timeout: 10_000 })
    await expect(title).toHaveText('Encuentra tu hogar ideal')

    // Un clic selecciona el título, no sólo la sección: el inspector cambia
    // de "sección" a "texto" y la miga de pan enseña ambos niveles.
    await title.click()
    await expect(page.getByTestId('inspector-title')).toHaveText('Propiedades del texto')
    await expect(page.getByTestId('breadcrumb-node')).toHaveText('Título')
    await expect(title).toHaveAttribute('data-sb-selected', '1')
    await expect(canvas.locator('[data-sb-toolbar]')).toBeVisible()

    // Doble clic → edición inline; se escribe directamente en el lienzo.
    await title.dblclick()
    await expect(title).toHaveAttribute('data-sb-editing', '1')
    await page.keyboard.press('End')
    await page.keyboard.type(' — editado')
    // Sincronización bidireccional: el campo del inspector ya lo refleja.
    await expect(page.getByTestId('node-text').locator('input, textarea')).toHaveValue('Encuentra tu hogar ideal — editado')
    await page.keyboard.press('Enter')
    await expect(title).not.toHaveAttribute('data-sb-editing', '1')
    await expect(title).toHaveText('Encuentra tu hogar ideal — editado')

    // Autoguardado sin tocar nada más.
    await expect.poll(async () => (await draft()).blocks[0].content.title, { timeout: 10_000 }).toBe('Encuentra tu hogar ideal — editado')

    // Y el camino inverso: editar desde el inspector cambia el lienzo al instante.
    const field = page.getByTestId('node-text').locator('input, textarea')
    await field.fill('Desde el inspector')
    await expect(title).toHaveText('Desde el inspector')

    // Deshacer cubre la edición de texto, no sólo la estructura.
    await page.getByTitle('Deshacer').click()
    await expect(title).not.toHaveText('Desde el inspector')
  })

  test('fuente, tamaño y color cambian el lienzo en tiempo real y se guardan como estilos estructurados', async ({ page }) => {
    await setDraft([{ id: 'text-e2e', type: 'text', version: 1, content: { title: 'Estilos', body: 'Cuerpo', align: 'left', maxWidth: 'md' } }])

    await page.goto('/admin/site-builder')
    const canvas = page.frameLocator(CANVAS)
    const title = canvas.locator('[data-sb-node="text-e2e:title"]')
    await expect(title).toBeVisible({ timeout: 10_000 })
    await title.click()
    await page.locator('aside.border-l').getByRole('button', { name: 'Diseño', exact: true }).click()

    await page.getByTestId('node-font-size').fill('72')
    await page.getByTestId('node-font-size').press('Enter')
    await expect(title).toHaveCSS('font-size', '72px')

    await page.getByTestId('node-color').fill('#ff0000')
    await page.getByTestId('node-color').press('Enter')
    await expect(title).toHaveCSS('color', 'rgb(255, 0, 0)')

    await page.locator('aside.border-l').getByLabel('Fuente').selectOption('Playfair Display')
    await expect(title).toHaveCSS('font-family', /Playfair Display/)
    // La fuente se pide a Google en el propio lienzo, igual que hará la web.
    await expect(canvas.locator('link[href*="fonts.googleapis.com"][href*="Playfair"]')).toHaveCount(1)

    await expect
      .poll(async () => (await draft()).blocks[0].nodeStyles?.title, { timeout: 10_000 })
      .toEqual({ fontSize: 72, color: '#ff0000', fontFamily: 'Playfair Display' })

    // Restablecer vuelve al estilo global y deja el JSON limpio.
    await page.getByTestId('node-reset-all').click()
    await expect(title).not.toHaveCSS('color', 'rgb(255, 0, 0)')
    await expect.poll(async () => (await draft()).blocks[0].nodeStyles, { timeout: 10_000 }).toBeUndefined()
  })

  test('un botón se selecciona (no navega), su texto y su enlace se editan, y una imagen se cambia sin pasar por el inspector', async ({ page }) => {
    await setDraft([
      {
        id: 'cta-e2e',
        type: 'cta',
        version: 1,
        content: { title: 'Cierre', ctaPrimary: 'Contactar', ctaPrimaryTo: '/contacto', align: 'center', image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=200' },
      },
    ])

    await page.goto('/admin/site-builder')
    const canvas = page.frameLocator(CANVAS)
    const button = canvas.locator('[data-sb-node="cta-e2e:ctaPrimary"]')
    await expect(button).toBeVisible({ timeout: 10_000 })

    await button.click()
    await expect(page.getByTestId('inspector-title')).toHaveText('Propiedades del botón')
    expect(page.frames().find((f) => f.url().includes('/admin/site-builder/canvas'))!.url()).not.toContain('/contacto')

    // Enlace por tipo, sin escribir la URL a mano.
    await page.getByTestId('node-link').fill('/equipo')
    await page.getByTestId('node-link').press('Enter')
    await expect(button).toHaveAttribute('href', '/equipo')
    await expect.poll(async () => (await draft()).blocks[0].content.ctaPrimaryTo, { timeout: 10_000 }).toBe('/equipo')

    // Imagen: un clic la selecciona; doble clic abre "Cambiar imagen" con subida directa.
    const image = canvas.locator('[data-sb-node="cta-e2e:image"]')
    await image.click()
    await expect(page.getByTestId('inspector-title')).toHaveText('Propiedades de la imagen')
    await image.dblclick()
    await expect(page.getByTestId('media-picker')).toBeVisible()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    await page.getByTestId('media-picker').locator('input[type="file"]').setInputFiles({ name: 'fondo.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByTestId('media-picker')).toBeHidden({ timeout: 10_000 })
    await expect.poll(async () => (await draft()).blocks[0].content.image, { timeout: 10_000 }).not.toContain('unsplash')
    await expect(image).toHaveAttribute('src', /\/api\/media|\/media\//)
  })

  test('en una tarjeta dinámica se distingue el dato (intocable) de su presentación (editable), y pulsar el fondo selecciona la tarjeta', async ({ page }) => {
    const devRes = await a.post('/api/admin/developers', { data: { name: `Editor dev ${Date.now()}`, email: `editor-${Date.now()}@mm.test`, status: 'active' } })
    expect(devRes.ok()).toBeTruthy()
    const propertyName = `Villa Editor ${Date.now()}`
    const propRes = await a.post('/api/admin/developer-properties', { data: { developerId: (await devRes.json()).id, name: propertyName, status: 'new', price: 750000 } })
    expect(propRes.ok()).toBeTruthy()

    await setDraft([{ id: 'props-e2e', type: 'properties', version: 1, content: { title: 'Premium', source: 'dynamic', dynamicFilter: 'latest', limit: 3, layout: 'dark-grid' } }])

    await page.goto('/admin/site-builder')
    const canvas = page.frameLocator(CANVAS)
    const name = canvas.locator('[data-sb-node="props-e2e:card.name"]').first()
    await expect(name).toBeVisible({ timeout: 10_000 })
    await expect(name).toHaveText(propertyName)

    await name.click()
    await expect(page.getByTestId('breadcrumb-node')).toHaveText('Nombre de la propiedad')
    await expect(page.getByTestId('node-dynamic-notice')).toContainText('procede de Propiedades (web)')
    // No hay campo de texto: el nombre no se puede convertir en estático.
    await expect(page.getByTestId('node-text')).toHaveCount(0)
    // Doble clic tampoco lo edita.
    await name.dblclick()
    await expect(name).not.toHaveAttribute('data-sb-editing', '1')

    // Pero su presentación sí — y se aplica a TODAS las tarjetas del bloque.
    await page.locator('aside.border-l').getByRole('button', { name: 'Diseño', exact: true }).click()
    await page.getByTestId('node-color').fill('#00ff00')
    await page.getByTestId('node-color').press('Enter')
    await expect(name).toHaveCSS('color', 'rgb(0, 255, 0)')
    await expect.poll(async () => (await draft()).blocks[0].nodeStyles?.['card.name']?.color, { timeout: 10_000 }).toBe('#00ff00')
    const content = (await draft()).blocks[0].content
    expect(Object.keys(content).some((k) => k.startsWith('card.')), 'el dato dinámico se ha copiado al contenido').toBe(false)
    expect(JSON.stringify(content)).not.toContain(propertyName)

    // La tarjeta entera: clic en el hueco entre la foto y el precio.
    const card = canvas.locator('[data-sb-node="props-e2e:card"]').first()
    const imageBox = await card.locator('[data-sb-node="props-e2e:card.image"]').boundingBox()
    await card.click({ position: { x: 8, y: imageBox!.height + 6 } })
    await expect(page.getByTestId('inspector-title')).toHaveText('Propiedades de la tarjeta')

    // Y el fondo de la sección: la propia sección.
    await canvas.locator('[data-site-block-id="props-e2e"]').click({ position: { x: 6, y: 6 } })
    await expect(page.getByTestId('inspector-title')).toHaveText('Propiedades de la sección')
  })

  test('cabecera y pie se ven en el lienzo como elementos globales; Esc sube de nivel hasta deseleccionar', async ({ page }) => {
    await setDraft([{ id: 'text-e2e', type: 'text', version: 1, content: { title: 'Niveles', body: 'Cuerpo' } }])

    await page.goto('/admin/site-builder')
    const canvas = page.frameLocator(CANVAS)
    await expect(canvas.locator('[data-sb-node="text-e2e:title"]')).toBeVisible({ timeout: 10_000 })

    await canvas.locator('[data-sb-zone="header"] a[href="/"]').first().click()
    await expect(page.getByTestId('global-zone-inspector')).toBeVisible()
    await expect(page.getByTestId('global-zone-inspector')).toContainText('elemento global')
    await expect(canvas.locator('footer')).toBeVisible()

    const title = canvas.locator('[data-sb-node="text-e2e:title"]')
    await title.click()
    await expect(page.getByTestId('breadcrumb-node')).toHaveText('Título')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('breadcrumb-node')).toHaveCount(0)
    await expect(page.getByTestId('inspector-title')).toHaveText('Propiedades de la sección')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('inspector-empty')).toBeVisible()
  })

  test('los estilos por dispositivo se guardan aparte, heredan, y llegan publicados a la web pública', async ({ page }) => {
    await setDraft([{ id: 'text-e2e', type: 'text', version: 1, content: { title: 'Responsive', body: 'Cuerpo' } }])

    await page.goto('/admin/site-builder')
    const canvas = page.frameLocator(CANVAS)
    const title = canvas.locator('[data-sb-node="text-e2e:title"]')
    await expect(title).toBeVisible({ timeout: 10_000 })
    await title.click()
    await page.locator('aside.border-l').getByRole('button', { name: 'Diseño', exact: true }).click()
    await page.getByTestId('node-font-size').fill('64')
    await page.getByTestId('node-font-size').press('Enter')

    // Con Móvil en el lienzo, el mismo control escribe el override de móvil.
    await page.getByTitle('Móvil').click()
    await expect(page.getByTestId('node-device-banner')).toContainText('Editando la vista Móvil')
    await page.getByTestId('node-font-size').fill('32')
    await page.getByTestId('node-font-size').press('Enter')
    await expect(title).toHaveCSS('font-size', '32px')
    await page.getByTitle('Escritorio').click()
    await expect(title).toHaveCSS('font-size', '64px')

    // Estilos globales de la página.
    await page.getByTestId('open-global-styles').click()
    await page.getByTestId('global-styles-panel').getByLabel('Tipografía de los títulos').selectOption('Lora')
    await page.getByRole('button', { name: 'Cerrar estilos globales' }).click()
    await expect(title).toHaveCSS('font-family', /Lora/)

    await expect
      .poll(async () => (await draft()).blocks[0].nodeStyles?.title, { timeout: 10_000 })
      .toEqual({ fontSize: 64, responsive: { mobile: { fontSize: 32 } } })
    expect((await draft()).styles).toEqual({ fontHeading: 'Lora' })

    // Recargar el editor recupera exactamente lo mismo (persistencia).
    await page.reload()
    await expect(page.frameLocator(CANVAS).locator('[data-sb-node="text-e2e:title"]')).toHaveCSS('font-size', '64px', { timeout: 10_000 })

    // Publicar → la web pública lleva la misma hoja de estilos, con la media
    // query de móvil, servida en el SSR del dominio de la organización.
    expect((await a.post('/api/admin/site-pages/home/publish')).ok()).toBeTruthy()
    const published = await (await a.get('/api/public/site-pages/home')).json()
    expect(published.blocks[0].nodeStyles.title.responsive.mobile.fontSize).toBe(32)
    expect(published.styles.fontHeading).toBe('Lora')

    const domain = `editor-e2e-${Date.now()}.test`
    const assign = await a.put('/api/admin/organizations/1', { data: { domain } })
    expect(assign.ok(), await assign.text()).toBeTruthy()
    try {
      const anon = await pwRequest.newContext({ baseURL: BASE_URL })
      const html = await (await anon.get('/', { headers: { host: domain } })).text()
      await anon.dispose()
      expect(html).toContain('data-sb-node="text-e2e:title"')
      expect(html).toContain('[data-site-page] [data-sb-node="text-e2e:title"]{font-size:64px!important}')
      expect(html).toContain('@media (max-width: 639.98px){[data-site-page] [data-sb-node="text-e2e:title"]{font-size:32px!important}}')
      expect(html).toContain('family=Lora')
      // Y nada del editor se cuela en producción.
      expect(html).not.toContain('data-sb-selected')
      expect(html).not.toContain('data-sb-label')
      expect(html).not.toContain('sb-editing')
    } finally {
      await a.put('/api/admin/organizations/1', { data: { domain: '' } })
    }
  })
})
