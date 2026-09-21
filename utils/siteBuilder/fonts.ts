/**
 * Catálogo de tipografías del Constructor Web.
 *
 * Es una lista cerrada a propósito: el nombre de la fuente acaba dentro de
 * una regla CSS que se sirve en la web pública, así que sólo se admite lo
 * que está aquí (sanitizeNodeStyle lo comprueba) — nunca una cadena libre.
 * Todas están en Google Fonts; `googleFontsHref()` construye el único
 * `<link>` que hace falta para las que usa una página, y el lienzo del
 * editor y la web publicada lo cargan igual, así que lo que se ve editando
 * es lo que se publica.
 *
 * Inter ya la carga nuxt.config.ts para todo el sitio; aparece en la lista
 * para poder elegirla, pero no se vuelve a pedir a Google.
 */
export interface SiteFont {
  family: string
  category: 'sans' | 'serif' | 'display'
  /** Pesos que se piden a Google Fonts; los controles de peso sólo ofrecen estos. */
  weights: number[]
}

export const SITE_FONTS: SiteFont[] = [
  { family: 'Inter', category: 'sans', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Manrope', category: 'sans', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'DM Sans', category: 'sans', weights: [300, 400, 500, 600, 700] },
  { family: 'Work Sans', category: 'sans', weights: [300, 400, 500, 600, 700] },
  { family: 'Poppins', category: 'sans', weights: [300, 400, 500, 600, 700] },
  { family: 'Montserrat', category: 'sans', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Space Grotesk', category: 'sans', weights: [300, 400, 500, 600, 700] },
  { family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'DM Serif Display', category: 'display', weights: [400] },
  { family: 'Cormorant Garamond', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'Merriweather', category: 'serif', weights: [300, 400, 700] },
  { family: 'Libre Baskerville', category: 'serif', weights: [400, 700] },
]

const BY_FAMILY = new Map(SITE_FONTS.map((f) => [f.family, f]))

/** Fuentes que nuxt.config.ts ya carga para todo el sitio. */
const PRELOADED = new Set(['Inter'])

export function isKnownFont(family: unknown): family is string {
  return typeof family === 'string' && BY_FAMILY.has(family)
}

export function fontDef(family: string): SiteFont | undefined {
  return BY_FAMILY.get(family)
}

/** Valor listo para `font-family:` — con comillas y con la reserva genérica de su categoría. */
export function fontStack(family: string): string {
  const def = BY_FAMILY.get(family)
  const fallback = def?.category === 'sans' || !def ? 'ui-sans-serif, system-ui, sans-serif' : 'ui-serif, Georgia, serif'
  return `"${family}", ${fallback}`
}

/**
 * Un solo href de Google Fonts para las familias dadas (las desconocidas y
 * las ya cargadas se ignoran). `null` cuando no hace falta pedir nada.
 */
export function googleFontsHref(families: Iterable<string>): string | null {
  const wanted = [...new Set(families)].filter((f) => isKnownFont(f) && !PRELOADED.has(f)).sort()
  if (!wanted.length) return null
  const params = wanted.map((family) => {
    const def = BY_FAMILY.get(family)!
    return `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${def.weights.join(';')}`
  })
  return `https://fonts.googleapis.com/css2?${params.join('&')}&display=swap`
}
