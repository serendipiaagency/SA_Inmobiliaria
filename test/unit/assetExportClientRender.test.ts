import { describe, expect, it } from 'vitest'
import { DEMO_BINDINGS } from '../../utils/assetExport/demoProperty'
import { bindingsOrDemo, firstPageElements, imgUrlFrom, resolveCssColorFrom, textContentFrom, textCssFrom, tokenOf, type RenderElement } from '../../utils/assetExport/clientRender'

/**
 * Resolvedores de cliente que pintan la miniatura de «Plantillas» y el lienzo
 * del editor con una propiedad (real o de demostración). Deben reflejar lo que
 * hace el render pdf-lib del servidor, y la propiedad de demostración debe
 * quedar estrictamente en el cliente (imágenes estáticas, nunca claves de R2).
 */
const el = (type: RenderElement['type'], binding?: string, style?: Record<string, any>): RenderElement => ({ type, x: 0, y: 0, w: 10, h: 10, binding, style })

describe('tokenOf', () => {
  it('extrae el token de {{asset.title}} y rechaza lo que no es token', () => {
    expect(tokenOf('{{asset.title}}')).toBe('asset.title')
    expect(tokenOf('{{ asset.price }}')).toBe('asset.price')
    expect(tokenOf('texto fijo')).toBeNull()
    expect(tokenOf(undefined)).toBeNull()
  })
})

describe('textContentFrom', () => {
  it('devuelve el valor del binding; mayúsculas si el estilo lo pide', () => {
    expect(textContentFrom(el('text', '{{asset.city}}'), DEMO_BINDINGS)).toBe('Candás')
    expect(textContentFrom(el('text', '{{asset.city}}', { uppercase: true }), DEMO_BINDINGS)).toBe('CANDÁS')
  })
  it('sin valor para el token, muestra la etiqueta del campo (nunca el {{token}} crudo)', () => {
    // Datos reales donde ese campo viene vacío: se enseña la etiqueta del catálogo.
    const emptyBindings = { values: {}, images: {} }
    const out = textContentFrom(el('text', '{{asset.price}}'), emptyBindings)
    expect(out).toBe('Precio')
    expect(out).not.toContain('{{')
  })
  it('un texto fijo se devuelve tal cual', () => {
    expect(textContentFrom(el('text', 'Contáctanos'), DEMO_BINDINGS)).toBe('Contáctanos')
  })
})

describe('imgUrlFrom', () => {
  it('devuelve la URL de imagen de demostración', () => {
    expect(imgUrlFrom(el('image', '{{asset.mainImage}}'), DEMO_BINDINGS)).toBe('/demo-assets/norte-astur/propiedades/p10-01.jpg')
  })
  it('null si el binding no es imagen o no existe', () => {
    expect(imgUrlFrom(el('image', 'no-token'), DEMO_BINDINGS)).toBeNull()
  })
})

describe('resolveCssColorFrom', () => {
  it('un rol de marca se resuelve al color del Brand Kit', () => {
    expect(resolveCssColorFrom('accent', DEMO_BINDINGS)).toBe('#b08d57')
    expect(resolveCssColorFrom('primary', DEMO_BINDINGS)).toBe('#16150f')
  })
  it('un HEX se respeta y «muted» tiene su gris', () => {
    expect(resolveCssColorFrom('#123456', DEMO_BINDINGS)).toBe('#123456')
    expect(resolveCssColorFrom('muted', DEMO_BINDINGS)).toBe('#73706c')
  })
})

describe('textCssFrom', () => {
  it('escala el tamaño, aplica negrita y la fuente de titulares con peso fuerte', () => {
    const css = textCssFrom(el('text', '{{asset.title}}', { fontSize: 20, weight: 700, color: 'primary' }), 0.5, DEMO_BINDINGS)
    expect(css.fontSize).toBe('10px') // 20 * 0.5
    expect(css.fontWeight).toBe(700)
    expect(css.color).toBe('#16150f')
    expect(css.fontFamily).toContain('Georgia') // tenant.fontHeading
  })
  it('peso normal usa la fuente de cuerpo', () => {
    const css = textCssFrom(el('text', '{{asset.description}}', { fontSize: 12 }), 1, DEMO_BINDINGS)
    expect(css.fontWeight).toBe(400)
    expect(css.fontFamily).toContain('Helvetica') // tenant.fontBody
  })
})

describe('firstPageElements', () => {
  it('acepta estructura como objeto o como string y ordena por zIndex', () => {
    const structure = { pages: [{ elements: [{ type: 'text', zIndex: 2 }, { type: 'image', zIndex: 1 }] }] }
    expect(firstPageElements(structure).map((e) => e.type)).toEqual(['image', 'text'])
    expect(firstPageElements(JSON.stringify(structure)).map((e) => e.type)).toEqual(['image', 'text'])
  })
  it('un JSON corrupto o vacío devuelve []', () => {
    expect(firstPageElements('{no json')).toEqual([])
    expect(firstPageElements(null)).toEqual([])
  })
})

describe('separación demo / producción', () => {
  it('bindingsOrDemo usa la demo sólo cuando no hay propiedad real', () => {
    expect(bindingsOrDemo(null)).toBe(DEMO_BINDINGS)
    const real = { values: { 'asset.title': 'Real' }, images: {} }
    expect(bindingsOrDemo(real)).toBe(real)
  })
  it('las imágenes de la demo son ficheros estáticos del repo, NUNCA claves de R2', () => {
    for (const url of Object.values(DEMO_BINDINGS.images)) {
      expect(url).toMatch(/^\/demo-assets\//)
    }
  })
  it('la demo trae todos los datos para una previsualización realista', () => {
    for (const k of ['asset.title', 'asset.price', 'asset.location', 'asset.bedrooms', 'tenant.accentColor']) {
      expect(DEMO_BINDINGS.values[k]).toBeTruthy()
    }
  })
})
