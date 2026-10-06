/**
 * Fechas de gestión de la propiedad (cierre D1p): fecha de captación e
 * inicio y vencimiento de la exclusiva. Son columnas de texto (migración
 * 0068) que el editor pedía como texto libre, así que hay fichas con
 * «15/03/2025», «2025-03-15» o «15-3-2025». Desde este cierre el editor las
 * pide con un selector de fecha y el servidor exige `AAAA-MM-DD` al
 * CAMBIARLAS; lo que ya estaba guardado no se reescribe, pero se LEE bien en
 * todas partes (caducidad de la exclusiva, filtros) con esta misma regla y su
 * gemela en SQL (`normalizedDateSql`, server/utils/properties/searchService.ts).
 */

export const PROPERTY_DATE_FIELDS = ['captureDate', 'exclusiveFrom', 'exclusiveUntil'] as const
export type PropertyDateField = (typeof PROPERTY_DATE_FIELDS)[number]

export const PROPERTY_DATE_FIELD_LABELS: Record<PropertyDateField, string> = {
  captureDate: 'Fecha de captación',
  exclusiveFrom: 'Exclusividad — inicio',
  exclusiveUntil: 'Exclusividad — vencimiento',
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function calendarDate(y: number, m: number, d: number): string | null {
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const t = new Date(Date.UTC(y, m - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** `AAAA-MM-DD` exacto y de calendario (sin 30 de febrero): lo único que el servidor acepta al cambiar una fecha. */
export function isStrictIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return !!m && calendarDate(Number(m[1]), Number(m[2]), Number(m[3])) !== null
}

/**
 * Lee una fecha guardada en cualquiera de los formatos habituales y la
 * devuelve como `AAAA-MM-DD`, o `null` si no es una fecha:
 *
 * - `AAAA-MM-DD` (con o sin hora detrás: `2025-03-15T10:00:00`);
 * - `dd/mm/aaaa`, `d/m/aaaa`, `dd-mm-aaaa`, `dd.mm.aaaa` (día primero, como se escribe en España);
 * - `aaaa/mm/dd` y `aaaa.mm.dd`.
 */
export function parsePropertyDate(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return calendarDate(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (m) return calendarDate(Number(m[3]), Number(m[2]), Number(m[1]))
  m = /^(\d{4})[/.](\d{2})[/.](\d{2})$/.exec(s)
  if (m) return calendarDate(Number(m[1]), Number(m[2]), Number(m[3]))
  return null
}

/** ¿Está guardada en un formato antiguo (se entiende, pero no es `AAAA-MM-DD`)? Lo usa el editor para avisar. */
export function isLegacyPropertyDate(value: unknown): boolean {
  if (value === null || value === undefined || String(value).trim() === '') return false
  return !isStrictIsoDate(String(value).trim()) && parsePropertyDate(value) !== null
}

/** Suma días a una fecha `AAAA-MM-DD` (en UTC, sin horas de por medio). */
export function addDaysToIsoDate(day: string, days: number): string {
  const t = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + days))
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
}
