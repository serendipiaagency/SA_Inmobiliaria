import { normalizeColor } from './nodes'

/**
 * El fondo de una sección del Constructor Web (Cola 27). Antes era sólo un
 * color de un enum cerrado (`paper`/`white`/`surface`/`ink`); ahora admite
 * además:
 *  - «Color corporativo» (`brand`): NO se guarda un HEX, se guarda el token
 *    `brand` y el color se resuelve en el render contra el Brand Kit de la
 *    empresa (resolveBrandIdentity / TENANT_BRANDING_OVERRIDE). Así, si la
 *    agencia cambia su color de marca, el fondo cambia con él.
 *  - Imagen de fondo (subir o de la biblioteca), con encaje (cover/contain),
 *    posición, repetición, una superposición de color con opacidad y un color
 *    de respaldo (el propio `background`, que se ve detrás o alrededor).
 *
 * Es lógica pura (sin Vue ni red): la usan el render del marco de bloque
 * (components/site-builder/SiteBlockFrame.vue) y el saneado del servidor
 * (server/utils/sitePages.ts), para que lo que se guarda y lo que se pinta
 * sean exactamente lo mismo.
 */

/** Colores de fondo con nombre. `brand` se resuelve en vivo; el resto son tokens del tema. */
export const BG_TOKENS = ['paper', 'white', 'surface', 'ink', 'brand'] as const
export type BgToken = (typeof BG_TOKENS)[number]

/** Clase Tailwind de cada token de tema (no `brand`, que es dinámico). */
export const BG_TOKEN_CLASS: Record<string, string> = { paper: 'bg-paper', white: 'bg-white', surface: 'bg-surface', ink: 'bg-ink' }

/** El HEX de cada token de tema, para cuando hay imagen y el color va en línea como respaldo. */
const BG_TOKEN_HEX: Record<string, string> = { paper: '#fdfcfa', white: '#ffffff', surface: '#f5f2ee', ink: '#16150f' }

const BG_SIZES = ['cover', 'contain'] as const
const BG_POSITIONS = ['center', 'top', 'bottom', 'left', 'right'] as const
const SPACING = ['sm', 'lg'] as const

export interface BlockStyle {
  anchorId?: string
  background?: string
  paddingTop?: string
  paddingBottom?: string
  /** Referencia de la imagen de fondo (clave de media o URL); la resuelve mediaUrl() en el render. */
  backgroundImage?: string
  backgroundSize?: 'cover' | 'contain'
  backgroundPosition?: string
  backgroundRepeat?: boolean
  /** Color de la superposición sobre la imagen (HEX). */
  overlayColor?: string
  /** Opacidad de la superposición, 0–100. */
  overlayOpacity?: number
}

// Una referencia de imagen segura: clave de media (letras, números, / . _ -),
// una URL http(s) o una ruta que empieza por «/». Sin espacios ni caracteres
// que pudieran romper un url(...) de CSS (paréntesis, comillas, backslash).
const SAFE_IMAGE_REF = /^(?:https?:\/\/[^\s)'"\\]+|\/[^\s)'"\\]*|[\w./-]+)$/

function slugifyAnchor(v: string): string {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

/**
 * Sanea el objeto `style` de un bloque a lo que de verdad entiende el render:
 * descarta claves desconocidas y valores fuera de rango. Devuelve undefined si
 * no queda nada (para no guardar un `style: {}` vacío). Las opciones de imagen
 * sólo se conservan si hay imagen.
 */
export function sanitizeBlockStyle(raw: unknown): BlockStyle | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, any>
  const out: BlockStyle = {}

  if (typeof r.anchorId === 'string') {
    const slug = slugifyAnchor(r.anchorId)
    if (slug) out.anchorId = slug
  }
  if (typeof r.background === 'string' && (BG_TOKENS as readonly string[]).includes(r.background)) out.background = r.background
  if ((SPACING as readonly string[]).includes(r.paddingTop)) out.paddingTop = r.paddingTop
  if ((SPACING as readonly string[]).includes(r.paddingBottom)) out.paddingBottom = r.paddingBottom

  if (typeof r.backgroundImage === 'string') {
    const ref = r.backgroundImage.trim()
    if (ref && ref.length <= 512 && SAFE_IMAGE_REF.test(ref)) {
      out.backgroundImage = ref
      out.backgroundSize = r.backgroundSize === 'contain' ? 'contain' : 'cover'
      if ((BG_POSITIONS as readonly string[]).includes(r.backgroundPosition)) out.backgroundPosition = r.backgroundPosition
      if (r.backgroundRepeat === true) out.backgroundRepeat = true
      const overlay = normalizeColor(r.overlayColor)
      const opacity = Number(r.overlayOpacity)
      if (overlay && overlay !== 'transparent' && Number.isFinite(opacity) && opacity > 0) {
        out.overlayColor = overlay
        out.overlayOpacity = Math.max(0, Math.min(100, Math.round(opacity)))
      }
    }
  }

  return Object.keys(out).length ? out : undefined
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length === 8) h = h.slice(0, 6)
  if (h.length !== 6) return null
  const n = Number.parseInt(h, 16)
  if (Number.isNaN(n)) return null
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Lo que el marco de bloque necesita para pintar el fondo: las clases Tailwind
 * (cuando el fondo es un token de tema y no hay imagen, como siempre) y/o un
 * estilo en línea (color de marca, o imagen con su superposición y respaldo).
 * `brandColor` es el color de marca ya resuelto (o null); `imageUrl` es la URL
 * de la imagen de fondo ya resuelta por mediaUrl() (o '').
 */
export function blockBackgroundRender(
  style: BlockStyle | null | undefined,
  opts: { brandColor?: string | null; imageUrl?: string | null } = {},
): { classes: string[]; inline: Record<string, string> } {
  const s = style || {}
  const classes: string[] = []
  const inline: Record<string, string> = {}
  const brand = opts.brandColor || null
  const imageUrl = opts.imageUrl || ''

  // El color de respaldo (en HEX) del fondo: el token de tema, o el de marca.
  const baseHex = s.background === 'brand' ? brand : s.background ? BG_TOKEN_HEX[s.background] || null : null

  if (imageUrl) {
    const layers: string[] = []
    if (s.overlayColor && s.overlayOpacity) {
      const rgb = hexToRgb(s.overlayColor)
      if (rgb) {
        const a = Math.max(0, Math.min(1, s.overlayOpacity / 100))
        const c = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`
        layers.push(`linear-gradient(0deg, ${c}, ${c})`)
      }
    }
    layers.push(`url("${imageUrl}")`)
    inline.backgroundImage = layers.join(', ')
    inline.backgroundSize = s.backgroundSize || 'cover'
    inline.backgroundPosition = s.backgroundPosition || 'center'
    inline.backgroundRepeat = s.backgroundRepeat ? 'repeat' : 'no-repeat'
    if (baseHex) inline.backgroundColor = baseHex
  } else if (s.background === 'brand') {
    if (brand) inline.backgroundColor = brand
  } else if (s.background && BG_TOKEN_CLASS[s.background]) {
    classes.push(BG_TOKEN_CLASS[s.background])
  }

  return { classes, inline }
}
