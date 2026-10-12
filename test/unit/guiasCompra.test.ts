import { describe, expect, it } from 'vitest'
import { GUIAS_COMPRA, IMAGES, guiaImages, guiaInternalLinks, guiaWordCount } from '../../server/content/guiasCompra'
import { guiaBlocksForStaticHost, guiaArticleValues } from '../../server/utils/blog/buyerGuides'
import { blocksToPlainText, computeReadingTime } from '../../server/utils/cms'
import { inlineLinks, renderInline, stripInline } from '../../utils/cmsInline'
import { REGIONS, REVIEWED_AT, computePurchaseCosts, itpFor } from '../../utils/compraGastos'

const SLUGS = GUIAS_COMPRA.map((g) => g.slug)
const INTERACTIVE = ['timeline', 'checklist', 'cost_calculator', 'factors_chart', 'comparator', 'accordion']

describe('guías de compra: contenido', () => {
  it('son seis, con slug, clave y portada distintos', () => {
    expect(GUIAS_COMPRA).toHaveLength(6)
    expect(new Set(SLUGS).size).toBe(6)
    expect(new Set(GUIAS_COMPRA.map((g) => g.key)).size).toBe(6)
    expect(new Set(GUIAS_COMPRA.map((g) => g.cover.file)).size).toBe(6)
    expect(SLUGS).toEqual([
      'guia-comprar-vivienda',
      'gastos-impuestos-comprar-vivienda',
      'que-revisar-antes-comprar-casa',
      'como-saber-vivienda-bien-precio',
      'obra-nueva-vs-segunda-mano',
      'preguntas-antes-comprar-vivienda',
    ])
  })

  it.each(GUIAS_COMPRA)('$slug tiene entre 1.800 y 3.000 palabras, intro, H2, FAQ, conclusión y CTA', (g) => {
    const words = guiaWordCount(g)
    expect(words, `${g.slug}: ${words} palabras`).toBeGreaterThanOrEqual(1800)
    expect(words, `${g.slug}: ${words} palabras`).toBeLessThanOrEqual(3000)
    expect(g.blocks[0].type).toBe('paragraph')
    const h2 = g.blocks.filter((b) => b.type === 'heading' && b.level === 2)
    expect(h2.length).toBeGreaterThanOrEqual(5)
    expect(h2.some((b) => /conclusi/i.test(b.text))).toBe(true)
    expect(g.blocks.filter((b) => b.type === 'faq' && b.items?.length >= 4)).toHaveLength(1)
    expect(g.blocks.filter((b) => b.type === 'cta')).toHaveLength(1)
    expect(g.blocks.filter((b) => b.type === 'properties')).toHaveLength(1)
    expect(g.blocks.filter((b) => b.type === 'keypoints')).toHaveLength(1)
    expect(g.blocks.some((b) => b.type === 'table')).toBe(true)
    expect(g.blocks.some((b) => b.type === 'callout')).toBe(true)
    expect(computeReadingTime(g.blocks as any)).toBeGreaterThanOrEqual(8)
  })

  it.each(GUIAS_COMPRA)('$slug tiene al menos un bloque interactivo que no se repite como único recurso', (g) => {
    const kinds = g.blocks.map((b) => b.type).filter((t) => INTERACTIVE.includes(t))
    expect(kinds.length).toBeGreaterThanOrEqual(1)
  })

  it('cada guía usa un interactivo principal distinto', () => {
    const main = GUIAS_COMPRA.map((g) => g.blocks.find((b) => INTERACTIVE.includes(b.type))?.type)
    expect(new Set(main).size).toBe(6)
  })

  it.each(GUIAS_COMPRA)('$slug: SEO, fecha de revisión y relacionados válidos', (g) => {
    expect(g.seoTitle.length).toBeLessThanOrEqual(70)
    expect(g.seoDescription.length).toBeGreaterThanOrEqual(80)
    expect(g.seoDescription.length).toBeLessThanOrEqual(170)
    expect(g.subtitle.length).toBeGreaterThan(60)
    expect(g.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(g.category).toBe('guias')
    expect(g.related.length).toBeGreaterThanOrEqual(2)
    for (const r of g.related) {
      expect(SLUGS).toContain(r)
      expect(r).not.toBe(g.slug)
    }
  })

  it.each(GUIAS_COMPRA)('$slug enlaza a otras guías y al catálogo, y ningún enlace interno está roto', (g) => {
    const links = guiaInternalLinks(g)
    const toGuides = links.filter((l) => l.startsWith('/blog/')).map((l) => l.replace('/blog/', ''))
    expect(toGuides.length).toBeGreaterThanOrEqual(2)
    for (const s of toGuides) expect(SLUGS).toContain(s)
    expect(links.some((l) => l.startsWith('/propiedades') || l === '/contacto')).toBe(true)
    for (const l of links) expect(l).toMatch(/^\/(blog\/[a-z0-9-]+|propiedades(\?.*)?|contacto)$/)
  })

  it.each(GUIAS_COMPRA)('$slug: portada 16:9 y entre 3 y 6 imágenes de cuerpo, con alt y dimensiones', (g) => {
    expect(Math.abs(g.cover.width / g.cover.height - 16 / 9)).toBeLessThan(0.02)
    const body = g.blocks.filter((b) => b.type === 'image')
    expect(body.length).toBeGreaterThanOrEqual(3)
    expect(body.length).toBeLessThanOrEqual(6)
    for (const b of body) {
      expect(b.alt).toBeTruthy()
      expect(b.width).toBeGreaterThan(0)
      expect(b.height).toBeGreaterThan(0)
    }
  })

  it('ninguna fotografía se repite entre artículos y todas están acreditadas', () => {
    const seen = new Map<string, string>()
    const pending: string[] = []
    for (const g of GUIAS_COMPRA) {
      for (const image of guiaImages(g)) {
        expect(seen.get(image.file), `${image.file} repetida en ${g.slug} y ${seen.get(image.file)}`).toBeUndefined()
        seen.set(image.file, g.slug)
        if (image.credit === 'pendiente') pending.push(`${g.slug}: ${image.file}`)
      }
    }
    expect(pending, `imágenes sin fotografía elegida:\n${pending.join('\n')}`).toEqual([])
  })

  it('las claves del mapa de imágenes coinciden con los ficheros y nombres', () => {
    for (const [key, image] of Object.entries(IMAGES)) {
      expect(image.file).toBe(`${key}.webp`)
      expect(image.alt.length).toBeGreaterThan(10)
    }
  })
})

describe('guías de compra: publicación', () => {
  it('resuelve las imágenes del host principal a /demo-assets y omite las pendientes', () => {
    const g = GUIAS_COMPRA[0]
    const blocks = guiaBlocksForStaticHost(g)
    for (const b of blocks.filter((x) => x.type === 'image')) {
      expect(b.src).toMatch(/^\/demo-assets\/norte-astur\/blog\/g0\d-[a-z]+\.webp$/)
      expect(b.pending).toBeFalsy()
    }
    const values = guiaArticleValues(g, 1, { categoryId: 7, authorId: null, coverImage: '/demo-assets/norte-astur/blog/g01-cover.webp', blocks, now: '2026-10-10T10:00:00.000Z' })
    expect(values.status).toBe('published')
    expect(values.slug).toBe(g.slug)
    expect(values.readingTimeMinutes).toBeGreaterThan(5)
    expect(values.seoScore).toBeGreaterThan(50)
    expect(JSON.parse(values.contentJson)).toEqual(blocks)
  })
})

describe('formato en línea del CMS', () => {
  it('convierte enlaces y negritas y escapa el HTML', () => {
    expect(renderInline('Mira la [guía](/blog/guia-comprar-vivienda) y **esto**.')).toBe('Mira la <a href="/blog/guia-comprar-vivienda" class="cms-link">guía</a> y <strong>esto</strong>.')
    expect(renderInline('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(renderInline('[x](javascript:alert(1))')).toBe('[x](javascript:alert(1))')
    expect(renderInline('[ext](https://example.com/a)')).toContain('target="_blank" rel="noopener"')
  })
  it('stripInline deja sólo el texto y blocksToPlainText lo usa', () => {
    expect(stripInline('Ver [la guía](/blog/x) con **énfasis**')).toBe('Ver la guía con énfasis')
    expect(inlineLinks('a [b](/c) d [e](#f)')).toEqual(['/c', '#f'])
    expect(blocksToPlainText([{ type: 'paragraph', text: 'Ver [la guía](/blog/x)' }])).toBe('Ver la guía')
  })
})

describe('calculadora de gastos de compra', () => {
  it('tiene las 17 comunidades y Ceuta y Melilla con fuente y fecha de revisión', () => {
    expect(REGIONS).toHaveLength(18)
    expect(REVIEWED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    for (const r of REGIONS) {
      expect(r.source.length).toBeGreaterThan(20)
      expect(['official', 'pending']).toContain(r.verified)
      expect(r.itp[r.itp.length - 1].upTo).toBeNull()
    }
  })
  it('aplica la escala por tramos y los impuestos de obra nueva', () => {
    const ast = REGIONS.find((r) => r.code === 'AST')!
    expect(itpFor(200000, ast.itp)).toBe(16000)
    expect(itpFor(400000, ast.itp)).toBe(24000 + 9000)
    const used = computePurchaseCosts({ price: 200000, region: 'AST', kind: 'used', mortgage: true })!
    expect(used.taxes).toBe(16000)
    expect(used.total).toBeGreaterThan(16000)
    expect(used.pctOfPrice).toBeGreaterThan(8)
    const nueva = computePurchaseCosts({ price: 300000, region: 'AST', kind: 'new', mortgage: false })!
    expect(nueva.lines.find((l) => l.key === 'ajd')?.amount).toBe(3600)
    expect(nueva.lines.some((l) => l.key === 'appraisal')).toBe(false)
    const mad = computePurchaseCosts({ price: 250000, region: 'MAD', kind: 'used', mortgage: true })!
    expect(mad.taxes).toBe(15000)
  })
})
