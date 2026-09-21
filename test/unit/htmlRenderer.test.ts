import { describe, expect, it } from 'vitest'
import { escapeHtmlText, looksLikePng, renderStructureHtml } from '../../server/utils/assetExport/htmlRenderer'
import { formatUnavailableMessage, isFormatRenderable, isSocialRenderingAvailable } from '../../server/utils/assetExport/socialRenderer'
import { FORMAT_BY_KEY } from '../../server/utils/assetExport/formats'
import type { AssetBindings } from '../../server/utils/assetExport/bindings'

/**
 * Lo único de los formatos de redes que no se puede ejecutar aquí es el
 * navegador (Browser Rendering sólo existe desplegado). Todo lo demás sí:
 * el HTML que se le da al navegador y la decisión de si el formato se puede
 * producir. Si el HTML está bien, la captura está bien; si el binding no
 * está, el 422 tiene que decirlo.
 */
const bindings: AssetBindings = {
  values: { 'asset.title': 'Ático con <vistas> & terraza', 'asset.price': '450.000 €', 'tenant.primaryColor': '#0a5c36', 'asset.url': 'https://x.example/p/1' },
  images: { 'asset.cover': 'tenants/1/cover.jpg' },
} as any

const structure = {
  pages: [
    {
      id: 'p1',
      elements: [
        { id: 'bg', type: 'shape', x: 0, y: 0, w: 1080, h: 1080, zIndex: 0, style: { fill: 'primary', radius: 0 } },
        { id: 'img', type: 'image', x: 40, y: 40, w: 1000, h: 600, zIndex: 1, binding: '{{asset.cover}}' },
        { id: 'title', type: 'text', x: 40, y: 680, w: 1000, h: 120, zIndex: 2, binding: '{{asset.title}}', style: { fontSize: 48, weight: 700, uppercase: true, color: '#ffffff' } },
        { id: 'price', type: 'text', x: 40, y: 820, w: 500, h: 60, zIndex: 2, binding: '{{asset.price}}', style: { fontSize: 36, align: 'right' } },
        { id: 'qr', type: 'qr', x: 900, y: 900, w: 140, h: 140, zIndex: 3, binding: '{{asset.url}}' },
        { id: 'missing', type: 'image', x: 0, y: 0, w: 10, h: 10, binding: '{{asset.nope}}' },
      ],
    },
  ],
} as any

describe('renderStructureHtml', () => {
  const html = renderStructureHtml({ structure, formatKey: 'social_feed_square', bindings, images: new Map([['tenants/1/cover.jpg', 'data:image/jpeg;base64,AAAA']]) })

  it('la página mide exactamente el formato y los elementos van en su sitio', () => {
    expect(html).toContain('width:1080px;height:1080px')
    expect(html).toContain('left:40px;top:680px;width:1000px;height:120px')
  })

  it('el texto se escapa, se pone en mayúsculas si toca y hereda el color de marca', () => {
    expect(html).toContain('ÁTICO CON &lt;VISTAS&gt; &amp; TERRAZA')
    expect(html).not.toContain('<vistas>')
    expect(html).toContain('background:#0a5c36')
    expect(html).toContain('text-align:right')
    expect(html).toContain('font-weight:700')
  })

  it('las imágenes van incrustadas como data URI y una imagen sin resolver no deja un hueco roto', () => {
    expect(html).toContain('src="data:image/jpeg;base64,AAAA"')
    expect(html).toContain('object-fit:cover')
    expect((html.match(/<img /g) || []).length).toBe(1)
  })

  it('el QR se dibuja como SVG dentro de su caja', () => {
    expect(html).toContain('<svg')
    expect(html).toContain('left:900px;top:900px')
  })

  it('respeta el orden de capas', () => {
    expect(html.indexOf('background:#0a5c36')).toBeLessThan(html.indexOf('<img '))
    expect(html.indexOf('<img ')).toBeLessThan(html.indexOf('ÁTICO'))
  })

  it('rechaza un formato desconocido', () => {
    expect(() => renderStructureHtml({ structure, formatKey: 'nope', bindings, images: new Map() })).toThrow(/Unknown formatKey/)
  })

  it('escapeHtmlText cubre los cinco caracteres', () => {
    expect(escapeHtmlText(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })

  it('looksLikePng reconoce la firma', () => {
    expect(looksLikePng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(true)
    expect(looksLikePng(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0]))).toBe(false)
  })
})

describe('disponibilidad de los formatos', () => {
  it('los PDF se producen siempre; los de redes sólo con el binding BROWSER', () => {
    expect(isFormatRenderable(FORMAT_BY_KEY.pdf_a4_portrait, {})).toBe(true)
    expect(isFormatRenderable(FORMAT_BY_KEY.social_feed_square, {})).toBe(false)
    expect(isFormatRenderable(FORMAT_BY_KEY.social_feed_square, { BROWSER: {} })).toBe(true)
    expect(isFormatRenderable(FORMAT_BY_KEY.social_story, { BROWSER: {} })).toBe(true)
    expect(isFormatRenderable(undefined, { BROWSER: {} })).toBe(false)
    expect(isSocialRenderingAvailable(undefined)).toBe(false)
  })

  it('el mensaje de "no disponible" dice qué falta, no "pendiente"', () => {
    expect(formatUnavailableMessage(FORMAT_BY_KEY.social_story)).toContain('BROWSER')
    expect(formatUnavailableMessage(FORMAT_BY_KEY.social_story)).toContain('wrangler.toml')
  })
})
