import type { TemplateStructure, TemplateElement } from './types'
import type { AssetBindings } from './bindings'
import { BINDING_RE, resolveBindingText } from './pdfRenderer'
import { FORMAT_BY_KEY } from './formats'
import { renderQrSvg } from '../qr'

/**
 * La misma estructura de plantilla que dibuja pdfRenderer.ts, como una
 * página HTML autocontenida del tamaño exacto del formato: es lo que
 * Browser Rendering (Chromium sin cabeza, server/utils/assetExport/socialRenderer.ts)
 * captura como PNG para los formatos de redes.
 *
 * ## Por qué HTML y no SVG a mano
 *
 * Los formatos de redes necesitan un rasterizador, y en Workers no hay
 * canvas ni codegen dinámico (satori/resvg quedaron bloqueados por eso).
 * Browser Rendering pone un Chromium real: dándole HTML, el ajuste de texto,
 * las fuentes, el recorte de imágenes y el antialiasing los hace el
 * navegador, igual que en cualquier web. Un SVG generado a mano tendría que
 * reimplementar el ajuste de líneas sin métricas de fuente.
 *
 * Esta función es pura (sin evento, sin red, sin binding): recibe las
 * imágenes ya resueltas como data URIs y devuelve texto. Por eso se puede
 * probar sin navegador, que es lo único que no puede ejecutarse aquí.
 *
 * Coordenadas: las mismas que la plantilla (esquina superior izquierda,
 * unidades = píxeles del formato). Los estilos que entiende son los que ya
 * entendía el PDF (fontSize, weight, color, lineHeight, uppercase, align)
 * más `fill`/`radius` para las formas.
 */

export interface HtmlRenderInput {
  structure: TemplateStructure
  formatKey: string
  bindings: AssetBindings
  /** Clave de imagen (la misma de bindings.images) → data URI ya cargada. */
  images: Map<string, string>
}

/** Escapa también las comillas: el texto acaba dentro de atributos y nodos por igual. (Nombre distinto del escapeHtml de email/layout.ts para no colisionar en el auto-import de Nitro.) */
export function escapeHtmlText(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function cssColor(style: Record<string, unknown> | undefined, bindings: AssetBindings, key: 'color' | 'fill' = 'color'): string {
  const raw = style?.[key] as string | undefined
  const hex = (v: string | undefined, fallback: string) => (v && /^#?[0-9a-f]{6}$/i.test(v.trim()) ? (v.trim().startsWith('#') ? v.trim() : `#${v.trim()}`) : fallback)
  if (raw === 'primary') return hex(bindings.values['tenant.primaryColor'], '#14140f')
  if (raw === 'secondary') return hex(bindings.values['tenant.secondaryColor'], '#665933')
  if (raw === 'muted') return '#73706b'
  if (typeof raw === 'string') return hex(raw, key === 'fill' ? '#e5e0d8' : '#14140f')
  return key === 'fill' ? '#e5e0d8' : '#14140f'
}

function px(n: number): string {
  return `${Math.round(n * 100) / 100}px`
}

function box(el: TemplateElement): string {
  const rotation = el.rotation ? `transform:rotate(${Number(el.rotation)}deg);transform-origin:center;` : ''
  return `position:absolute;left:${px(el.x)};top:${px(el.y)};width:${px(el.w)};height:${px(el.h)};overflow:hidden;z-index:${Number(el.zIndex) || 0};${rotation}`
}

function renderText(el: TemplateElement, text: string, bindings: AssetBindings): string {
  const style = el.style || {}
  const fontSize = Number(style.fontSize) || 12
  const weight = style.weight && Number(style.weight) >= 600 ? 700 : 400
  const lineHeight = Number(style.lineHeight) || 1.3
  const align = ['center', 'right'].includes(String(style.align)) ? String(style.align) : 'left'
  const content = style.uppercase ? text.toUpperCase() : text
  const css = `${box(el)}font-size:${px(fontSize)};font-weight:${weight};line-height:${lineHeight};color:${cssColor(style, bindings)};text-align:${align};white-space:pre-wrap;overflow-wrap:anywhere;`
  return `<div style="${css}">${escapeHtmlText(content)}</div>`
}

function renderImage(el: TemplateElement, dataUri: string | null): string {
  if (!dataUri) return ''
  const fit = String((el.style || {}).fit || 'cover') === 'contain' ? 'contain' : 'cover'
  return `<div style="${box(el)}"><img src="${dataUri}" alt="" style="display:block;width:100%;height:100%;object-fit:${fit};"></div>`
}

function renderQr(el: TemplateElement, text: string): string {
  if (!text) return ''
  const svg = renderQrSvg(text, { errorCorrectionLevel: 'M' })
  return `<div style="${box(el)}background:#fff;">${svg.replace('<svg', '<svg style="display:block;width:100%;height:100%"')}</div>`
}

function renderShape(el: TemplateElement, bindings: AssetBindings): string {
  const style = el.style || {}
  const radius = Number(style.radius) || 0
  return `<div style="${box(el)}background:${cssColor(style, bindings, 'fill')};border-radius:${px(radius)};"></div>`
}

/** Índice de la página de la estructura que se rasteriza: la primera. Los formatos de redes son de una sola imagen. */
export const SOCIAL_PAGE_INDEX = 0

export function renderStructureHtml(input: HtmlRenderInput): string {
  const format = FORMAT_BY_KEY[input.formatKey]
  if (!format) throw new Error(`Unknown formatKey: ${input.formatKey}`)
  const page = input.structure.pages[SOCIAL_PAGE_INDEX]
  const elements = [...(page?.elements || [])].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))

  const body = elements
    .map((el) => {
      if (el.type === 'text') return renderText(el, resolveBindingText(el.binding, input.bindings), input.bindings)
      if (el.type === 'qr') return renderQr(el, resolveBindingText(el.binding, input.bindings))
      if (el.type === 'shape') return renderShape(el, input.bindings)
      if (el.type === 'image') {
        const match = el.binding ? BINDING_RE.exec(el.binding.trim()) : null
        const key = match ? input.bindings.images[match[1]] : null
        return renderImage(el, key ? (input.images.get(key) ?? null) : null)
      }
      return ''
    })
    .join('\n')

  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:#fff;}
  body{width:${px(format.widthPt)};height:${px(format.heightPt)};position:relative;overflow:hidden;font-family:Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;}
</style></head>
<body>
${body}
</body></html>`
}

/** Firma PNG: lo único que se puede validar de una imagen sin decodificarla. */
export function looksLikePng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}
