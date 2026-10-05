/**
 * Búsqueda geográfica (FASE 2): el cálculo compartido por el servidor (filtro
 * SQL del listado del panel y de la web pública) y el cliente (mapa del
 * listado, distancia en cada fila). Sin Leaflet ni nada del navegador, igual
 * que `coords.ts`: se importa explícitamente desde los dos lados.
 *
 * Dos formas de acotar:
 *  - **Zona visible / bounding box** (`north`, `south`, `east`, `west`): lo
 *    que se ve en el mapa. Si `west > east` la caja cruza el antimeridiano.
 *  - **Radio** (`lat`, `lng`, `radiusKm`): un punto (pulsado en el mapa o
 *    escrito a mano como coordenadas) y una distancia.
 *
 * El radio se filtra en SQL con la aproximación equirectangular
 * (Δlat·111,32 km; Δlng·111,32·cos(lat₀) km): sólo sumas y productos, sin
 * funciones trigonométricas, que D1 no garantiza. Para radios de hasta
 * cientos de km el error es <1 %, y antes se acota con la caja que envuelve
 * el círculo, así que la condición cara sólo mira candidatos cercanos.
 */

export const KM_PER_DEG_LAT = 111.32
export const MAX_RADIUS_KM = 500

export interface GeoBBox {
  north: number
  south: number
  east: number
  west: number
}

export interface GeoRadius {
  lat: number
  lng: number
  radiusKm: number
}

export interface GeoFilter {
  bbox?: GeoBBox
  radius?: GeoRadius
}

export class GeoFilterError extends Error {}

function num(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : Number.NaN
}

/**
 * Lee la caja y el radio de una query string. Ausente = sin filtro; presente
 * pero mal formado = error (nunca se ignora en silencio: ignorarlo devolvería
 * TODAS las propiedades y parecería que el filtro funciona).
 */
export function parseGeoQuery(query: Record<string, unknown>): GeoFilter {
  const out: GeoFilter = {}
  const n = num(query.north)
  const s = num(query.south)
  const e = num(query.east)
  const w = num(query.west)
  const anyBox = [n, s, e, w].some((v) => v !== null)
  if (anyBox) {
    if ([n, s, e, w].some((v) => v === null || Number.isNaN(v))) throw new GeoFilterError('La zona del mapa necesita norte, sur, este y oeste numéricos')
    if (n! < -90 || n! > 90 || s! < -90 || s! > 90) throw new GeoFilterError('Latitud fuera de rango (-90 a 90)')
    if (e! < -180 || e! > 180 || w! < -180 || w! > 180) throw new GeoFilterError('Longitud fuera de rango (-180 a 180)')
    if (s! > n!) throw new GeoFilterError('El sur de la zona no puede estar al norte del norte')
    out.bbox = { north: n!, south: s!, east: e!, west: w! }
  }
  const lat = num(query.lat)
  const lng = num(query.lng)
  const r = num(query.radiusKm)
  const anyRadius = [lat, lng, r].some((v) => v !== null)
  if (anyRadius) {
    if ([lat, lng, r].some((v) => v === null || Number.isNaN(v))) throw new GeoFilterError('La búsqueda por radio necesita latitud, longitud y radio (km) numéricos')
    if (lat! < -90 || lat! > 90) throw new GeoFilterError('Latitud fuera de rango (-90 a 90)')
    if (lng! < -180 || lng! > 180) throw new GeoFilterError('Longitud fuera de rango (-180 a 180)')
    if (r! <= 0 || r! > MAX_RADIUS_KM) throw new GeoFilterError(`El radio debe estar entre 0 y ${MAX_RADIUS_KM} km`)
    out.radius = { lat: lat!, lng: lng!, radiusKm: r! }
  }
  return out
}

/** km por grado de longitud a una latitud dada (con un mínimo para no dividir entre ~0 cerca de los polos). */
export function kmPerDegLng(lat: number): number {
  return Math.max(KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180), 0.01)
}

/** La caja que envuelve un círculo — el prefiltro barato del radio. */
export function radiusBounds(r: GeoRadius): GeoBBox {
  const dLat = r.radiusKm / KM_PER_DEG_LAT
  const dLng = r.radiusKm / kmPerDegLng(r.lat)
  return { north: Math.min(90, r.lat + dLat), south: Math.max(-90, r.lat - dLat), east: Math.min(180, r.lng + dLng), west: Math.max(-180, r.lng - dLng) }
}

/** Distancia real (haversine) en km entre dos puntos — la que se enseña en cada fila. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Los parámetros de URL de un filtro geográfico (para el estado del listado y las vistas guardadas). */
export function geoQueryKeys(): string[] {
  return ['north', 'south', 'east', 'west', 'lat', 'lng', 'radiusKm']
}
