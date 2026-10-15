import { parsePropertyDate } from './propertyDates'

/**
 * El bloque «Última actualización · Publicada el · Referencia del anuncio»
 * de la ficha pública (components/property/ListingMeta.vue), debajo de
 * «Atendido por». Lógica pura, sin Vue: lo que decide qué filas salen y con
 * qué texto se prueba aquí (test/unit/listingMeta.test.ts).
 *
 * Las fechas se leen como las guarda la base de datos (`AAAA-MM-DD HH:MM:SS`
 * en UTC, server/utils/db.ts → now()), y también en ISO o sólo con el día
 * (`publishedAt` es un texto que el editor pedía libre). Una fila sin dato
 * no se devuelve: sin ninguna, el bloque no existe.
 *
 * Todo se calcula en días UTC, tanto en el servidor como en el navegador:
 * así «Hoy» es la misma palabra en el HTML del servidor y al hidratar.
 */

export type ListingMetaKey = 'updated' | 'published' | 'reference'

export interface ListingMetaRow {
  key: ListingMetaKey
  label: string
  value: string
  /** La fecha en ISO para `<time datetime>`; sólo en las filas con fecha. */
  datetime?: string
}

type Translate = (key: string, fallback: string) => string

const DAY_MS = 86_400_000
/** Fecha y hora sin zona horaria (`2026-10-14 09:30:00` o `2026-10-14T09:30:00`): es UTC. */
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/

/** Una fecha de la fila (texto en cualquiera de los formatos guardados, o un Date) → Date, o null si no lo es. */
export function parseRowDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : new Date(v.getTime())
  if (typeof v === 'number') return Number.isFinite(v) ? new Date(v) : null
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  if (NAIVE_DATETIME.test(s)) {
    const d = new Date(`${s.replace(' ', 'T')}Z`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  // ISO completo con zona horaria (`2026-10-14T09:30:00Z`, `…+02:00`).
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }
  // Sólo el día, en cualquiera de los formatos que entiende el editor (`15/03/2025`, `2025-03-15`…).
  const day = parsePropertyDate(s)
  return day ? new Date(`${day}T00:00:00Z`) : null
}

/** El día UTC (en ms desde la época) al que pertenece una fecha. */
function utcDay(d: Date): number {
  return Math.floor(d.getTime() / DAY_MS)
}

/** La fecha entera en el idioma de la web: «14 de octubre de 2026». Siempre en UTC (servidor y navegador iguales). */
export function formatListingDate(d: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
  } catch {
    return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
  }
}

/**
 * «Hoy», «Ayer» o «Hace n días» si la fecha es de esta semana (menos de 7
 * días); si no (o si es futura), la fecha entera.
 */
export function relativeDate(d: Date, now: Date, locale: string, t: Translate): string {
  const days = utcDay(now) - utcDay(d)
  if (days === 0) return t('ficha.meta.today', 'Hoy')
  if (days === 1) return t('ficha.meta.yesterday', 'Ayer')
  if (days > 1 && days < 7) return t('ficha.meta.daysAgo', 'Hace {n} días').replace('{n}', String(days))
  return formatListingDate(d, locale)
}

/**
 * Las filas del bloque: la última modificación (relativa si es reciente), la
 * fecha de publicación (o, sin ella, la de alta) y la misma «REF:» que
 * enseña la tarjeta principal. Sin dato, la fila no está.
 */
export function listingMetaRows(project: Record<string, any> | null | undefined, reference: string | null | undefined, locale: string, t: Translate, now: Date = new Date()): ListingMetaRow[] {
  const p = project || {}
  const rows: ListingMetaRow[] = []
  const updated = parseRowDate(p.updatedAt)
  if (updated) rows.push({ key: 'updated', label: t('ficha.meta.updated', 'Última actualización'), value: relativeDate(updated, now, locale, t), datetime: updated.toISOString() })
  const published = parseRowDate(p.publishedAt) ?? parseRowDate(p.createdAt)
  if (published) rows.push({ key: 'published', label: t('ficha.meta.published', 'Publicada el'), value: formatListingDate(published, locale), datetime: published.toISOString() })
  const ref = String(reference ?? '').trim()
  if (ref) rows.push({ key: 'reference', label: t('ficha.meta.reference', 'Referencia del anuncio'), value: ref })
  return rows
}
