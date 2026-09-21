import { describe, expect, it } from 'vitest'
import {
  BREAKPOINT_MEDIA,
  NODE_KINDS,
  buildNodeStylesCss,
  hasNodeOverrides,
  kindHas,
  nodeSelector,
  nodeStyleCss,
  ownNodeProps,
  resolveNodeProps,
  sanitizeNodeStyle,
  sanitizeNodeStyles,
  styleDeclarations,
  withNodeProp,
} from '../../utils/siteBuilder/nodes'
import { SITE_FONTS, fontStack, googleFontsHref, isKnownFont } from '../../utils/siteBuilder/fonts'
import { buildGlobalStylesCss, sanitizeGlobalStyles } from '../../utils/siteBuilder/globalStyles'
import { buildPageCss, collectPageFonts, pageFontsHref } from '../../utils/siteBuilder/pageCss'
import { validatePageDocument, parsePageJson } from '../../server/utils/sitePages'

/**
 * El modelo de nodos del editor visual es lo que separa "estilos
 * estructurados" de "CSS libre guardado en la base de datos": todo lo que
 * llega del cliente pasa por `sanitizeNodeStyles`, y todo lo que se pinta
 * sale de `buildNodeStylesCss`. Estas pruebas fijan las dos mitades y la
 * herencia responsive, que es lo que un usuario ve al cambiar de dispositivo.
 */
describe('saneado de estilos de nodo', () => {
  it('descarta claves desconocidas, valores fuera de rango y CSS libre', () => {
    const style = sanitizeNodeStyle({
      fontSize: '56',
      fontWeight: 600,
      color: '#111111',
      background: 'url(javascript:alert(1))',
      fontFamily: 'Comic Sans MS',
      align: 'middle',
      marginTop: 9999,
      opacity: -5,
      cssText: 'position:fixed',
      'font-size': '12px',
    })
    expect(style).toEqual({ fontSize: 56, fontWeight: 600, color: '#111111', marginTop: 240, opacity: 0 })
  })

  it('normaliza colores hex y admite transparent, pero nada más', () => {
    expect(sanitizeNodeStyle({ color: '#ABC' })?.color).toBe('#abc')
    expect(sanitizeNodeStyle({ color: '#AABBCC80' })?.color).toBe('#aabbcc80')
    expect(sanitizeNodeStyle({ background: 'transparent' })?.background).toBe('transparent')
    expect(sanitizeNodeStyle({ color: 'red' })).toBeUndefined()
    expect(sanitizeNodeStyle({ color: 'rgb(0,0,0)' })).toBeUndefined()
    expect(sanitizeNodeStyle({ color: '#zzzzzz' })).toBeUndefined()
  })

  it('sólo acepta tipografías del catálogo', () => {
    expect(isKnownFont('Playfair Display')).toBe(true)
    expect(isKnownFont('Wingdings')).toBe(false)
    expect(sanitizeNodeStyle({ fontFamily: 'Playfair Display' })).toEqual({ fontFamily: 'Playfair Display' })
    expect(sanitizeNodeStyle({ fontFamily: 'Wingdings' })).toBeUndefined()
  })

  it('un nodo sin nada que guardar desaparece del JSON', () => {
    expect(sanitizeNodeStyle({})).toBeUndefined()
    expect(sanitizeNodeStyle({ responsive: { mobile: { nonsense: 1 } } })).toBeUndefined()
    expect(sanitizeNodeStyles({ title: {}, 'card.name': { color: '#000' }, 'bad key!': { color: '#000' } })).toEqual({ 'card.name': { color: '#000' } })
    expect(sanitizeNodeStyles([])).toBeUndefined()
    expect(sanitizeNodeStyles('x')).toBeUndefined()
  })

  it('conserva los overrides responsive saneados por separado', () => {
    const style = sanitizeNodeStyle({ fontSize: 56, responsive: { tablet: { fontSize: 44, color: 'nope' }, mobile: { fontSize: '34' }, desktop: { fontSize: 1 } } })
    expect(style).toEqual({ fontSize: 56, responsive: { tablet: { fontSize: 44 }, mobile: { fontSize: 34 } } })
    expect(hasNodeOverrides(style)).toBe(true)
    expect(hasNodeOverrides({ responsive: {} })).toBe(false)
  })
})

describe('herencia por dispositivo', () => {
  const style = { fontSize: 56, color: '#111111', responsive: { tablet: { fontSize: 44 }, mobile: { fontSize: 34, color: '#ff0000' } } }

  it('móvil hereda de tablet y tablet de escritorio', () => {
    expect(resolveNodeProps(style, 'desktop')).toEqual({ fontSize: 56, color: '#111111' })
    expect(resolveNodeProps(style, 'tablet')).toEqual({ fontSize: 44, color: '#111111' })
    expect(resolveNodeProps(style, 'mobile')).toEqual({ fontSize: 34, color: '#ff0000' })
  })

  it('distingue lo propio de lo heredado, que es lo que el inspector marca como override', () => {
    expect(ownNodeProps(style, 'tablet')).toEqual({ fontSize: 44 })
    expect(ownNodeProps(style, 'desktop')).toEqual({ fontSize: 56, color: '#111111' })
    expect(ownNodeProps(undefined, 'mobile')).toEqual({})
  })

  it('withNodeProp escribe en el dispositivo indicado y borra con undefined', () => {
    const tablet = withNodeProp(undefined, 'tablet', 'fontSize', 40)
    expect(tablet).toEqual({ responsive: { tablet: { fontSize: 40 } } })
    const cleared = withNodeProp(tablet, 'tablet', 'fontSize', undefined)
    expect(cleared).toBeUndefined()
    expect(withNodeProp({ color: '#000000' }, 'desktop', 'fontSize', 500)).toEqual({ color: '#000000', fontSize: 200 })
  })
})

describe('CSS generado', () => {
  it('traduce cada propiedad a su declaración, siempre con unidades explícitas', () => {
    const decl = styleDeclarations({
      fontFamily: 'Lora',
      fontSize: 18,
      fontWeight: 700,
      fontStyle: 'italic',
      textTransform: 'uppercase',
      textDecoration: 'underline',
      lineHeight: 1.4,
      letterSpacing: 0.1,
      color: '#111111',
      background: '#ffffff',
      borderColor: '#000000',
      borderWidth: 2,
      radius: 12,
      align: 'center',
      marginTop: 8,
      marginBottom: 16,
      paddingX: 24,
      paddingY: 12,
      objectFit: 'contain',
      objectPosition: '50% 0%',
      opacity: 40,
    })
    expect(decl).toEqual([
      'font-family:"Lora", ui-serif, Georgia, serif',
      'font-size:18px',
      'font-weight:700',
      'font-style:italic',
      'text-transform:uppercase',
      'text-decoration:underline',
      'line-height:1.4',
      'letter-spacing:0.1em',
      'color:#111111',
      'background-color:#ffffff',
      'border:2px solid #000000',
      'border-radius:12px',
      'text-align:center',
      'margin-top:8px',
      'margin-bottom:16px',
      'padding-left:24px',
      'padding-right:24px',
      'padding-top:12px',
      'padding-bottom:12px',
      'object-fit:contain',
      'object-position:50% 0%',
      'opacity:0.4',
    ])
    expect(styleDeclarations({ borderColor: '#000000' })).toEqual(['border-color:#000000'])
  })

  it('cada regla va anclada a la raíz de la página y al nodo, con !important, y los breakpoints en media queries', () => {
    const css = nodeStyleCss('hero-abc', 'title', { fontSize: 56, responsive: { tablet: { fontSize: 44 }, mobile: { fontSize: 34 } } })
    const sel = nodeSelector('hero-abc', 'title')
    expect(sel).toBe('[data-site-page] [data-sb-node="hero-abc:title"]')
    expect(css).toBe(
      `${sel}{font-size:56px!important}` +
        `@media ${BREAKPOINT_MEDIA.tablet}{${sel}{font-size:44px!important}}` +
        `@media ${BREAKPOINT_MEDIA.mobile}{${sel}{font-size:34px!important}}`,
    )
  })

  it('ignora ids o campos que no sean claves válidas (nada puede salir del selector)', () => {
    expect(nodeStyleCss('hero"]{}', 'title', { fontSize: 20 })).toBe('')
    expect(nodeStyleCss('hero', 'ti tle', { fontSize: 20 })).toBe('')
    expect(nodeStyleCss('hero', 'title', undefined)).toBe('')
  })

  it('buildNodeStylesCss recorre los bloques en orden y salta los que no tienen estilos', () => {
    const css = buildNodeStylesCss([
      { id: 'a', nodeStyles: { title: { color: '#111111' } } },
      { id: 'b' },
      { id: 'c', nodeStyles: { 'card.name': { fontWeight: 500 }, cta: { radius: 999 } } },
    ])
    expect(css).toBe(
      '[data-site-page] [data-sb-node="a:title"]{color:#111111!important}' +
        '[data-site-page] [data-sb-node="c:card.name"]{font-weight:500!important}' +
        '[data-site-page] [data-sb-node="c:cta"]{border-radius:999px!important}',
    )
  })
})

describe('registro de tipos de nodo', () => {
  it('cada tipo declara etiqueta y capacidades coherentes con lo que es', () => {
    for (const [kind, def] of Object.entries(NODE_KINDS)) {
      expect(def.label, kind).toBeTruthy()
      expect(def.capabilities.length, kind).toBeGreaterThan(0)
    }
    // Un texto se edita inline y tiene tipografía; una imagen ni lo uno ni lo otro.
    expect(NODE_KINDS.heading.inline).toBe(true)
    expect(kindHas('heading', 'typography')).toBe(true)
    expect(NODE_KINDS.image.inline).toBe(false)
    expect(kindHas('image', 'typography')).toBe(false)
    expect(kindHas('image', 'media')).toBe(true)
    // Un botón tiene enlace y fondo; un título no.
    expect(kindHas('button', 'link')).toBe(true)
    expect(kindHas('button', 'background')).toBe(true)
    expect(kindHas('heading', 'link')).toBe(false)
  })
})

describe('tipografías', () => {
  it('el catálogo tiene pesos y la pila CSS lleva reserva genérica por categoría', () => {
    for (const font of SITE_FONTS) expect(font.weights.length, font.family).toBeGreaterThan(0)
    expect(fontStack('Manrope')).toBe('"Manrope", ui-sans-serif, system-ui, sans-serif')
    expect(fontStack('Playfair Display')).toBe('"Playfair Display", ui-serif, Georgia, serif')
  })

  it('pide a Google sólo las familias conocidas que no estén ya cargadas, una vez cada una', () => {
    expect(googleFontsHref([])).toBeNull()
    expect(googleFontsHref(['Inter'])).toBeNull()
    expect(googleFontsHref(['Wingdings'])).toBeNull()
    const href = googleFontsHref(['Playfair Display', 'Manrope', 'Playfair Display', 'Inter'])
    expect(href).toBe('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Playfair+Display:wght@400;500;600;700&display=swap')
  })
})

describe('estilos globales', () => {
  it('sanea a la lista cerrada y acota el radio', () => {
    expect(sanitizeGlobalStyles({ fontHeading: 'Lora', fontBody: 'Wingdings', buttonRadius: '99', extra: true })).toEqual({ fontHeading: 'Lora', buttonRadius: 40 })
    expect(sanitizeGlobalStyles({})).toBeUndefined()
    expect(sanitizeGlobalStyles(null)).toBeUndefined()
  })

  it('el CSS queda acotado a la raíz de la página y los nodos ganan a lo global', () => {
    const css = buildGlobalStylesCss({ fontHeading: 'Lora', fontBody: 'Manrope', buttonRadius: 8 })
    expect(css).toContain('[data-site-page]{font-family:"Manrope", ui-sans-serif, system-ui, sans-serif!important}')
    expect(css).toContain('[data-site-page] h1,[data-site-page] h2,[data-site-page] h3,[data-site-page] .heading-serif,[data-site-page] .font-serif{font-family:"Lora"')
    expect(css).toContain('border-radius:8px!important')
    // Global primero, nodos después: a igual importancia, el nodo (dos atributos) es más específico que h2 (atributo + etiqueta) y además va más tarde.
    const page = buildPageCss({ styles: { fontHeading: 'Lora' }, blocks: [{ id: 'a', nodeStyles: { title: { fontFamily: 'Manrope' } } }] })
    expect(page.indexOf('[data-site-page] h1')).toBeLessThan(page.indexOf('[data-sb-node="a:title"]'))
  })

  it('collectPageFonts reúne globales y nodos (incluido responsive) sin repetir', () => {
    const doc = {
      styles: { fontHeading: 'Lora', fontBody: 'Inter' },
      blocks: [{ id: 'a', nodeStyles: { title: { fontFamily: 'Lora', responsive: { mobile: { fontFamily: 'Manrope' } } } } }],
    }
    expect(collectPageFonts(doc)).toEqual(['Inter', 'Lora', 'Manrope'])
    expect(pageFontsHref(doc)).toContain('family=Lora')
    expect(pageFontsHref(doc)).toContain('family=Manrope')
    expect(pageFontsHref({ blocks: [] })).toBeNull()
  })
})

describe('validación del documento con nodeStyles y styles', () => {
  it('guarda los estilos saneados y descarta lo que no lo es', () => {
    const doc = validatePageDocument({
      blocks: [
        { id: 'hero', type: 'hero', content: { title1: 'Hola' }, nodeStyles: { title1: { fontSize: 72, color: 'red', evil: 'x' }, 'no way': { fontSize: 1 } } },
        { id: 'cta', type: 'cta', content: {}, nodeStyles: 'garbage' },
      ],
      seo: {},
      styles: { fontHeading: 'Playfair Display', buttonRadius: 12, fontBody: 'Nope' },
    })
    expect(doc.blocks[0].nodeStyles).toEqual({ title1: { fontSize: 72 } })
    expect(doc.blocks[1].nodeStyles).toBeUndefined()
    expect(doc.styles).toEqual({ fontHeading: 'Playfair Display', buttonRadius: 12 })
  })

  it('parsePageJson conserva styles saneados y tolera su ausencia', () => {
    expect(parsePageJson(JSON.stringify({ blocks: [], seo: {}, styles: { fontBody: 'Lora', junk: 1 } })).styles).toEqual({ fontBody: 'Lora' })
    expect(parsePageJson(JSON.stringify({ blocks: [], seo: {} })).styles).toBeUndefined()
  })
})
