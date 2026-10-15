/**
 * Certificado energético de la ficha pública: la escala A–G de la etiqueta
 * oficial, los valores reales de la propiedad y lo que el Constructor Web
 * puede ajustar de su presentación. Los datos salen siempre de Property Core
 * (letra de consumo en la propiedad; consumo, letra y valor de emisiones y
 * caducidad del certificado en la ficha ampliada); el Constructor sólo decide
 * cómo se enseñan, nunca guarda una copia de los valores.
 */

export const ENERGY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
export type EnergyLetter = (typeof ENERGY_LETTERS)[number]

/**
 * Colores de la etiqueta: de verde intenso (A) a rojo (G). Fijos a propósito:
 * su significado no puede cambiar con el tema de cada web.
 */
export const ENERGY_COLORS: Record<EnergyLetter, string> = {
  A: '#0f8a43',
  B: '#37a646',
  C: '#9cc93b',
  D: '#f2d31c',
  E: '#f0b419',
  F: '#e8742a',
  G: '#d7262b',
}
/** El texto sobre cada flecha: blanco salvo en las claras (C, D, E), donde el blanco no contrasta. */
export const ENERGY_TEXT: Record<EnergyLetter, string> = { A: '#fff', B: '#fff', C: '#1c1b19', D: '#1c1b19', E: '#1c1b19', F: '#fff', G: '#fff' }
/** Longitud de cada flecha, en % del ancho de la columna: crece de A a G como en la etiqueta. */
export function energyBarWidth(letter: EnergyLetter): number {
  return 40 + ENERGY_LETTERS.indexOf(letter) * 10
}

export function parseEnergyLetter(v: unknown): EnergyLetter | null {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : ''
  return (ENERGY_LETTERS as readonly string[]).includes(s) ? (s as EnergyLetter) : null
}

/** Un valor de consumo o emisiones: un número de verdad, no negativo. El 0 es un dato. */
export function parseEnergyValue(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export interface EnergyData {
  /** Letra de consumo (la «calificación energética»). */
  rating: EnergyLetter | null
  consumption: number | null
  emissionsRating: EnergyLetter | null
  emissions: number | null
  /** Caducidad del certificado (AAAA-MM-DD), si consta. */
  certificateExpiry: string | null
}

export function energyData(project: Record<string, any> | null | undefined, details: Record<string, any> | null | undefined): EnergyData {
  const expiry = typeof details?.energyCertificateExpiry === 'string' && /^\d{4}-\d{2}-\d{2}/.test(details.energyCertificateExpiry) ? details.energyCertificateExpiry.slice(0, 10) : null
  return {
    rating: parseEnergyLetter(project?.energyRating),
    consumption: parseEnergyValue(details?.energyConsumption),
    emissionsRating: parseEnergyLetter(details?.emissionsRating),
    emissions: parseEnergyValue(details?.emissionsValue),
    certificateExpiry: expiry,
  }
}

/** ¿Hay algo que enseñar? Sin letra ni cifras, la tabla no sale (sin datos inventados). */
export function hasEnergyData(d: EnergyData): boolean {
  return !!(d.rating || d.emissionsRating || d.consumption != null || d.emissions != null)
}

/** «199,2»: una cifra decimal como la escribe la etiqueta en castellano (o en el idioma de la web). */
export function formatEnergyValue(n: number, locale = 'es-ES'): string {
  return n.toLocaleString(locale, { maximumFractionDigits: 1 })
}

/** Vigencia del certificado según su caducidad: vigente hasta…, o caducado. Sin fecha, nada. */
export function certificateStatus(expiry: string | null, today = new Date()): 'valid' | 'expired' | null {
  if (!expiry) return null
  const end = new Date(`${expiry}T23:59:59`)
  if (Number.isNaN(end.getTime())) return null
  return end.getTime() >= today.getTime() ? 'valid' : 'expired'
}

// ---------------------------------------------------------------------------
// Presentación (Constructor Web): lo único que se guarda. Lo mismo para la
// sección de la zona dinámica de la ficha y para el bloque de la biblioteca.
// ---------------------------------------------------------------------------

/** Una imagen subida al bloque (la etiqueta oficial, un gráfico explicativo, una foto del certificado). */
export interface EnergyImage {
  /** Clave del archivo subido (biblioteca de medios) o URL absoluta. */
  src: string
  /** Texto alternativo para lectores de pantalla. */
  alt: string
  /** Pie de la imagen (opcional). */
  caption: string
}

/** Cuántas imágenes admite un bloque: es una tabla con apoyo gráfico, no una galería. */
export const MAX_ENERGY_IMAGES = 6

export interface EnergyDisplayOptions {
  title: string
  showRating: boolean
  showConsumption: boolean
  showEmissions: boolean
  showCertificate: boolean
  note: string
  /** Presentación de la tabla: completa (las siete flechas) o compacta (sólo la letra de la propiedad). */
  layout: 'full' | 'compact'
  background: 'white' | 'paper' | 'tint'
  border: boolean
  radius: 'none' | 'md' | 'lg'
  padding: 'sm' | 'md' | 'lg'
  titleSize: 'sm' | 'md' | 'lg'
  width: 'full' | 'narrow'
  /** El bloque se pliega y se despliega pulsando su título. */
  collapsible: boolean
  /** Con «collapsible»: si llega desplegado (de partida sí: nada desaparece sin que el visitante lo pida). */
  startOpen: boolean
  /** Imágenes subidas al bloque, en el orden en que se enseñan. */
  images: EnergyImage[]
  /** Dónde van las imágenes respecto a la tabla. */
  imagesPosition: 'below' | 'above' | 'side'
}

export const ENERGY_DISPLAY_DEFAULTS: EnergyDisplayOptions = {
  title: '',
  showRating: true,
  showConsumption: true,
  showEmissions: true,
  showCertificate: true,
  note: '',
  layout: 'full',
  background: 'white',
  border: true,
  radius: 'lg',
  padding: 'md',
  titleSize: 'md',
  width: 'full',
  collapsible: true,
  startOpen: true,
  images: [],
  imagesPosition: 'below',
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(String(v)) ? (v as T) : fallback)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

/**
 * Las imágenes del bloque, limpias: sólo las que tienen origen válido (una
 * clave de la biblioteca o una URL http/https o una ruta del propio sitio),
 * con su texto alternativo y su pie acotados, y como mucho MAX_ENERGY_IMAGES.
 * Nunca `javascript:`, `data:` ni nada con esquema que no sea http(s).
 */
export function normalizeEnergyImages(v: unknown): EnergyImage[] {
  if (!Array.isArray(v)) return []
  const out: EnergyImage[] = []
  for (const raw of v) {
    if (out.length >= MAX_ENERGY_IMAGES) break
    // Una clave suelta (cadena) también vale: es lo que guarda la galería de imágenes del Constructor.
    const o = (typeof raw === 'string' ? { src: raw } : raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null
    const src = text(o?.src, 500)
    if (!src || !safeImageSrc(src)) continue
    out.push({ src, alt: text(o?.alt, 200), caption: text(o?.caption, 240) })
  }
  return out
}

function safeImageSrc(src: string): boolean {
  if (/^https?:\/\//i.test(src)) return true
  if (src.startsWith('//')) return false
  if (src.startsWith('/')) return !/[\s<>"']/.test(src)
  // Clave de la biblioteca de medios: carpeta/nombre.ext, sin esquema.
  return /^[A-Za-z0-9][A-Za-z0-9_\-./]*$/.test(src) && !src.includes('..')
}

/** Lo que llega del Constructor, limpio: sólo claves conocidas y valores permitidos. */
export function normalizeEnergyOptions(v: unknown): EnergyDisplayOptions {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const d = ENERGY_DISPLAY_DEFAULTS
  return {
    title: text(o.title, 80),
    showRating: bool(o.showRating, d.showRating),
    showConsumption: bool(o.showConsumption, d.showConsumption),
    showEmissions: bool(o.showEmissions, d.showEmissions),
    showCertificate: bool(o.showCertificate, d.showCertificate),
    note: text(o.note, 400),
    layout: pick(o.layout, ['full', 'compact'] as const, d.layout),
    background: pick(o.background, ['white', 'paper', 'tint'] as const, d.background),
    border: bool(o.border, d.border),
    radius: pick(o.radius, ['none', 'md', 'lg'] as const, d.radius),
    padding: pick(o.padding, ['sm', 'md', 'lg'] as const, d.padding),
    titleSize: pick(o.titleSize, ['sm', 'md', 'lg'] as const, d.titleSize),
    width: pick(o.width, ['full', 'narrow'] as const, d.width),
    collapsible: bool(o.collapsible, d.collapsible),
    startOpen: bool(o.startOpen, d.startOpen),
    images: normalizeEnergyImages(o.images),
    imagesPosition: pick(o.imagesPosition, ['below', 'above', 'side'] as const, d.imagesPosition),
  }
}

/** Sólo lo que difiere de lo de partida (lo que se guarda en la página). */
export function compactEnergyOptions(o: EnergyDisplayOptions): Partial<EnergyDisplayOptions> {
  const out: Partial<EnergyDisplayOptions> = {}
  for (const k of Object.keys(ENERGY_DISPLAY_DEFAULTS) as (keyof EnergyDisplayOptions)[]) {
    // Las imágenes son una lista: se guardan si hay alguna (el valor de partida es «ninguna»).
    if (k === 'images') {
      if (o.images.length) out.images = o.images
      continue
    }
    if (o[k] !== ENERGY_DISPLAY_DEFAULTS[k]) (out as any)[k] = o[k]
  }
  return out
}

/**
 * ¿Sale la tabla con estas opciones y estos datos? Con todo oculto o sin
 * ningún dato que enseñar, no: nada de tarjetas vacías.
 */
export function energyCardVisible(d: EnergyData, o: EnergyDisplayOptions): boolean {
  const rating = o.showRating && !!(d.rating || d.emissionsRating)
  const consumption = o.showConsumption && d.consumption != null
  const emissions = o.showEmissions && (d.emissions != null || !!d.emissionsRating)
  return rating || consumption || emissions
}
