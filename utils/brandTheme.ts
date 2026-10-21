import { fontStack, googleFontsHref } from './siteBuilder/fonts'
import { PAGE_ROOT_ATTR } from './siteBuilder/nodes'

/**
 * Identidad de marca unificada de una agencia (Cola 22): el Brand Kit es la
 * fuente única de color y tipografía para la web, los emails y los carteles.
 * La resuelve server/utils/brandKit/identity.ts (que importa este tipo) y la
 * consume la web pública a través de este módulo. Tipo aquí (compartido) para
 * no acoplar código de servidor al cliente.
 */
export interface BrandIdentity {
  colors: {
    primary: string | null
    secondary: string | null
    background: string | null
    text: string | null
    accents: string[]
  }
  fonts: {
    heading: string | null
    body: string | null
    alt: string | null
  }
}

const ROOT = `[${PAGE_ROOT_ATTR}]`
// Mismos selectores de «título» que utils/siteBuilder/globalStyles.ts, para
// que el valor por defecto del Brand Kit y el override del Constructor caigan
// en las mismas reglas (y gane el del Constructor, que lleva !important).
const HEADING = ['h1', 'h2', 'h3', '.heading-serif', '.font-serif'].map((s) => `${ROOT} ${s}`).join(',')

/**
 * CSS de tema de marca para la web pública:
 *  - Variables de color (--brand-*) en :root, sólo las que existen.
 *  - Tipografías POR DEFECTO (sin !important) para el cuerpo y los títulos de
 *    la página. Como el Constructor (globalStyles) usa !important sobre los
 *    mismos selectores, cualquier fuente fijada en una página MANDA; el Brand
 *    Kit sólo rellena cuando la página no fijó fuente. Nunca rompe una web ya
 *    personalizada.
 * Los valores ya vienen saneados del resolver (HEX válidos, familias del
 * catálogo), así que no hay riesgo de inyección en la hoja.
 */
export function brandThemeCss(brand: BrandIdentity | null | undefined): string {
  if (!brand) return ''
  const c = brand.colors
  const vars: string[] = []
  if (c.primary) vars.push(`--brand-primary:${c.primary}`)
  if (c.secondary) vars.push(`--brand-secondary:${c.secondary}`)
  if (c.background) vars.push(`--brand-background:${c.background}`)
  if (c.text) vars.push(`--brand-text:${c.text}`)
  c.accents.forEach((a, i) => vars.push(`--brand-accent-${i + 1}:${a}`))
  let css = vars.length ? `:root{${vars.join(';')}}` : ''
  if (brand.fonts.body) css += `${ROOT}{font-family:${fontStack(brand.fonts.body)}}`
  if (brand.fonts.heading) css += `${HEADING}{font-family:${fontStack(brand.fonts.heading)}}`
  return css
}

/** El `<link>` de Google Fonts para las familias del Brand Kit presentes (o null). */
export function brandFontsHref(brand: BrandIdentity | null | undefined): string | null {
  if (!brand) return null
  const fams = [brand.fonts.heading, brand.fonts.body, brand.fonts.alt].filter((f): f is string => !!f)
  return googleFontsHref(fams)
}
