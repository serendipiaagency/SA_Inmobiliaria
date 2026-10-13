import { test, expect, request as pwRequest, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'
import { allChoices, buildConsent, consentStorageKey, NO_COOKIE_PROVIDERS } from '../../utils/cookieConsent'

/**
 * Megaprompt «rediseño premium del sistema de cookies y aviso de
 * demostración» (28 comprobaciones): el aviso de cookies es configurable por
 * inmobiliaria desde el Constructor (textos por idioma, logo, colores,
 * posición, móvil, animación) sin tocar la lógica del consentimiento; el
 * aviso de demostración sólo existe en una web demo y también se configura;
 * todo con borrador, publicación y aislamiento entre empresas.
 *
 * La web pública de la agencia A es la del host por defecto (org 1): un
 * visitante sin decisión la ve en /propiedades. El lienzo del Constructor,
 * con la sesión de A.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const EMPTY = { cookies: [], origins: [] }
const PUBLIC_PAGE = '/propiedades'
const CANVAS = 'iframe[title="Vista previa del Constructor Web"]'
const RUN = `${Date.now()}${Math.floor(Math.random() * 1000)}`
const TITLE = `Cookies en Norte ${RUN}`

async function freshPage(browser: Browser, width = 1440, height = 900, extra: Record<string, any> = {}) {
  const ctx = await browser.newContext({ storageState: EMPTY, viewport: { width, height }, ...extra })
  const page = await ctx.newPage()
  await page.goto(PUBLIC_PAGE)
  const notice = page.getByTestId('cookie-consent')
  await expect(notice).toBeVisible()
  return { ctx, page, notice, card: notice.getByRole('dialog') }
}
const storedConsent = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('inmo_cookie_consent') || 'null'))

test.describe('Aviso de cookies premium y aviso de demostración', () => {
  let a: APIRequestContext
  let anon: APIRequestContext
  let original: any = null

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    original = (await (await a.get('/api/admin/site-consent')).json()).config
    // Punto de partida conocido: los avisos de partida, publicados.
    expect((await a.put('/api/admin/site-consent', { data: {} })).ok()).toBeTruthy()
    expect((await a.post('/api/admin/site-consent/publish')).ok()).toBeTruthy()
  })
  test.afterAll(async () => {
    if (original) {
      await a.put('/api/admin/site-consent', { data: original })
      await a.post('/api/admin/site-consent/publish')
    }
    await a.dispose()
    await anon.dispose()
  })

  test('1–6 · de partida: modal centrado, título de la web, tres botones en orden, enlaces legales, accesible y sin cerrar sin decidir', async ({ browser }) => {
    const { ctx, page, notice, card } = await freshPage(browser)
    // 1. Apertura y diseño de partida.
    await expect(notice).toHaveAttribute('data-position', 'center')
    await expect(card.getByRole('heading', { name: 'Tu privacidad es importante' })).toBeVisible()
    const box = (await card.boundingBox())!
    const vw = page.viewportSize()!.width
    expect(Math.abs(box.x + box.width / 2 - vw / 2)).toBeLessThan(40)
    expect(await card.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('24px')
    // 2. Los tres botones, en orden, y Rechazar tan visible como Aceptar.
    await expect(notice.locator('[data-testid="cookie-configure"], [data-testid="cookie-reject"], [data-testid="cookie-accept"]')).toHaveText(['Configurar', 'Rechazar', 'Aceptar y continuar'])
    const reject = (await notice.getByTestId('cookie-reject').boundingBox())!
    const accept = (await notice.getByTestId('cookie-accept').boundingBox())!
    expect(Math.abs(reject.height - accept.height)).toBeLessThan(2)
    // Iconos discretos por categoría, decorativos y en el color del texto (nunca una marca de verificación).
    await expect(notice.locator('svg[data-category="analytics"]').first()).toBeVisible()
    await expect(notice.locator('svg[data-category="thirdParty"]').first()).toBeVisible()
    // 3. Enlaces legales dinámicos de la web (cookies y privacidad) y responsable.
    await expect(notice.getByTestId('cookie-policy-link')).toHaveAttribute('href', '/cookies')
    await expect(notice.getByTestId('cookie-privacy-link')).toHaveAttribute('href', '/privacidad')
    await expect(notice.getByTestId('cookie-controller')).toContainText('Responsable:')
    // 4. Accesibilidad: diálogo modal etiquetado y descrito, foco dentro y encerrado.
    await expect(card).toHaveAttribute('aria-modal', 'true')
    const labelledBy = await card.getAttribute('aria-labelledby')
    const describedBy = await card.getAttribute('aria-describedby')
    expect(labelledBy && describedBy).toBeTruthy()
    await expect(page.locator(`#${labelledBy}`)).toHaveText('Tu privacidad es importante')
    await expect(page.locator(`#${describedBy}`)).toContainText('cookies')
    const inside = () => page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="cookie-consent"]')))
    expect(await inside()).toBe(true)
    for (let i = 0; i < 8; i++) await page.keyboard.press('Tab')
    expect(await inside()).toBe(true)
    // 5. Sin decidir no se cierra: ni con Escape, ni pulsando fuera, ni hay X.
    await page.keyboard.press('Escape')
    await expect(notice).toBeVisible()
    await page.mouse.click(8, 8)
    await expect(notice).toBeVisible()
    await expect(notice.getByTestId('cookie-close')).toHaveCount(0)
    // 6. Nada opcional premarcado.
    await notice.getByTestId('cookie-configure').click()
    await expect(notice.getByTestId('cookie-toggle-analytics')).not.toBeChecked()
    await expect(notice.getByTestId('cookie-toggle-thirdParty')).not.toBeChecked()
    await expect(notice.locator('svg[data-category="necessary"]')).toBeVisible()
    await ctx.close()
  })

  test('7–13 · la configuración propia (título, color, radio, posición, logo, categorías) llega a la web sólo al publicar y no a otra empresa', async ({ browser }) => {
    const put = await a.put('/api/admin/site-consent', {
      data: {
        cookie: {
          texts: { es: { title: TITLE, accept: 'Aceptar todas' } },
          design: { accent: '#1d4ed8', radius: 8, showLogo: true, logo: '/placeholder.svg', overlayOpacity: 30 },
          layout: { position: 'bottom-right', maxWidth: 520, edgeOffset: 24 },
          behavior: { showCategoryDescriptions: false, animation: 'none' },
        },
      },
    })
    expect(put.ok(), await put.text()).toBeTruthy()
    const saved = (await put.json()).config
    expect(saved.cookie.design.accent).toBe('#1d4ed8')
    expect(saved.cookie.layout.position).toBe('bottom-right')

    // 7. El borrador no se ve: la web sigue con lo publicado (de partida).
    {
      const { ctx, card } = await freshPage(browser)
      await expect(card.getByRole('heading', { name: 'Tu privacidad es importante' })).toBeVisible()
      await ctx.close()
    }
    expect((await (await a.get('/api/admin/site-consent')).json()).hasUnpublishedChanges).toBe(true)

    // 8. Publicar.
    const pub = await a.post('/api/admin/site-consent/publish')
    expect(pub.ok(), await pub.text()).toBeTruthy()
    expect((await (await anon.get('/api/public/site-consent')).json()).cookie.texts.es.title).toBe(TITLE)

    const { ctx, page, notice, card } = await freshPage(browser)
    // 9. Textos propios.
    await expect(card.getByRole('heading', { name: TITLE })).toBeVisible()
    await expect(notice.getByTestId('cookie-accept')).toHaveText('Aceptar todas')
    await expect(notice.getByTestId('cookie-reject')).toHaveText('Rechazar')
    // 10. Colores y forma: el botón principal con el color elegido; radio 8.
    expect(await notice.getByTestId('cookie-accept').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 78, 216)')
    expect(await card.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('8px')
    // 11. Posición abajo a la derecha, a 24 px de los bordes y con la anchura máxima.
    await expect(notice).toHaveAttribute('data-position', 'bottom-right')
    const box = (await card.boundingBox())!
    const { width: vw, height: vh } = page.viewportSize()!
    expect(Math.abs(vw - (box.x + box.width) - 24)).toBeLessThan(3)
    expect(Math.abs(vh - (box.y + box.height) - 24)).toBeLessThan(3)
    expect(box.width).toBeLessThanOrEqual(521)
    // 12. Logo dinámico y categorías sin descripción.
    await expect(notice.getByTestId('cookie-logo')).toHaveAttribute('src', '/placeholder.svg')
    await expect(notice.getByTestId('cookie-categories').locator('li').first()).toHaveText('Analíticas')
    await ctx.close()

    // 13. Otra empresa no lo ve: su aviso sigue siendo el de partida.
    const b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    const orgB = (await (await b.get('/api/admin/active-org-info')).json()).id
    expect(orgB).not.toBe(1)
    const publicB = await (await b.get(`/api/public/site-consent?vista_previa=${orgB}`)).json()
    expect(publicB.cookie.texts.es.title).toBe('')
    expect(publicB.cookie.layout.position).toBe('center')
    expect((await (await b.get('/api/admin/site-consent')).json()).config.cookie.texts.es.title).toBe('')
    await b.dispose()
  })

  test('14–18 · con el diseño propio, Configurar / Rechazar / Aceptar y las preferencias funcionan y se guardan; la decisión anterior sigue valiendo', async ({ browser }) => {
    // 14. Configurar → preferencias individuales → Guardar.
    {
      const { ctx, page, notice } = await freshPage(browser)
      await notice.getByTestId('cookie-configure').click()
      await expect(notice.getByTestId('cookie-settings')).toBeVisible()
      await expect(notice.getByTestId('cookie-toggle-analytics')).not.toBeChecked()
      await notice.getByTestId('cookie-toggle-thirdParty').check({ force: true })
      await notice.getByTestId('cookie-save').click()
      await expect(notice).toBeHidden()
      expect((await storedConsent(page)).c).toEqual({ analytics: false, thirdParty: true, marketing: false })
      // 15. Persistencia: no vuelve a salir; 16. reapertura desde el pie con el estado real y la X.
      await page.reload()
      await expect(page.getByTestId('cookie-consent')).toHaveCount(0)
      await page.getByTestId('footer-cookie-settings').click()
      const reopened = page.getByTestId('cookie-consent')
      await expect(reopened.getByTestId('cookie-settings')).toBeVisible()
      await expect(reopened.getByTestId('cookie-toggle-thirdParty')).toBeChecked()
      await expect(reopened.getByTestId('cookie-close')).toBeVisible()
      await reopened.getByTestId('cookie-close').click()
      await expect(reopened).toBeHidden()
      await ctx.close()
    }
    // 17. Rechazar y Aceptar.
    {
      const { ctx, page, notice } = await freshPage(browser)
      await notice.getByTestId('cookie-reject').click()
      await expect(notice).toBeHidden()
      expect((await storedConsent(page)).c).toEqual(allChoices(false))
      await ctx.close()
    }
    {
      const { ctx, page, notice } = await freshPage(browser)
      await notice.getByTestId('cookie-accept').click()
      await expect(notice).toBeHidden()
      expect((await storedConsent(page)).c).toEqual({ analytics: true, thirdParty: true, marketing: false })
      await ctx.close()
    }
    // 18. Compatibilidad: quien decidió antes del rediseño no vuelve a ver el aviso (la versión del consentimiento no cambia con la presentación).
    {
      const providers = (await (await anon.get('/api/public/tenant')).json()).cookies ?? NO_COOKIE_PROVIDERS
      const ctx = await browser.newContext({
        storageState: { cookies: [], origins: [{ origin: BASE_URL, localStorage: [{ name: consentStorageKey(false), value: JSON.stringify(buildConsent(1, providers, allChoices(false))) }] }] },
      })
      const page = await ctx.newPage()
      await page.goto(PUBLIC_PAGE)
      await expect(page.getByTestId('site-footer')).toBeVisible()
      await expect(page.getByTestId('cookie-consent')).toHaveCount(0)
      await ctx.close()
    }
  })

  test('19–24 · en el Constructor: «Privacidad y cookies» abre el inspector (Contenido / Diseño / Avanzado), la muestra cambia en vivo, estados, móvil y Publicar', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STATE_A, viewport: { width: 1600, height: 1000 } })
    const page = await ctx.newPage()
    await page.goto('/admin/site-builder')
    const canvas = page.frameLocator(CANVAS)
    // El envoltorio de la cabecera fija mide 0 px: se espera al logo de dentro, como en site-builder.spec.
    await expect(canvas.locator('[data-sb-zone="header"] a[href="/"]').first()).toBeVisible({ timeout: 20_000 })
    // La sesión de pruebas ya lleva una decisión guardada (global-setup): la muestra no debe tocarla.
    const storedBefore = await canvas.locator('body').evaluate(() => localStorage.getItem('inmo_cookie_consent'))

    // 19. Configuración global → Privacidad y cookies → inspector con pestañas y la muestra abierta en el lienzo.
    await page.getByTestId('open-cookie-settings').click()
    await expect(page.getByTestId('cookie-settings-panel')).toBeVisible()
    await page.getByTestId('cookie-settings-design').click()
    await expect(page.getByTestId('cookie-inspector')).toBeVisible()
    await expect(page.getByTestId('inspector-title')).toHaveText('Aviso de cookies')
    const tabs = page.getByTestId('footer-inspector-tabs')
    await expect(tabs.getByRole('button')).toHaveText(['Contenido', 'Diseño', 'Avanzado'])
    const sample = canvas.getByTestId('cookie-consent')
    await expect(sample).toBeVisible()
    await expect(sample.getByRole('heading', { name: TITLE })).toBeVisible()

    // 20. Vista previa en tiempo real: el título y el color cambian al momento, sin registrar consentimiento.
    const draftTitle = `Aviso del lienzo ${RUN}`
    await page.getByTestId('cookie-text-title').locator('input').fill(draftTitle)
    await expect(sample.getByRole('heading', { name: draftTitle })).toBeVisible()
    await tabs.getByRole('button', { name: 'Diseño' }).click()
    await expect(page.getByTestId('cookie-color-accent')).toBeVisible()
    await page.getByTestId('cookie-radius').locator('input[type="range"]').evaluate((el) => {
      const input = el as HTMLInputElement
      input.value = '0'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect.poll(() => sample.getByRole('dialog').evaluate((el) => getComputedStyle(el).borderRadius)).toBe('0px')
    // Rechazar en la muestra la cierra, pero no registra ninguna decisión.
    await sample.getByTestId('cookie-reject').click()
    await expect(sample).toBeHidden()
    expect(await canvas.locator('body').evaluate(() => localStorage.getItem('inmo_cookie_consent'))).toBe(storedBefore)

    // 21. Estados de la muestra: inicial, preferencias, guardado.
    await page.getByTestId('cookie-preview-settings').click()
    await expect(sample.getByTestId('cookie-settings')).toBeVisible()
    await expect(sample.getByTestId('cookie-close')).toBeVisible()
    await page.getByTestId('cookie-preview-saved').click()
    await expect(sample.getByTestId('cookie-toggle-analytics')).toBeChecked()
    await page.getByTestId('cookie-preview-summary').click()
    await expect(sample.getByTestId('cookie-accept')).toBeVisible()

    // 22. Avanzado: posición → la muestra la refleja.
    await tabs.getByRole('button', { name: 'Avanzado' }).click()
    await page.getByTestId('cookie-position').locator('select').selectOption('bottom')
    await expect(sample).toHaveAttribute('data-position', 'bottom')
    await page.getByTestId('cookie-position').locator('select').selectOption('center')
    await expect(sample).toHaveAttribute('data-position', 'center')

    // 23. Móvil en el lienzo: hoja a todo el ancho del dispositivo.
    await page.getByTitle('Móvil').click()
    await expect.poll(async () => (await sample.getByRole('dialog').boundingBox())?.width ?? 0).toBeLessThan(420)
    await page.getByTitle('Escritorio').click()

    // 24. Autoguardado del borrador y «Publicar» → la web.
    await expect.poll(async () => (await (await a.get('/api/admin/site-consent')).json()).config.cookie.texts.es.title, { timeout: 10_000 }).toBe(draftTitle)
    expect((await (await anon.get('/api/public/site-consent')).json()).cookie.texts.es.title).toBe(TITLE)
    const before = (await (await a.get('/api/admin/site-consent')).json()).version
    await page.getByRole('button', { name: /Publicar/ }).click()
    await expect.poll(async () => (await (await a.get('/api/admin/site-consent')).json()).version, { timeout: 15_000 }).toBe(before + 1)
    const pub = (await (await anon.get('/api/public/site-consent')).json()).cookie
    expect(pub.texts.es.title).toBe(draftTitle)
    expect(pub.design.radius).toBe(0)
    await ctx.close()
  })

  test('25–26 · aviso de demostración: no sale en una web que no es demo; en el Constructor se configura con su muestra', async ({ browser }) => {
    // 25. Esta empresa no es una demo: en su web no hay aviso, esté como esté configurado.
    {
      const { ctx, page, notice } = await freshPage(browser)
      await notice.getByTestId('cookie-reject').click()
      await expect(page.getByTestId('site-footer')).toBeVisible()
      await expect(page.getByTestId('demo-notice')).toHaveCount(0)
      await ctx.close()
    }
    // 26. Constructor → Avisos y demostración: inspector, muestra, textos, posición, cierre.
    const ctx = await browser.newContext({ storageState: STATE_A, viewport: { width: 1600, height: 1000 } })
    const page = await ctx.newPage()
    await page.goto('/admin/site-builder')
    const canvas = page.frameLocator(CANVAS)
    // El envoltorio de la cabecera fija mide 0 px: se espera al logo de dentro, como en site-builder.spec.
    await expect(canvas.locator('[data-sb-zone="header"] a[href="/"]').first()).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('open-cookie-settings').click()
    await page.getByTestId('cookie-settings-demo').click()
    await expect(page.getByTestId('demo-inspector')).toBeVisible()
    await expect(page.getByTestId('inspector-title')).toHaveText('Aviso de demostración')
    const sample = canvas.getByTestId('demo-notice')
    await expect(sample).toBeVisible()
    await expect(sample.getByTestId('demo-notice-title')).toHaveText('Entorno de demostración')
    await expect(sample).toContainText('no se envían fuera de la plataforma')
    // Debajo de la cabecera, no encima.
    const header = (await canvas.locator('header').first().boundingBox())!
    const box = (await sample.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(header.y + header.height)
    await page.getByTestId('demo-text-title').locator('input').fill(`Demo ${RUN}`)
    await expect(sample.getByTestId('demo-notice-title')).toHaveText(`Demo ${RUN}`)
    await page.getByTestId('footer-inspector-tabs').getByRole('button', { name: 'Avanzado' }).click()
    await page.getByTestId('demo-position').locator('select').selectOption('bottom-right')
    await expect(sample).toHaveAttribute('data-position', 'bottom-right')
    await sample.getByTestId('demo-notice-close').click()
    await expect(sample).toBeHidden()
    // Desactivar y volver a activar lo enseña de nuevo (la muestra no recuerda el cierre).
    await page.getByTestId('footer-inspector-tabs').getByRole('button', { name: 'Contenido' }).click()
    const enabled = page.getByTestId('demo-enabled').getByRole('switch')
    await enabled.click()
    await expect(enabled).toHaveAttribute('aria-checked', 'false')
    await enabled.click()
    await expect(enabled).toHaveAttribute('aria-checked', 'true')
    await expect(sample).toBeVisible()
    await expect.poll(async () => (await (await a.get('/api/admin/site-consent')).json()).config.demo.position, { timeout: 10_000 }).toBe('bottom-right')
    await ctx.close()
  })

  test('27–28 · responsive y accesibilidad: móvil (hoja abajo, sin desbordes, botones apilados), tableta y «reducir movimiento»', async ({ browser }) => {
    // 27. Móvil.
    {
      const { ctx, page, notice, card } = await freshPage(browser, 390, 800)
      const box = (await card.boundingBox())!
      expect(box.width).toBeLessThanOrEqual(390)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      const accept = (await notice.getByTestId('cookie-accept').boundingBox())!
      const reject = (await notice.getByTestId('cookie-reject').boundingBox())!
      const configure = (await notice.getByTestId('cookie-configure').boundingBox())!
      expect(accept.y).toBeLessThan(reject.y)
      expect(reject.y).toBeLessThan(configure.y)
      expect(accept.height).toBeGreaterThanOrEqual(44)
      expect(Math.abs(accept.width - reject.width)).toBeLessThan(2)
      // Anclado abajo.
      expect(Math.abs(800 - (box.y + box.height) - 24)).toBeLessThan(4)
      await ctx.close()
    }
    // 28. Tableta: centrado y sin pasar de la anchura máxima; «reducir movimiento» no impide verlo.
    {
      const { ctx, card } = await freshPage(browser, 820, 1100)
      const box = (await card.boundingBox())!
      expect(box.width).toBeLessThanOrEqual(680)
      expect(Math.abs(box.x + box.width / 2 - 410)).toBeLessThan(20)
      await ctx.close()
    }
    {
      const { ctx, notice } = await freshPage(browser, 1440, 900, { reducedMotion: 'reduce' })
      await expect(notice.getByTestId('cookie-accept')).toBeVisible()
      await ctx.close()
    }
  })
})
