import type { ContactTone } from './siteBuilder/pages'

/**
 * Fondo de «Atendido por» en la ficha pública (megaprompt «ficha», 4.4): un
 * tono suave que la distingue del resto de tarjetas. De partida sale del
 * color de marca de la inmobiliaria (su Brand Kit), nunca de un verde fijo
 * para todas; sin color de marca, un verde salvia pálido. El Constructor
 * puede dejarla en blanco o elegir un color propio.
 *
 * El texto de la tarjeta es oscuro, así que el fondo se aclara siempre lo
 * necesario para que se lea bien: aunque se elija un color intenso, la
 * tarjeta queda clara (luminancia mínima `MIN_LUMINANCE`).
 */

export interface ContactToneColors {
  bg: string
  border: string
}

/** Verde salvia pálido: el fondo de partida si la empresa no tiene color de marca. */
export const SAGE_TONE: ContactToneColors = { bg: '#eef3ee', border: '#d6e2d7' }
/** Lo bastante claro para el texto secundario oscuro de la tarjeta (contraste AA). */
export const MIN_LUMINANCE = 0.85
/** Cuánto color de marca lleva el fondo de partida: se nota sin saturar. */
const BRAND_WEIGHT = 0.1

type Rgb = [number, number, number]

function parseHex(v: string | null | undefined): Rgb | null {
  const m = typeof v === 'string' ? /^#?([0-9a-f]{6})$/i.exec(v.trim()) : null
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (c: Rgb) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`
/** `w` de color sobre blanco. */
const overWhite = (c: Rgb, w: number): Rgb => c.map((x) => 255 - (255 - x) * w) as Rgb

export function relativeLuminance(c: Rgb): number {
  const lin = (x: number) => {
    const s = x / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
}

/** El tono más intenso (hasta `maxWeight`) que sigue siendo claro para el texto. */
function lightTint(c: Rgb, maxWeight: number): ContactToneColors {
  let w = maxWeight
  while (w > 0.04 && relativeLuminance(overWhite(c, w)) < MIN_LUMINANCE) w -= 0.02
  return { bg: toHex(overWhite(c, w)), border: toHex(overWhite(c, Math.min(1, w * 2.2 + 0.04))) }
}

/** Los colores de la tarjeta para un tono; `null` es la tarjeta blanca de siempre. */
export function contactToneColors(tone: ContactTone, brandColor?: string | null): ContactToneColors | null {
  if (tone === 'white') return null
  if (tone === 'brand') {
    const brand = parseHex(brandColor)
    return brand ? lightTint(brand, BRAND_WEIGHT) : SAGE_TONE
  }
  const custom = parseHex(tone)
  return custom ? lightTint(custom, 1) : SAGE_TONE
}
