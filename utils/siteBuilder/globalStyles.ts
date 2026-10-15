import { fontStack, isKnownFont } from './fonts'
import { normalizeColor, PAGE_ROOT_ATTR } from './nodes'

/**
 * Estilos globales de la página del Constructor Web: lo que un nodo hereda
 * cuando no tiene override propio. Viven en `SitePageDocument.styles`, se
 * sanean aquí (lista cerrada, como los estilos de nodo) y se convierten en
 * CSS acotado a la raíz de la página, así que no tocan cabecera ni pie.
 *
 * Deliberadamente corto: tipografía, radio de botones, ritmo vertical y una
 * paleta mínima. Sigue sin haber un color global de TÍTULOS, y es a propósito:
 * rompería las secciones oscuras (títulos blancos sobre `bg-ink`), así que el
 * color de un título se decide nodo a nodo, donde se ve lo que hay detrás.
 *
 * Todo es opcional y no emite nada si la página no lo define, así que una
 * página que no use estos tokens queda exactamente igual que antes. Y todo
 * sale acotado a la raíz de la página: no puede alcanzar la cabecera, el pie
 * ni el panel de administración.
 */
export interface SiteGlobalStyles {
  fontHeading?: string
  fontBody?: string
  /** px */
  buttonRadius?: number
  /**
   * Aire entre secciones, en px. Se añade ENTRE bloques en vez de reescribir
   * el padding de cada uno: así compone con el que ya trae cada bloque en vez
   * de pelearse con él, y el ritmo es un único número para toda la página —
   * que es lo que lo hace un sistema y no un margen suelto por sección.
   */
  sectionRhythm?: number
  /** Color de marca: fondo del botón principal y texto del secundario y de los enlaces editoriales. */
  colorPrimary?: string
  /** Color del texto corriente de la página. */
  colorText?: string
  /** Texto secundario. Afecta a las utilidades de gris que usan los bloques, por eso vive aquí y no nodo a nodo. */
  colorMuted?: string
  /** Bordes discretos: separadores y marcos de tarjeta. */
  colorBorder?: string
  /**
   * Relleno de las superficies elevadas (`.card`, `.bg-surface`): el beige
   * cálido del sistema. Permite que una página editorial las lleve a blanco
   * sin que una caja pesada rompa el aire del resto.
   */
  colorSurface?: string
}

export const BUTTON_RADIUS_MAX = 40
export const SECTION_RHYTHM_MAX = 200

function toNumber(raw: unknown): number {
  return typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number(raw) : NaN
}

export function sanitizeGlobalStyles(input: unknown): SiteGlobalStyles | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const raw = input as Record<string, unknown>
  const out: SiteGlobalStyles = {}
  if (isKnownFont(raw.fontHeading)) out.fontHeading = raw.fontHeading
  if (isKnownFont(raw.fontBody)) out.fontBody = raw.fontBody
  const radius = toNumber(raw.buttonRadius)
  if (Number.isFinite(radius)) out.buttonRadius = Math.round(Math.min(BUTTON_RADIUS_MAX, Math.max(0, radius)))
  const rhythm = toNumber(raw.sectionRhythm)
  if (Number.isFinite(rhythm)) out.sectionRhythm = Math.round(Math.min(SECTION_RHYTHM_MAX, Math.max(0, rhythm)))
  // Mismo validador de color que los estilos de nodo: sólo hexadecimal o
  // `transparent`, nunca una cadena arbitraria que acabaría dentro del CSS.
  for (const key of ['colorPrimary', 'colorText', 'colorMuted', 'colorBorder', 'colorSurface'] as const) {
    const color = normalizeColor(raw[key])
    if (color) out[key] = color
  }
  return Object.keys(out).length ? out : undefined
}

const ROOT = `[${PAGE_ROOT_ATTR}]`
/** Todo lo que el sitio trata como "título": las etiquetas y las dos clases que usan los bloques. */
const HEADING_SELECTORS = ['h1', 'h2', 'h3', '.heading-serif', '.font-serif'].map((s) => `${ROOT} ${s}`).join(',')
/** Botones de los bloques: las tres clases globales y las CTA propias del hero y del bloque de cierre. */
const BUTTON_SELECTORS = ['.btn-primary', '.btn-secondary', '.btn-quiet', '[data-sb-kind="button"]'].map((s) => `${ROOT} ${s}`).join(',')

/**
 * Las utilidades de gris con las que los bloques pintan el texto secundario.
 * Acoplarse a nombres de clase de Tailwind no es bonito, pero el alternativo
 * —declarar el color en cada uno de los cientos de nodos de texto de una
 * página— no es realista, y el acoplamiento queda encerrado en esta línea.
 */
const MUTED_SELECTORS = ['.text-stone-500', '.text-stone-450', '.text-stone-400']
/** Bordes discretos: la clase de línea del sistema y los separadores de tabla. */
const BORDER_SELECTORS = ['.border-line', '.divide-line > *']
/** Superficies elevadas: la tarjeta del sistema y la utilidad de fondo. */
const SURFACE_SELECTORS = ['.card', '.bg-surface']

export function buildGlobalStylesCss(styles: SiteGlobalStyles | undefined | null): string {
  if (!styles) return ''
  let css = ''
  if (styles.fontBody) css += `${ROOT}{font-family:${fontStack(styles.fontBody)}!important}`
  if (styles.fontHeading) css += `${HEADING_SELECTORS}{font-family:${fontStack(styles.fontHeading)}!important}`
  if (styles.buttonRadius !== undefined) css += `${BUTTON_SELECTORS}{border-radius:${styles.buttonRadius}px!important}`

  // Aire ENTRE secciones. Cada bloque es un hijo directo de la raíz, así que
  // el margen va en el hermano siguiente: el primer bloque no se despega de
  // la cabecera y el ritmo sale de un solo número. Sin `!important` porque
  // nada más pone margen ahí; si algún día lo hiciera, que gane el bloque.
  if (styles.sectionRhythm !== undefined) {
    css += `${ROOT}>div+div{margin-top:${styles.sectionRhythm}px}`
    // Un bloque que no ha renderizado nada (un `v-if` en falso deja sólo un
    // comentario) no debe aportar aire: si no, una sección vacía —el listado
    // del blog cuando todavía no hay artículos— abre el doble de hueco que
    // las demás y parece un fallo de maquetación.
    //
    // Va como regla aparte y no dentro de la anterior a propósito: si un
    // navegador no entiende `:has()`, descarta ESTA y conserva el ritmo, en
    // vez de quedarse la página entera sin él.
    css += `${ROOT}>div+div:not(:has(>*)){margin-top:0}`
  }

  if (styles.colorText) css += `${ROOT}{color:${styles.colorText}}`
  if (styles.colorMuted) css += `${MUTED_SELECTORS.map((sel) => `${ROOT} ${sel}`).join(',')}{color:${styles.colorMuted}}`
  if (styles.colorBorder) css += `${BORDER_SELECTORS.map((sel) => `${ROOT} ${sel}`).join(',')}{border-color:${styles.colorBorder}}`
  if (styles.colorSurface) css += `${SURFACE_SELECTORS.map((sel) => `${ROOT} ${sel}`).join(',')}{background-color:${styles.colorSurface}}`
  if (styles.colorPrimary) {
    // El principal se tiñe de marca; el secundario y los enlaces sólo toman
    // el color en texto y borde, que es lo que los mantiene discretos.
    css += `${ROOT} .btn-primary{background-color:${styles.colorPrimary};border-color:${styles.colorPrimary}}`
    css += `${ROOT} .btn-secondary,${ROOT} .btn-quiet{color:${styles.colorPrimary};border-color:${styles.colorPrimary}}`
  }
  return css
}
