import { fontStack, isKnownFont } from './fonts'
import { PAGE_ROOT_ATTR } from './nodes'

/**
 * Estilos globales de la página del Constructor Web: lo que un nodo hereda
 * cuando no tiene override propio. Viven en `SitePageDocument.styles`, se
 * sanean aquí (lista cerrada, como los estilos de nodo) y se convierten en
 * CSS acotado a la raíz de la página, así que no tocan cabecera ni pie.
 *
 * Deliberadamente corto: tipografía de títulos, tipografía de texto y radio
 * de los botones. Un color global de títulos, por ejemplo, rompería las
 * secciones oscuras (títulos blancos sobre `bg-ink`); el color se decide
 * nodo a nodo, donde se ve lo que hay detrás.
 */
export interface SiteGlobalStyles {
  fontHeading?: string
  fontBody?: string
  /** px */
  buttonRadius?: number
}

export const BUTTON_RADIUS_MAX = 40

export function sanitizeGlobalStyles(input: unknown): SiteGlobalStyles | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const raw = input as Record<string, unknown>
  const out: SiteGlobalStyles = {}
  if (isKnownFont(raw.fontHeading)) out.fontHeading = raw.fontHeading
  if (isKnownFont(raw.fontBody)) out.fontBody = raw.fontBody
  const radius = typeof raw.buttonRadius === 'number' ? raw.buttonRadius : typeof raw.buttonRadius === 'string' && raw.buttonRadius !== '' ? Number(raw.buttonRadius) : NaN
  if (Number.isFinite(radius)) out.buttonRadius = Math.round(Math.min(BUTTON_RADIUS_MAX, Math.max(0, radius)))
  return Object.keys(out).length ? out : undefined
}

const ROOT = `[${PAGE_ROOT_ATTR}]`
/** Todo lo que el sitio trata como "título": las etiquetas y las dos clases que usan los bloques. */
const HEADING_SELECTORS = ['h1', 'h2', 'h3', '.heading-serif', '.font-serif'].map((s) => `${ROOT} ${s}`).join(',')
/** Botones de los bloques: las tres clases globales y las CTA propias del hero y del bloque de cierre. */
const BUTTON_SELECTORS = ['.btn-primary', '.btn-secondary', '.btn-quiet', '[data-sb-kind="button"]'].map((s) => `${ROOT} ${s}`).join(',')

export function buildGlobalStylesCss(styles: SiteGlobalStyles | undefined | null): string {
  if (!styles) return ''
  let css = ''
  if (styles.fontBody) css += `${ROOT}{font-family:${fontStack(styles.fontBody)}!important}`
  if (styles.fontHeading) css += `${HEADING_SELECTORS}{font-family:${fontStack(styles.fontHeading)}!important}`
  if (styles.buttonRadius !== undefined) css += `${BUTTON_SELECTORS}{border-radius:${styles.buttonRadius}px!important}`
  return css
}
