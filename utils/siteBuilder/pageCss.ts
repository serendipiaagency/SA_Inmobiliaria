import { googleFontsHref } from './fonts'
import { buildGlobalStylesCss, type SiteGlobalStyles } from './globalStyles'
import { buildNodeStylesCss, type BlockWithNodeStyles } from './nodes'

/**
 * Lo que una página necesita en `<head>` para verse como se editó: una hoja
 * de estilos (globales primero, nodos después, para que el override de un
 * nodo gane al estilo global) y el `<link>` de Google Fonts para las
 * familias que usa. Lo consumen igual el lienzo del editor (en vivo, desde
 * el borrador) y la web pública (en el SSR, desde lo publicado).
 */
export interface PageStyleInput {
  blocks?: BlockWithNodeStyles[] | null
  styles?: SiteGlobalStyles | null
}

export function buildPageCss(doc: PageStyleInput | undefined | null): string {
  if (!doc) return ''
  return buildGlobalStylesCss(doc.styles) + buildNodeStylesCss(doc.blocks)
}

export function collectPageFonts(doc: PageStyleInput | undefined | null): string[] {
  const fonts = new Set<string>()
  if (!doc) return []
  if (doc.styles?.fontHeading) fonts.add(doc.styles.fontHeading)
  if (doc.styles?.fontBody) fonts.add(doc.styles.fontBody)
  for (const block of doc.blocks || []) {
    for (const style of Object.values(block?.nodeStyles || {})) {
      if (style.fontFamily) fonts.add(style.fontFamily)
      if (style.responsive?.tablet?.fontFamily) fonts.add(style.responsive.tablet.fontFamily)
      if (style.responsive?.mobile?.fontFamily) fonts.add(style.responsive.mobile.fontFamily)
    }
  }
  return [...fonts].sort()
}

export function pageFontsHref(doc: PageStyleInput | undefined | null): string | null {
  return googleFontsHref(collectPageFonts(doc))
}
