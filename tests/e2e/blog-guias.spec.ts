import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Blog editorial y guías de compra (megaprompt blog Norte Astur): en el host
 * principal (organización por defecto) las seis guías se publican solas la
 * primera vez que se pide el blog (server/utils/blog/buyerGuides.ts), con el
 * listado rediseñado (destacado + rejilla), la ficha editorial (migas, índice
 * fijo, progreso, portada 16:9, BlogPosting + BreadcrumbList, relacionados) y
 * los bloques interactivos funcionando de verdad.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const SLUGS = [
  'guia-comprar-vivienda',
  'gastos-impuestos-comprar-vivienda',
  'que-revisar-antes-comprar-casa',
  'como-saber-vivienda-bien-precio',
  'obra-nueva-vs-segunda-mano',
  'preguntas-antes-comprar-vivienda',
]

async function open(page: Page, path: string) {
  const res = await page.goto(path)
  const accept = page.getByTestId('cookie-accept')
  if (await accept.isVisible().catch(() => false)) await accept.click()
  return res
}

function jsonLd(page: Page, type: string) {
  return page.evaluate((t) => {
    for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      try {
        const d = JSON.parse(s.textContent || '')
        if (d['@type'] === t) return d
      } catch {
        // un script que no es JSON válido no es el que buscamos
      }
    }
    return null
  }, type)
}

/**
 * Errores que invalidan la página: excepciones de JavaScript y respuestas
 * 4xx/5xx del PROPIO sitio (una imagen del blog que no existe, por ejemplo).
 * Un recurso externo que no carga en el entorno de pruebas (fuentes, teselas,
 * certificados del proxy) no es un fallo del blog y no cuenta.
 */
function watchErrors(page: Page, errors: string[]) {
  const origin = new URL(BASE_URL).origin
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text()
    if (/favicon|hydration|Failed to load resource/i.test(text)) return
    errors.push(text)
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(origin) && !/favicon/.test(r.url())) errors.push(`${r.status()} ${r.url()}`)
  })
}

test.describe('Blog: guías de compra', () => {
  let anon: APIRequestContext

  test.beforeAll(async () => {
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
    // Primera petición: publica las guías en el host principal (idempotente).
    const res = await anon.get('/api/public/blogs')
    expect(res.ok()).toBeTruthy()
  })

  test('API: las seis guías están publicadas con tiempo de lectura, categoría y relacionados; publicarlas otra vez no duplica', async () => {
    const first = await (await anon.get('/api/public/blogs')).json()
    const guides = first.rows.filter((r: any) => SLUGS.includes(r.slug))
    expect(guides.map((g: any) => g.slug).sort()).toEqual([...SLUGS].sort())
    for (const g of guides) {
      expect(g.source).toBe('cms')
      expect(g.readingTime).toBeGreaterThanOrEqual(8)
      expect(g.category?.slug).toBe('guias')
      expect(g.image).toMatch(/^\/demo-assets\/norte-astur\/blog\/g0\d-cover\.webp$/)
      expect(g.description.length).toBeGreaterThan(60)
    }
    expect(first.categories.find((c: any) => c.slug === 'guias')?.count).toBeGreaterThanOrEqual(6)
    // La guía principal encabeza el listado (fechas escalonadas).
    expect(first.rows[0].slug).toBe('guia-comprar-vivienda')

    const again = await (await anon.get('/api/public/blogs')).json()
    expect(again.rows.filter((r: any) => SLUGS.includes(r.slug))).toHaveLength(6)

    const filtered = await (await anon.get('/api/public/blogs?categoria=guias')).json()
    expect(filtered.rows.every((r: any) => r.category?.slug === 'guias')).toBe(true)
    const none = await (await anon.get('/api/public/blogs?categoria=no-existe')).json()
    expect(none.rows).toHaveLength(0)

    const detail = await (await anon.get('/api/public/blogs/guia-comprar-vivienda')).json()
    expect(detail.source).toBe('cms')
    expect(detail.category.slug).toBe('guias')
    expect(detail.related.map((r: any) => r.slug)).toEqual(['gastos-impuestos-comprar-vivienda', 'que-revisar-antes-comprar-casa', 'preguntas-antes-comprar-vivienda'])
    const blocks = JSON.parse(detail.article.contentJson)
    expect(blocks.some((b: any) => b.type === 'timeline')).toBe(true)
    expect(blocks.some((b: any) => b.type === 'checklist')).toBe(true)
    expect(blocks.filter((b: any) => b.type === 'image').every((b: any) => b.src.startsWith('/demo-assets/norte-astur/blog/'))).toBe(true)
  })

  test('las imágenes de las guías existen, son WebP y la portada es 16:9', async () => {
    const list = await (await anon.get('/api/public/blogs')).json()
    const covers = list.rows.filter((r: any) => SLUGS.includes(r.slug)).map((r: any) => r.image)
    expect(new Set(covers).size).toBe(6)
    for (const slug of SLUGS) {
      const detail = await (await anon.get(`/api/public/blogs/${slug}`)).json()
      const srcs = [detail.article.coverImage, ...JSON.parse(detail.article.contentJson).filter((b: any) => b.type === 'image').map((b: any) => b.src)]
      expect(srcs.length).toBeGreaterThanOrEqual(4)
      for (const src of srcs) {
        const res = await anon.get(src)
        expect(res.status(), src).toBe(200)
        expect(res.headers()['content-type']).toContain('image/webp')
      }
    }
  })

  test('el sitemap incluye las seis guías', async () => {
    const xml = await (await anon.get('/sitemap.xml')).text()
    for (const slug of SLUGS) expect(xml).toContain(`/blog/${slug}`)
  })

  test('listado: guía principal destacada, rejilla con tiempo de lectura y filtro por categoría', async ({ page }) => {
    const errors: string[] = []
    watchErrors(page, errors)
    await open(page, '/blog')
    const featured = page.getByTestId('blog-featured')
    await expect(featured).toBeVisible()
    await expect(featured).toContainText('Guía paso a paso para comprar una vivienda')
    await expect(featured).toContainText('min de lectura')
    await expect(page.getByTestId('blog-card').first()).toBeVisible()
    expect(await page.getByTestId('blog-card').count()).toBeGreaterThanOrEqual(5)
    await expect(page.getByTestId('blog-categories')).toContainText('Guías')
    await page.getByTestId('blog-categories').getByRole('link', { name: /Guías/ }).click()
    await expect(page).toHaveURL(/categoria=guias/)
    await expect(page.getByTestId('blog-featured')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('ficha editorial: migas, cabecera, portada, índice fijo, progreso, relacionados y datos estructurados', async ({ page }) => {
    const errors: string[] = []
    watchErrors(page, errors)
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, '/blog/guia-comprar-vivienda')
    await expect(page.getByTestId('blog-breadcrumbs')).toContainText('Blog')
    await expect(page.getByTestId('blog-breadcrumbs')).toContainText('Guías')
    await expect(page.getByTestId('blog-title')).toHaveText('Guía paso a paso para comprar una vivienda en España')
    await expect(page.getByTestId('blog-subtitle')).toBeVisible()
    await expect(page.getByTestId('blog-meta')).toContainText('min')
    const cover = page.getByTestId('blog-cover')
    await expect(cover).toBeVisible()
    expect(await cover.getAttribute('width')).toBe('1600')
    expect(await cover.getAttribute('height')).toBe('900')
    expect(await cover.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(1000)
    // Índice fijo en escritorio, con las secciones del artículo.
    const toc = page.locator('.blog-aside [data-testid="cms-toc"]')
    await expect(toc).toBeVisible()
    await expect(toc).toContainText('El contrato de arras')
    await toc.getByRole('link', { name: /El contrato de arras/ }).click()
    await expect(page).toHaveURL(/#5-el-contrato-de-arras/)
    await expect(page.getByTestId('cms-reading-progress')).toHaveCount(1)
    await expect(page.getByTestId('cms-timeline')).toBeVisible()
    await expect(page.getByTestId('cms-keypoints')).toBeVisible()
    await expect(page.getByTestId('cms-faq')).toBeVisible()
    // Enlaces internos del cuerpo a otras guías.
    const links = await page.locator('.cms-content a.cms-link').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
    expect(links.filter((h) => h?.startsWith('/blog/')).length).toBeGreaterThanOrEqual(3)
    for (const href of links) {
      const res = await anon.get(href!)
      expect(res.status(), href!).toBe(200)
    }
    expect(await page.getByTestId('blog-related-card').count()).toBe(3)
    // Datos estructurados: BlogPosting con la empresa como publisher y migas.
    const posting = await jsonLd(page, 'BlogPosting')
    expect(posting.headline).toBe('Guía paso a paso para comprar una vivienda en España')
    expect(posting.publisher?.name).toBeTruthy()
    expect(posting.datePublished).toBeTruthy()
    expect(posting.image?.[0]).toContain('/demo-assets/norte-astur/blog/g01-cover.webp')
    const crumbs = await jsonLd(page, 'BreadcrumbList')
    expect(crumbs.itemListElement.map((i: any) => i.name)).toEqual(['Inicio', 'Blog', 'Guías', 'Guía paso a paso para comprar una vivienda en España'])
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toContain('/blog/guia-comprar-vivienda')
    expect(await page.locator('meta[property="og:type"]').getAttribute('content')).toBe('article')
    expect(await page.locator('h1').count()).toBe(1)
    expect(errors).toEqual([])
  })

  test('checklist interactiva: progreso, persistencia en el navegador, descarga e impresión', async ({ page }) => {
    await open(page, '/blog/guia-comprar-vivienda')
    const list = page.getByTestId('cms-checklist')
    await list.scrollIntoViewIfNeeded()
    await expect(list.getByTestId('cms-checklist-progress')).toContainText('0')
    await list.getByTestId('cms-checklist-item-1-1').click()
    await list.getByTestId('cms-checklist-item-1-2').click()
    await expect(list.getByTestId('cms-checklist-progress')).toContainText('2')
    await page.reload()
    await expect(page.getByTestId('cms-checklist').getByTestId('cms-checklist-progress')).toContainText('2')
    await expect(page.getByTestId('cms-checklist-download')).toBeVisible()
    await expect(page.getByTestId('cms-checklist-print')).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('cms-checklist-download').click()])
    expect(download.suggestedFilename()).toMatch(/\.txt$/)
    await page.getByTestId('cms-checklist-reset').click()
    await expect(page.getByTestId('cms-checklist').getByTestId('cms-checklist-progress')).toContainText('0')
  })

  test('calculadora de gastos: cambia con la comunidad y el tipo de vivienda y enseña la fuente y la fecha', async ({ page }) => {
    await open(page, '/blog/gastos-impuestos-comprar-vivienda')
    const calc = page.getByTestId('cms-cost-calculator')
    await calc.scrollIntoViewIfNeeded()
    await expect(calc.getByTestId('cms-calc-source')).toContainText(/\d{2}\/\d{2}\/\d{4}/)
    const total1 = await calc.getByTestId('cms-calc-total').textContent()
    await expect(calc.getByTestId('cms-calc-line-itp')).toContainText('16.000')
    await calc.getByTestId('cms-calc-region').selectOption('MAD')
    await expect(calc.getByTestId('cms-calc-line-itp')).toContainText('12.000')
    const total2 = await calc.getByTestId('cms-calc-total').textContent()
    expect(total2).not.toBe(total1)
    await calc.getByTestId('cms-calc-kind-new').click()
    await expect(calc.getByTestId('cms-calc-line-iva')).toBeVisible()
    await expect(calc.getByTestId('cms-calc-line-ajd')).toBeVisible()
    await expect(calc.getByTestId('cms-calc-line-itp')).toHaveCount(0)
    await calc.getByTestId('cms-calc-price').fill('300000')
    await expect(calc.getByTestId('cms-calc-line-iva')).toContainText('30.000')
  })

  test('comparador obra nueva / segunda mano: la tabla y el módulo de prioridades dan un veredicto', async ({ page }) => {
    await open(page, '/blog/obra-nueva-vs-segunda-mano')
    const cmp = page.getByTestId('cms-comparator')
    await cmp.scrollIntoViewIfNeeded()
    await expect(cmp).toContainText('Impuestos')
    await cmp.getByTestId('cms-comparator-q1-o1').click()
    await cmp.getByTestId('cms-comparator-q2-o1').click()
    await cmp.getByTestId('cms-comparator-q3-o2').click()
    await expect(cmp.getByTestId('cms-comparator-verdict')).toHaveAttribute('data-lean', 'b')
    await cmp.getByTestId('cms-comparator-reset').click()
    await cmp.getByTestId('cms-comparator-q1-o2').click()
    await cmp.getByTestId('cms-comparator-q3-o1').click()
    await expect(cmp.getByTestId('cms-comparator-verdict')).toHaveAttribute('data-lean', 'a')
  })

  test('preguntas por categorías: desplegables marcables con progreso, y gráfico de factores ilustrativo', async ({ page }) => {
    await open(page, '/blog/preguntas-antes-comprar-vivienda')
    const acc = page.getByTestId('cms-accordion')
    await acc.scrollIntoViewIfNeeded()
    // La primera sección viene abierta; la segunda se abre desde su resumen.
    await acc.getByTestId('cms-accordion-item-1-1').click()
    await acc.getByTestId('cms-accordion-section-2').locator('summary').click()
    await acc.getByTestId('cms-accordion-item-2-1').click()
    await expect(acc).toContainText('2')
    await expect(acc.getByTestId('cms-accordion-print')).toBeVisible()
    expect(await acc.locator('[data-testid^="cms-accordion-section-"]').count()).toBe(8)

    await open(page, '/blog/como-saber-vivienda-bien-precio')
    const chart = page.getByTestId('cms-factors-chart')
    await chart.scrollIntoViewIfNeeded()
    expect(await chart.locator('[data-testid^="cms-factor-"]').count()).toBe(7)
    await expect(chart).toContainText(/ilustrativ/i)
    await expect(chart.getByTestId('cms-factors-result')).toBeVisible()
  })

  test('móvil: sin desbordes, índice desplegable y tablas con scroll propio', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const slug of ['guia-comprar-vivienda', 'gastos-impuestos-comprar-vivienda']) {
      await open(page, `/blog/${slug}`)
      // Si algo desborda, el mensaje dice qué elementos se salen del ancho de la pantalla.
      const info = await page.evaluate(() => {
        const w = window.innerWidth
        const offenders: string[] = []
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          const r = el.getBoundingClientRect()
          if (r.right > w + 1 && r.width > 0) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} right=${Math.round(r.right)}`)
        }
        return { overflow: document.documentElement.scrollWidth - w, offenders: offenders.slice(0, 8) }
      })
      expect(info.overflow, `${slug}: ${info.offenders.join(' | ')}`).toBeLessThanOrEqual(1)
      await expect(page.locator('.blog-toc-mobile [data-testid="cms-toc"]')).toBeVisible()
      await expect(page.locator('.blog-aside')).toBeHidden()
    }
    await open(page, '/blog')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
