import { test, expect, request as pwRequest, type Page } from '@playwright/test'
import { ANON_STATE, STATE_A, STATE_B } from './global-setup'
import { LANDING_CRM, LANDING_FAQ, LANDING_FEATURES, LANDING_FORBIDDEN_CLAIMS, LANDING_MODULES, LANDING_NAV, LANDING_REQUEST, LANDING_STEPS } from '../../utils/landing'

/**
 * Landing comercial de INMO (pages/index.vue en el host principal,
 * components/landing/*, utils/landing.ts, docs/landing.md): rediseño
 * «Experiencia premium». La página vende sólo lo que la plataforma hace, da
 * protagonismo al Constructor Web y al CRM con sus vistas interactivas, usa
 * fotografía de propiedades de lujo y de equipo, presenta las funcionalidades
 * en desplegables, lleva al registro y al acceso reales, y la solicitud de
 * demo se guarda en la plataforma, confirma por correo y aparece en la bandeja
 * del super admin.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const MOCK_URL = process.env.E2E_PROVIDER_MOCK_URL || 'http://127.0.0.1:8799'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

/** Cada bloque de peticiones con su IP: el límite de tasa del formulario es por IP. */
function ip(n: number) {
  return { 'cf-connecting-ip': `198.51.100.${(n + (Date.now() % 50)) % 250}` }
}
async function emailsTo(address: string): Promise<any[]> {
  const all = (await (await fetch(`${MOCK_URL}/__requests`)).json()) as any[]
  return all.filter((r) => r.method === 'POST' && r.path === '/emails' && String(r.body?.to).toLowerCase() === address.toLowerCase()).map((r) => r.body)
}
/** Abre una ruta y acepta el aviso de cookies si aparece (el host principal es también la web de la empresa 1), para que no tape nada. */
async function open(page: Page, path = '/') {
  await page.goto(path)
  const accept = page.getByTestId('cookie-accept')
  if (await accept.isVisible().catch(() => false)) await accept.click()
}
async function noOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
  expect(scrollWidth, `desborde horizontal: ${scrollWidth} > ${innerWidth}`).toBeLessThanOrEqual(innerWidth)
}
const demoBody = (n: number, extra: Record<string, unknown> = {}) => ({
  name: `Lucía Prueba ${n}`,
  email: `demo-${RUN}-${n}@ejemplo.com`,
  company: `Inmobiliaria Prueba ${RUN}`,
  consent: true,
  teamSize: '2-5',
  interest: 'web',
  locale: 'es',
  ...extra,
})

test.describe('Landing comercial de INMO', () => {
  test.use({ storageState: ANON_STATE })

  test('1 · cabecera: marca, cuatro secciones del menú, acceso y «Solicitar demo»', async ({ page }) => {
    await open(page)
    const header = page.getByTestId('landing-header')
    await expect(header).toBeVisible()
    await expect(header.getByRole('link', { name: 'INMO, inicio' })).toBeVisible()
    for (const item of LANDING_NAV) await expect(header.locator(`nav a[href="${item.href}"]`)).toHaveText(item.label)
    await expect(page.getByTestId('landing-login')).toHaveAttribute('href', '/admin/login')
    await expect(page.getByTestId('landing-demo')).toHaveAttribute('href', '#solicitar-demo')
  })

  test('2 · hero: sin antetítulo, titular en tres líneas con acento, subtítulo y las dos acciones', async ({ page }) => {
    await open(page)
    const hero = page.getByTestId('landing-hero')
    await expect(hero.locator('.lp-eyebrow')).toHaveCount(0)
    await expect(hero.locator('h1')).toContainText('Tu inmobiliaria')
    await expect(hero.locator('h1')).toContainText('Otro nivel')
    await expect(hero.locator('h1 em')).toHaveText('Otro nivel.')
    await expect(hero.locator('.lp-hero-lede')).toContainText('Una web que atrae y un CRM que conecta')
    await expect(page.getByTestId('landing-hero-demo')).toHaveAttribute('href', '#solicitar-demo')
    await expect(page.getByTestId('landing-hero-register')).toHaveAttribute('href', '/registro-empresa')
  })

  test('3 · hero: la primera foto de lujo carga, es la única prioritaria y la galería tiene tres', async ({ page }) => {
    await open(page)
    const hero = page.getByTestId('landing-hero')
    const imgs = hero.locator('.lp-photo-stack img')
    await expect(imgs).toHaveCount(3)
    const first = imgs.first()
    await expect(first).toHaveAttribute('loading', 'eager')
    await expect(first).toHaveAttribute('fetchpriority', 'high')
    await expect(first).toHaveAttribute('src', '/landing/villa.webp')
    await expect.poll(() => first.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0)
    expect(await page.locator('.sa-landing img[fetchpriority="high"]').count()).toBe(1)
  })

  test('4 · la galería del hero se puede pausar y cambiar con los puntos', async ({ page }) => {
    await open(page)
    const hero = page.getByTestId('landing-hero')
    const dots = hero.locator('.lp-photo-dot')
    await expect(dots).toHaveCount(3)
    await dots.nth(1).click()
    await expect(dots.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await expect(hero.locator('.lp-photo-stack img').nth(1)).toHaveClass(/is-active/)
  })

  test('5 · la cabecera se vuelve sólida al bajar', async ({ page }) => {
    await open(page)
    const header = page.getByTestId('landing-header')
    await expect(header).not.toHaveClass(/is-solid/)
    await page.mouse.wheel(0, 600)
    await expect(header).toHaveClass(/is-solid/)
  })

  test('6 · cinta de módulos: cuatro enlaces, cada uno hacia una sección que existe', async ({ page }) => {
    await open(page)
    const links = page.getByTestId('landing-modules').locator('.lp-strip-link')
    await expect(links).toHaveCount(4)
    for (const m of LANDING_MODULES) {
      const link = page.getByTestId(`landing-module-${m.key}`)
      await expect(link).toContainText(m.label)
      await expect(link).toHaveAttribute('href', m.href)
      await expect(page.locator(m.href)).toHaveCount(1)
    }
  })

  test('7 · Constructor Web: pestañas Editor visual | Web publicada cambian la captura', async ({ page }) => {
    await open(page)
    await page.getByTestId('landing-builder').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('landing-builder-tab-editor')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('landing-builder-shot')).toHaveAttribute('data-shot', 'constructor')
    await page.getByTestId('landing-builder-tab-web').click()
    await expect(page.getByTestId('landing-builder-tab-web')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('landing-builder-shot')).toHaveAttribute('data-shot', 'web-portada')
    await expect(page.getByTestId('landing-builder-shot').locator('img')).toHaveAttribute('src', '/landing/web-portada.webp')
  })

  test('8 · las pestañas del Constructor responden al teclado (flechas)', async ({ page }) => {
    await open(page)
    await page.getByTestId('landing-builder-tab-editor').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('landing-builder-shot')).toHaveAttribute('data-shot', 'web-portada')
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByTestId('landing-builder-shot')).toHaveAttribute('data-shot', 'constructor')
  })

  test('9 · CRM: captura real de leads y microdemo de tres pasos; al pulsar uno, queda activo', async ({ page }) => {
    await open(page)
    const crm = page.getByTestId('landing-crm')
    await expect(crm.locator('.lp-crm-screen img')).toHaveAttribute('src', '/landing/crm.webp')
    const steps = page.getByTestId('landing-crm-flow').locator('.lp-crm-step')
    await expect(steps).toHaveCount(LANDING_CRM.steps.length)
    await expect(steps.nth(0)).toContainText('Recibe la consulta')
    await page.getByTestId('landing-crm-step-2').click()
    await expect(page.getByTestId('landing-crm-step-2')).toHaveAttribute('data-active', 'true')
    await expect(crm.locator('.lp-crm-desc')).toContainText('regla de reparto')
  })

  test('10 · la microdemo del CRM avanza sola', async ({ page }) => {
    await open(page)
    await page.getByTestId('landing-crm-flow').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('landing-crm-step-1')).toHaveAttribute('data-active', 'true')
    await expect(page.getByTestId('landing-crm-step-2')).toHaveAttribute('data-active', 'true', { timeout: 6000 })
  })

  test('11 · Propiedades: galería de tres fotos de lujo, seis puntos y aviso de fotografía de ambiente', async ({ page }) => {
    await open(page)
    const section = page.getByTestId('landing-properties')
    await expect(section.locator('.lp-gallery figure')).toHaveCount(3)
    await expect(section.locator('.lp-gallery img').first()).toHaveAttribute('src', '/landing/villa.webp')
    await expect(section.locator('.lp-chips li')).toHaveCount(6)
    await expect(section.locator('.lp-chips')).toContainText('Obra nueva y segunda mano')
    await expect(section.locator('.lp-footnote')).toContainText('Fotografía de ambiente')
  })

  test('12 · Equipo: sección con fotografía profesional y enlace al CRM', async ({ page }) => {
    await open(page)
    const team = page.getByTestId('landing-team')
    await expect(team.locator('img').first()).toHaveAttribute('src', '/landing/equipo.webp')
    await expect(team.getByRole('link')).toHaveAttribute('href', '#crm')
  })

  test('13 · Cómo funciona: seis pasos; elegir uno cambia la pantalla', async ({ page }) => {
    await open(page)
    const how = page.getByTestId('landing-how')
    await expect(how.locator('.lp-journey-tab')).toHaveCount(6)
    for (const step of LANDING_STEPS) await expect(page.getByTestId(`landing-step-${step.key}`)).toContainText(step.title)
    await expect(page.getByTestId('landing-how-shot')).toHaveAttribute('data-shot', 'propiedad-panel')
    await page.getByTestId('landing-step-contact').click()
    await expect(page.getByTestId('landing-step-contact')).toHaveAttribute('data-active', 'true')
    await expect(page.getByTestId('landing-how-shot')).toHaveAttribute('data-shot', 'crm')
  })

  test('14 · Funcionalidades: ocho áreas en desplegables, con estados honestos y «Próximamente» en los portales', async ({ page }) => {
    await open(page)
    const section = page.getByTestId('landing-features')
    await expect(section.locator('details.lp-feature-group')).toHaveCount(LANDING_FEATURES.length)
    expect(LANDING_FEATURES.length).toBe(8)
    const items = section.locator('.lp-feature-list li')
    expect(await items.count()).toBe(LANDING_FEATURES.reduce((s, g) => s + g.items.length, 0))
    expect(await items.count()).toBeGreaterThanOrEqual(35)
    const portals = page.getByTestId('landing-feature-group-web').locator('li[data-state="soon"]')
    await expect(portals).toHaveCount(1)
    await expect(portals).toContainText('Próximamente')
    await expect(page.getByTestId('landing-feature-group-intelligence').locator('li[data-state="with-ai"]').first()).toContainText('Con IA activada')
    await expect(section).toContainText(`en ${LANDING_FEATURES.length} áreas`)
    // Un desplegable cerrado se abre al pulsarlo.
    const data = page.getByTestId('landing-feature-group-data')
    await expect(data).not.toHaveAttribute('open', '')
    await data.locator('summary').click()
    await expect(data).toHaveAttribute('open', '')
  })

  test('15 · formulario de demo: valida antes de enviar y enfoca el primer campo con error', async ({ page }) => {
    await open(page, '/#solicitar-demo')
    await page.getByTestId('landing-demo-submit').click()
    await expect(page.getByTestId('landing-demo-name')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('landing-demo-email')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('landing-demo-company')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('landing-demo-consent')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('landing-demo-name')).toBeFocused()
    await expect(page.getByTestId('landing-demo-success')).toHaveCount(0)
    await page.getByTestId('landing-demo-phone').fill('abc')
    await page.getByTestId('landing-demo-submit').click()
    await expect(page.getByTestId('landing-demo-phone')).toHaveAttribute('aria-invalid', 'true')
  })

  test('16 · formulario de demo: un envío real se guarda, confirma por correo y avisa al super admin', async ({ page }) => {
    const email = `lucia-${RUN}@ejemplo.com`
    await open(page, '/#solicitar-demo')
    await page.getByTestId('landing-demo-name').fill('Lucía Martín')
    await page.getByTestId('landing-demo-email').fill(email)
    await page.getByTestId('landing-demo-company').fill(`Inmobiliaria Prueba ${RUN}`)
    await page.getByTestId('landing-demo-phone').fill('+34 600 000 000')
    await page.getByTestId('landing-demo-team').selectOption('6-15')
    await page.getByTestId('landing-demo-interest').selectOption('crm')
    await page.getByTestId('landing-demo-message').fill('Tenemos dos oficinas y queremos ordenar las consultas.')
    await page.getByTestId('landing-demo-consent').check()
    await page.getByTestId('landing-demo-submit').click()
    const ok = page.getByTestId('landing-demo-success')
    await expect(ok).toBeVisible()
    await expect(ok).toContainText('Solicitud recibida')
    await expect(ok).toContainText(email)
    await expect(page.getByTestId('landing-demo-email-status')).toHaveAttribute('data-status', /sent|queued/)

    // Confirmación a la persona y aviso al super admin, los dos como Portal INMO.
    await expect.poll(async () => (await emailsTo(email)).length).toBeGreaterThan(0)
    const [confirmation] = await emailsTo(email)
    // En el idioma de quien escribe (useVisitorLanguage): el navegador de la prueba va en inglés.
    expect(confirmation.subject).toMatch(/Hemos recibido tu solicitud de demo — Portal INMO|We have received your demo request — Portal INMO/)
    expect(String(confirmation.from)).toContain('info@serendipiaagency.com')
    expect(confirmation.html).not.toMatch(/contraseña|password/i)
    const adminMails = await emailsTo('admin@sa-inmobiliaria.com')
    const notice = adminMails.find((m) => String(m.subject).includes(`Nueva solicitud de demo: Inmobiliaria Prueba ${RUN}`))
    expect(notice, 'aviso al super admin').toBeTruthy()
    expect(notice.html).toContain('6 a 15 personas')
    expect(notice.html).toContain('Organizar contactos y consultas')

    // Está en la bandeja del super admin, con su consentimiento; y no es un lead de ninguna empresa.
    const owner = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const inbox = await (await owner.get('/api/admin/demo-requests', { params: { q: email } })).json()
    expect(inbox.rows).toHaveLength(1)
    expect(inbox.rows[0]).toMatchObject({ name: 'Lucía Martín', email, teamSize: '6-15', interest: 'crm', status: 'new', phone: '+34 600 000 000' })
    expect(inbox.rows[0].consentAt).toBeTruthy()
    const leads = await (await owner.get('/api/admin/leads', { params: { q: email } })).json()
    expect(JSON.stringify(leads)).not.toContain(email)
    await owner.dispose()
  })

  test('17 · API: el campo trampa responde ok sin guardar nada', async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: ip(17) })
    const res = await ctx.post('/api/public/demo-request', { data: demoBody(17, { website: 'http://spam.example' }) })
    expect(res.ok()).toBeTruthy()
    const owner = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const inbox = await (await owner.get('/api/admin/demo-requests', { params: { q: `demo-${RUN}-17` } })).json()
    expect(inbox.rows).toHaveLength(0)
    await owner.dispose()
    await ctx.dispose()
  })

  test('18 · API: el mismo submissionId dos veces crea una sola solicitud', async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: ip(18) })
    const submissionId = `e2e-${RUN}-dup`
    const first = await (await ctx.post('/api/public/demo-request', { data: demoBody(18, { submissionId }) })).json()
    const second = await (await ctx.post('/api/public/demo-request', { data: demoBody(18, { submissionId }) })).json()
    expect(first.ok).toBe(true)
    expect(first.duplicate).toBeFalsy()
    expect(second).toMatchObject({ ok: true, duplicate: true })
    const owner = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const inbox = await (await owner.get('/api/admin/demo-requests', { params: { q: `demo-${RUN}-18` } })).json()
    expect(inbox.rows).toHaveLength(1)
    await owner.dispose()
    await ctx.dispose()
  })

  test('19 · API: sin consentimiento, sin nombre o con email inválido → 422 con el motivo', async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: ip(19) })
    const noConsent = await ctx.post('/api/public/demo-request', { data: demoBody(19, { consent: false }) })
    expect(noConsent.status()).toBe(422)
    expect(await noConsent.text()).toContain('permiso')
    const noName = await ctx.post('/api/public/demo-request', { data: demoBody(19, { name: ' ' }) })
    expect(noName.status()).toBe(422)
    const badEmail = await ctx.post('/api/public/demo-request', { data: demoBody(19, { email: 'no-es-un-correo' }) })
    expect(badEmail.status()).toBe(422)
    await ctx.dispose()
  })

  test('20 · API: límite de tasa por IP (5 cada 10 minutos) → 429 con Retry-After', async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'cf-connecting-ip': `203.0.113.${(Date.now() % 200) + 30}` } })
    let last = 0
    for (let i = 0; i < 6; i++) {
      const res = await ctx.post('/api/public/demo-request', { data: demoBody(200 + i) })
      last = res.status()
      if (last === 429) {
        expect(res.headers()['retry-after']).toBeTruthy()
        break
      }
    }
    expect(last).toBe(429)
    await ctx.dispose()
  })

  test('21 · bandeja del super admin: filtros, estado, notas y borrado; un admin de empresa recibe 403', async ({ browser }) => {
    const owner = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A, extraHTTPHeaders: ip(21) })
    const created = await (await owner.post('/api/public/demo-request', { data: demoBody(21) })).json()
    expect(created.id).toBeGreaterThan(0)

    const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const page = await ctx.newPage()
    await page.goto('/admin/solicitudes-demo')
    await expect(page.getByRole('heading', { name: 'Solicitudes de demo' })).toBeVisible()
    await page.getByTestId('demo-requests-search').fill(`demo-${RUN}-21`)
    const row = page.getByTestId(`demo-request-row-${created.id}`)
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute('data-status', 'new')
    await expect(row).toContainText('2 a 5 personas')

    await page.getByTestId(`demo-request-status-${created.id}`).selectOption('contacted')
    await expect(row).toHaveAttribute('data-status', 'contacted')
    await page.getByTestId(`demo-request-open-${created.id}`).click()
    await page.getByTestId(`demo-request-notes-${created.id}`).fill('Llamada el lunes a las 10.')
    await page.getByTestId(`demo-request-save-notes-${created.id}`).click()
    await expect.poll(async () => {
      const inbox = await (await owner.get('/api/admin/demo-requests', { params: { q: `demo-${RUN}-21` } })).json()
      return inbox.rows[0]?.notes
    }).toBe('Llamada el lunes a las 10.')
    await page.getByTestId('demo-requests-filter-contacted').click()
    await expect(row).toBeVisible()
    await page.getByTestId('demo-requests-filter-new').click()
    await expect(page.getByTestId(`demo-request-row-${created.id}`)).toHaveCount(0)

    page.once('dialog', (d) => d.accept())
    await page.getByTestId('demo-requests-filter-contacted').click()
    await expect(row).toBeVisible()
    // El detalle sigue abierto de antes (openId se conserva); si no, se abre.
    const del = page.getByTestId(`demo-request-delete-${created.id}`)
    if (!(await del.isVisible().catch(() => false))) await page.getByTestId(`demo-request-open-${created.id}`).click()
    await del.click()
    await expect(page.getByTestId(`demo-request-row-${created.id}`)).toHaveCount(0)
    await expect.poll(async () => (await (await owner.get('/api/admin/demo-requests', { params: { q: `demo-${RUN}-21` } })).json()).rows.length).toBe(0)

    // Un admin de empresa no ve la entrada ni puede leer la bandeja.
    const tenantB = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    expect((await tenantB.get('/api/admin/demo-requests')).status()).toBe(403)
    expect((await tenantB.patch('/api/admin/demo-requests', { data: { id: 1, status: 'closed' } })).status()).toBe(403)
    const ctxB = await browser.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    const pageB = await ctxB.newPage()
    await pageB.goto('/admin')
    await expect(pageB.locator('aside').getByRole('link', { name: 'Solicitudes de demo', exact: true })).toHaveCount(0)
    await ctxB.close()
    await tenantB.dispose()
    await ctx.close()
    await owner.dispose()
  })

  test('23 · FAQ: diez preguntas; la primera abierta, las demás se abren al pulsar', async ({ page }) => {
    await open(page)
    const items = page.getByTestId('landing-faq').locator('details')
    await expect(items).toHaveCount(10)
    for (let i = 0; i < LANDING_FAQ.length; i++) await expect(items.nth(i).locator('summary')).toContainText(LANDING_FAQ[i].q)
    await expect(items.nth(0)).toHaveAttribute('open', '')
    await expect(items.nth(1)).not.toHaveAttribute('open', '')
    await items.nth(1).locator('summary').click()
    await expect(items.nth(1)).toHaveAttribute('open', '')
    await expect(items.nth(1).locator('p')).toBeVisible()
  })

  test('24 · cierre: «Tu próxima etapa empieza aquí» con el formulario y el registro', async ({ page }) => {
    await open(page)
    const contact = page.getByTestId('landing-demo-section')
    await expect(contact.locator('h2')).toContainText('Tu próxima etapa')
    await expect(contact.getByTestId('landing-demo-form')).toBeVisible()
    await expect(contact.getByRole('link', { name: /crea tu inmobiliaria/i })).toHaveAttribute('href', '/registro-empresa')
  })

  test('25 · pie de INMO: cuatro columnas, acceso, contacto, legales y el año', async ({ page }) => {
    await open(page)
    const footer = page.getByTestId('landing-footer')
    await expect(footer.locator('nav')).toHaveCount(4)
    await expect(footer.getByRole('link', { name: 'Acceder' })).toHaveAttribute('href', '/admin/login')
    await expect(footer.getByRole('link', { name: 'Crear mi inmobiliaria' })).toHaveAttribute('href', '/registro-empresa')
    await expect(footer.getByRole('link', { name: 'info@serendipiaagency.com' })).toHaveAttribute('href', 'mailto:info@serendipiaagency.com')
    for (const legal of ['/privacidad', '/terminos', '/cookies']) await expect(footer.locator(`a[href="${legal}"]`)).toHaveCount(1)
    await expect(footer).toContainText(`© ${new Date().getFullYear()} INMO`)
  })

  test('26 · «Crear mi inmobiliaria» abre el registro real, con su formulario y validaciones intactas', async ({ page }) => {
    await open(page)
    await page.getByTestId('landing-hero-register').click()
    await expect(page).toHaveURL(/\/registro-empresa$/)
    await expect(page.getByTestId('register-form')).toBeVisible()
    await page.getByTestId('register-submit').click()
    await expect(page.getByTestId('register-form').locator('[aria-invalid="true"]').first()).toBeVisible()
  })

  test('27 · «Acceder» abre el acceso del panel', async ({ page }) => {
    await open(page)
    await page.getByTestId('landing-login').click()
    await expect(page).toHaveURL(/\/admin\/login/)
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('28 · «Solicitar demo» de la cabecera baja hasta el formulario', async ({ page }) => {
    await open(page)
    await page.getByTestId('landing-demo').click()
    await expect(page).toHaveURL(/#solicitar-demo$/)
    await expect(page.getByTestId('landing-demo-form')).toBeInViewport()
  })

  test('29 · SEO: título, descripción, canónica, Open Graph, idioma y datos estructurados', async ({ page }) => {
    await open(page)
    await expect(page).toHaveTitle('INMO — Tu inmobiliaria, a otro nivel')
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Una web que atrae y un CRM que conecta/)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${BASE_URL}/`)
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${BASE_URL}/landing/panel.webp`)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'INMO — Tu inmobiliaria, a otro nivel')
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) || '[]')
    expect(ld.map((x: any) => x['@type'])).toEqual(['SoftwareApplication', 'FAQPage'])
    expect(ld[1].mainEntity).toHaveLength(10)
    expect(JSON.stringify(ld)).not.toMatch(/"price"/)
  })

  test('30 · accesibilidad básica: un único h1, secciones con título y pestañas con roles', async ({ page }) => {
    await open(page)
    expect(await page.locator('.sa-landing h1').count()).toBe(1)
    for (const id of ['producto', 'constructor-web', 'crm', 'propiedades', 'funcionalidades', 'como-funciona', 'faq', 'contacto']) {
      await expect(page.locator(`#${id} h2`).first()).toBeVisible()
    }
    expect(await page.locator('[role="tablist"]').count()).toBe(2)
    await expect(page.getByTestId('landing-menu')).toHaveAttribute('aria-label', /menú/i)
  })

  test('31 · móvil (390 px): sin desbordes, menú hamburguesa con las acciones y formulario en una columna', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: ANON_STATE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    await open(page)
    await noOverflow(page)
    await expect(page.getByTestId('landing-header').locator('nav.lp-nav')).toBeHidden()
    await page.getByTestId('landing-menu').click()
    await expect(page.getByTestId('landing-mobile-nav')).toBeVisible()
    await expect(page.getByTestId('landing-register-company-mobile')).toHaveAttribute('href', '/registro-empresa')
    await page.getByTestId('landing-mobile-nav').locator('a[href="#crm"]').click()
    await expect(page.getByTestId('landing-mobile-nav')).toBeHidden()
    await page.getByTestId('landing-demo-form').scrollIntoViewIfNeeded()
    const name = await page.getByTestId('landing-demo-name').boundingBox()
    const email = await page.getByTestId('landing-demo-email').boundingBox()
    expect(name!.y).toBeLessThan(email!.y)
    expect(Math.abs(name!.x - email!.x)).toBeLessThan(2)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await noOverflow(page)
    await ctx.close()
  })

  test('32 · tablet (820 px): sin desbordes y las secciones clave visibles', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: ANON_STATE, viewport: { width: 820, height: 1180 } })
    const page = await ctx.newPage()
    await open(page)
    await noOverflow(page)
    await expect(page.getByTestId('landing-builder')).toBeVisible()
    await expect(page.getByTestId('landing-crm')).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await noOverflow(page)
    await ctx.close()
  })

  test('33 · imágenes: todas con alt y dimensiones; sólo la primera del hero es prioritaria y las demás en diferido', async ({ page }) => {
    await open(page)
    const imgs = page.locator('.sa-landing img')
    const count = await imgs.count()
    expect(count).toBeGreaterThanOrEqual(8)
    for (let i = 0; i < count; i++) {
      const img = imgs.nth(i)
      expect(await img.getAttribute('alt'), `alt de la imagen ${i}`).not.toBeNull()
      expect(Number(await img.getAttribute('width'))).toBeGreaterThan(0)
      expect(Number(await img.getAttribute('height'))).toBeGreaterThan(0)
      const src = await img.getAttribute('src')
      expect(src).toMatch(/^\/landing\/[a-z-]+\.webp$/)
      const res = await page.request.get(src!)
      expect(res.status(), src!).toBe(200)
      expect(res.headers()['content-type']).toContain('image/webp')
    }
    expect(await page.locator('.sa-landing img[loading="lazy"]').count()).toBe(count - 1)
  })

  test('34 · la landing antigua redirige (301) a la raíz y la nueva no promete lo que no hay', async ({ page, request }) => {
    const res = await request.get('/para-inmobiliarias', { maxRedirects: 0 })
    expect(res.status()).toBe(301)
    expect(res.headers()['location']).toBe('/')
    await open(page)
    const text = (await page.locator('.sa-landing').innerText()).toLowerCase()
    for (const claim of LANDING_FORBIDDEN_CLAIMS) expect(text, `no puede decir «${claim}»`).not.toContain(claim.toLowerCase())
    expect(text).not.toMatch(/\+\s?\d{2,}\s?(inmobiliarias|clientes)|confían en nosotros/)
  })

  test('35 · analítica: sólo si ya hay GA4; cada botón marcado envía su evento', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__events = []
      ;(window as any).gtag = (...args: unknown[]) => (window as any).__events.push(args)
    })
    await open(page)
    expect(await page.locator('[data-landing-event]').count()).toBeGreaterThanOrEqual(5)
    await page.getByTestId('landing-demo-submit').click() // el envío falla por validación: el clic ya cuenta
    await expect.poll(() => page.evaluate(() => (window as any).__events.map((e: unknown[]) => e[1]))).toContain('demo_request_submit')
    // Sin gtag no se carga ni se llama nada.
    await open(page)
    await page.evaluate(() => delete (window as any).gtag)
    await page.getByTestId('landing-demo-submit').click()
    expect(await page.evaluate(() => document.querySelector('script[src*="googletagmanager"]'))).toBeNull()
  })

  test('37 · bloque de solicitud: tres pasos legibles, firma con correo y formulario con cabecera honesta', async ({ page }) => {
    await open(page, '/#solicitar-demo')
    const req = page.getByTestId('landing-request')
    await expect(req.locator('.lp-eyebrow')).toHaveCount(0)
    await expect(req.locator('h2').first()).toContainText('Tu próxima etapa')
    const steps = page.getByTestId('landing-request-steps').locator('li')
    await expect(steps).toHaveCount(3)
    // Cada texto de paso cabe en una o dos líneas: nada de una palabra por línea.
    for (let i = 0; i < 3; i++) {
      const p = steps.nth(i).locator('p')
      const box = await p.boundingBox()
      expect(box!.width).toBeGreaterThan(160)
      expect(box!.height).toBeLessThan(70)
    }
    await expect(page.getByTestId('landing-request-signature')).toContainText(LANDING_REQUEST.signature.email)
    await expect(page.getByTestId('landing-request-badge')).toHaveText(LANDING_REQUEST.form.badge)
    await expect(page.getByTestId('landing-demo-form')).toContainText(LANDING_REQUEST.form.title)
    await expect(page.getByTestId('landing-demo-submit')).toContainText(LANDING_REQUEST.form.submit)
    const foot = await page.getByTestId('landing-request-footnote').innerText()
    expect(foot.toLowerCase()).not.toContain('tarjeta')
    expect(foot).toBe(LANDING_REQUEST.form.footnote)
  })
})
