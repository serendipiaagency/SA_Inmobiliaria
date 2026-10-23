/**
 * Resolvedores de cliente compartidos para previsualizar una plantilla de Asset
 * Export / cartel: convierten un elemento de la estructura ({{token}} + estilo)
 * en el texto, la imagen y el CSS que se pintan en el lienzo del editor y en la
 * miniatura de la galería de «Plantillas». Replican lo que el render pdf-lib del
 * servidor (server/utils/assetExport/pdfRenderer.ts) hace con cada elemento,
 * para que la previsualización corresponda al documento final: sólo honran lo
 * que el PDF honra — texto {fontSize, weight, color, lineHeight, uppercase, con
 * la tipografía de marca}, imágenes por geometría (object-cover imita el
 * estirado a la caja) y QR. Las formas NO se dibujan en el PDF, así que tampoco
 * aquí, para no mentir sobre el resultado.
 *
 * Toman un `bindings` ({values, images}) que es la propiedad REAL (respuesta de
 * /api/admin/asset-export/preview-bindings) o, si no hay ninguna vinculada, la
 * propiedad ficticia de demostración (utils/assetExport/demoProperty.ts). La
 * demo vive sólo en el cliente y nunca llega a una exportación real.
 */
import { tokenLabel } from './tokenCatalog'
import { DEMO_BINDINGS, type AssetBindings } from './demoProperty'

export type { AssetBindings }

export interface RenderElement {
  id?: string
  type: 'text' | 'image' | 'qr' | 'shape'
  x: number
  y: number
  w: number
  h: number
  zIndex?: number
  binding?: string
  style?: Record<string, any>
}

/** La propiedad real si la hay; si no, la de demostración. */
export function bindingsOrDemo(preview: AssetBindings | null | undefined): AssetBindings {
  return preview ?? DEMO_BINDINGS
}

export function tokenOf(binding: string | undefined): string | null {
  const m = binding?.match(/^\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}$/)
  return m ? m[1] : null
}

/** Texto a pintar: valor del binding si existe, si no la etiqueta del campo; texto fijo si no es token. */
export function textContentFrom(el: RenderElement, b: AssetBindings): string {
  const token = tokenOf(el.binding)
  if (token) {
    const v = b.values[token]
    if (v) return el.style?.uppercase ? v.toUpperCase() : v
    return tokenLabel(el.binding!)
  }
  return el.binding || ''
}

/** URL de imagen del binding (o null → el llamador pinta un hueco discreto). */
export function imgUrlFrom(el: RenderElement, b: AssetBindings): string | null {
  const token = tokenOf(el.binding)
  return token ? b.images[token] || null : null
}

// Mismos roles de color que resolveColor del servidor (pdfRenderer.ts): un rol
// de marca se resuelve al color del Brand Kit o, si falta, a su defecto.
const ROLE_FALLBACK: Record<string, string> = { primary: '#141410', secondary: '#66593a', background: '#ffffff', text: '#141410', accent: '#66593a', muted: '#73706c' }
const ROLE_TOKEN: Record<string, string> = { primary: 'tenant.primaryColor', secondary: 'tenant.secondaryColor', background: 'tenant.backgroundColor', text: 'tenant.textColor', accent: 'tenant.accentColor' }

/** Color CSS que imita resolveColor del servidor: rol de marca → color del Brand Kit o su defecto; HEX → tal cual. */
export function resolveCssColorFrom(color: unknown, b: AssetBindings): string {
  if (typeof color !== 'string' || !color) return '#141410'
  if (ROLE_TOKEN[color]) return b.values[ROLE_TOKEN[color]] || ROLE_FALLBACK[color]
  if (color === 'muted') return ROLE_FALLBACK.muted
  return color
}

const WEBSAFE_FALLBACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/** Estilo CSS de un bloque de texto, a escala del lienzo, reflejando lo que hará el PDF. */
export function textCssFrom(el: RenderElement, scale: number, b: AssetBindings) {
  const s = el.style || {}
  const bold = Number(s.weight) >= 600
  // El PDF usa la fuente de cuerpo para el texto normal y la de titulares para
  // el peso fuerte (pdfRenderer.ts); reflejamos lo mismo con reserva web-safe.
  const family = bold ? b.values['tenant.fontHeading'] : b.values['tenant.fontBody']
  return {
    fontFamily: family ? `'${family}', ${WEBSAFE_FALLBACK}` : WEBSAFE_FALLBACK,
    fontSize: `${(Number(s.fontSize) || 12) * scale}px`,
    fontWeight: bold ? 700 : 400,
    color: resolveCssColorFrom(s.color, b),
    lineHeight: String(Number(s.lineHeight) || 1.3),
    textTransform: (s.uppercase ? 'uppercase' : 'none') as 'uppercase' | 'none',
    wordBreak: 'break-word' as const,
    overflow: 'hidden' as const,
  }
}

/** Elementos de la primera página ordenados por zIndex (como sortedElements del PDF). */
export function firstPageElements(structure: unknown): RenderElement[] {
  let s: any = structure
  if (typeof s === 'string') {
    try {
      s = JSON.parse(s)
    } catch {
      return []
    }
  }
  const els: RenderElement[] = s?.pages?.[0]?.elements ?? []
  return [...els].sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0))
}
