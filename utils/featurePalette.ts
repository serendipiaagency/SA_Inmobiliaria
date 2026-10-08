/**
 * Colores de los iconos de «Datos clave» en la ficha pública de una
 * propiedad: una paleta corta y controlada (marca, verde, azul, mostaza,
 * violeta, coral y verde azulado) que se deriva del color de marca de cada
 * inmobiliaria — no una paleta fija que sólo case con una de ellas.
 *
 *  - Se gira el tono de la marca: el primer color es la marca y los demás
 *    guardan con ella las mismas distancias que con el terracota de Portal
 *    INMO (lo que se usa si la empresa no tiene color de marca, o si el suyo
 *    es un gris sin tono).
 *  - Determinista: el mismo concepto (dormitorios, piscina…) cae siempre en
 *    el mismo color dentro de una web (`FACT_TONE_SLOT`).
 *  - Legible: cada icono se oscurece hasta tener un contraste de al menos
 *    4,5:1 con su fondo (WCAG AA para texto, más de lo que pide un icono).
 */

export interface IconTone {
  /** Color del trazo del icono. */
  fg: string
  /** Fondo del círculo del icono. */
  bg: string
}

/** Terracota de Portal INMO: la marca por defecto. */
export const DEFAULT_BRAND_HUE = 22
export const MIN_ICON_CONTRAST = 4.5

/** Cada matiz, como distancia de tono a la marca y saturación propia. */
const SLOTS: { name: string; offset: number; sat: number }[] = [
  { name: 'marca', offset: 0, sat: 52 },
  { name: 'verde', offset: 112, sat: 36 },
  { name: 'azul', offset: 190, sat: 46 },
  { name: 'mostaza', offset: 24, sat: 70 },
  { name: 'violeta', offset: 246, sat: 30 },
  { name: 'coral', offset: -16, sat: 62 },
  { name: 'verde azulado', offset: 156, sat: 42 },
]

export const PALETTE_SIZE = SLOTS.length

/**
 * Qué color lleva cada dato. Por significado cuando lo hay (agua → azul,
 * jardín → verde, sol → mostaza, calor → coral) y repartido para que dos
 * datos que suelen ir juntos no compartan color.
 */
export const FACT_TONE_SLOT: Record<string, number> = {
  propertyType: 0,
  bedrooms: 0,
  bathrooms: 2,
  area: 1,
  yearBuilt: 5,
  status: 3,
  condition: 6,
  street: 5,
  floor: 2,
  elevator: 4,
  garage: 6,
  terrace: 3,
  garden: 1,
  pool: 2,
  storage: 0,
  plot: 1,
  heating: 5,
  airConditioning: 2,
  energyRating: 1,
  orientation: 3,
  pets: 0,
  accessible: 6,
}

export function hexToHsl(hex: string | null | undefined): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const raw = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  const r = parseInt(raw.slice(0, 2), 16) / 255
  const g = parseInt(raw.slice(2, 4), 16) / 255
  const b = parseInt(raw.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: s * 100, l: l * 100 }
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const lig = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`
}

function luminance(hex: string): number {
  const raw = hex.replace('#', '')
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(raw.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** Contraste WCAG entre dos colores hex. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** La paleta de una web, a partir de su color de marca (o del terracota por defecto). */
export function iconPalette(brandColor?: string | null): IconTone[] {
  const brand = hexToHsl(brandColor)
  const hue = brand && brand.s >= 12 ? brand.h : DEFAULT_BRAND_HUE
  return SLOTS.map((slot) => {
    const h = (((hue + slot.offset) % 360) + 360) % 360
    const bg = hslToHex(h, Math.min(72, slot.sat + 20), 94)
    let l = 38
    let fg = hslToHex(h, slot.sat, l)
    while (contrastRatio(fg, bg) < MIN_ICON_CONTRAST && l > 10) {
      l -= 2
      fg = hslToHex(h, slot.sat, l)
    }
    return { fg, bg }
  })
}

/** El color de un dato dentro de una paleta. Un dato sin color asignado usa el de la marca. */
export function toneFor(key: string, palette: IconTone[]): IconTone {
  return palette[(FACT_TONE_SLOT[key] ?? 0) % palette.length]
}
