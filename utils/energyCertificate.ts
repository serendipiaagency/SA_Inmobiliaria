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
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(String(v)) ? (v as T) : fallback)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

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
  }
}

/** Sólo lo que difiere de lo de partida (lo que se guarda en la página). */
export function compactEnergyOptions(o: EnergyDisplayOptions): Partial<EnergyDisplayOptions> {
  const out: Partial<EnergyDisplayOptions> = {}
  for (const k of Object.keys(ENERGY_DISPLAY_DEFAULTS) as (keyof EnergyDisplayOptions)[]) {
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
