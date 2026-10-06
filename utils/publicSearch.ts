/**
 * Filtros de la búsqueda de la WEB PÚBLICA (FASE 2/27) que comparten el
 * listado (`pages/propiedades/index.vue`), el mapa (`pages/mapa.vue`) y el
 * modal de filtros (`components/FiltersModal.vue`): qué cuenta en la insignia
 * de filtros activos y cómo se escribe «cerca de un punto» en la URL.
 *
 * El servidor (`server/api/public/properties.get.ts`) ya entiende todo esto:
 * `postalCode`, y `lat`/`lng`/`radiusKm` sobre las coordenadas QUE SE
 * PUBLICAN (redondeadas si la ubicación es aproximada).
 */

/** Filtros del modal que cuentan, uno a uno, en la insignia. */
export const PUBLIC_FILTER_KEYS = [
  'municipality',
  'neighborhood',
  'postalCode',
  'minPrice',
  'maxPrice',
  'minArea',
  'maxArea',
  'bedrooms',
  'bathrooms',
  'type',
  'status',
  'orientation',
  'minYear',
  'energy',
  'elevator',
  'pool',
  'garage',
  'terrace',
  'garden',
  'pets',
  'accessible',
] as const

/** Los tres parámetros del radio: van juntos y cuentan como UN filtro. */
export const NEARBY_KEYS = ['lat', 'lng', 'radiusKm'] as const

/** Radios que se ofrecen (km). El servidor acepta hasta 500 (`MAX_RADIUS_KM`). */
export const NEARBY_RADIUS_OPTIONS = [1, 2, 5, 10, 25, 50] as const
export const DEFAULT_NEARBY_RADIUS_KM = 5

type QueryLike = Record<string, unknown>

function present(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(present)
  return v !== undefined && v !== null && String(v).trim() !== ''
}

/** Un radio completo y numérico en la query (los tres parámetros), o null. */
export function nearbyFromQuery(query: QueryLike): { lat: number; lng: number; radiusKm: number } | null {
  if (!NEARBY_KEYS.every((k) => present(query[k]))) return null
  const lat = Number(query.lat)
  const lng = Number(query.lng)
  const radiusKm = Number(query.radiusKm)
  if (![lat, lng, radiusKm].every(Number.isFinite) || radiusKm <= 0) return null
  return { lat, lng, radiusKm }
}

/** Cuántos filtros hay activos: cada filtro del modal y, si lo hay, el radio (uno solo). */
export function countActivePublicFilters(query: QueryLike): number {
  const n = PUBLIC_FILTER_KEYS.filter((k) => present(query[k])).length
  return n + (nearbyFromQuery(query) ? 1 : 0)
}

/**
 * Redondea una coordenada a 3 decimales (~110 m), la cuadrícula mínima de la
 * ubicación aproximada: la posición del visitante («Mi ubicación») nunca sale
 * del navegador con más precisión que ésa (ver server/utils/permissionsPolicy.ts).
 */
export function roundSearchCoord(v: number): number {
  return Math.round(v * 1000) / 1000
}

/** Los parámetros de URL de «cerca de aquí». */
export function nearbyQuery(lat: number, lng: number, radiusKm: number): Record<'lat' | 'lng' | 'radiusKm', string> {
  return { lat: String(roundSearchCoord(lat)), lng: String(roundSearchCoord(lng)), radiusKm: String(radiusKm) }
}

/** La query sin el radio (para quitarlo, o para sustituirlo por otro). */
export function withoutNearby<T extends QueryLike>(query: T): Partial<T> {
  return Object.fromEntries(Object.entries(query).filter(([k]) => !(NEARBY_KEYS as readonly string[]).includes(k))) as Partial<T>
}

/**
 * Normaliza un código postal escrito a mano: sólo letras, cifras, espacio y
 * guion (así nunca lleva comodines de LIKE), en mayúsculas y como máximo 10
 * caracteres. Vacío si no queda nada.
 */
export function normalizePostalCode(v: unknown): string {
  return String(v ?? '')
    .replace(/[^0-9A-Za-z -]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .slice(0, 10)
}
