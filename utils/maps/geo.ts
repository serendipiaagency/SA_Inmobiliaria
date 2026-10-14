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
/** Zona dibujada a mano (Parte II del buscador): al menos un triángulo y, como mucho, lo que cabe en una URL legible. */
export const MIN_POLYGON_POINTS = 3
export const MAX_POLYGON_POINTS = 120
/** Parámetro de la URL: ?poly=lat,lng;lat,lng;… (5 decimales ≈ 1 m). */
export const POLYGON_PARAM = 'poly'

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

export interface GeoPoint {
  lat: number
  lng: number
}
/** Una zona dibujada: vértices en orden, sin repetir el primero al final. */
export type GeoPolygon = GeoPoint[]

export interface GeoFilter {
  bbox?: GeoBBox
  radius?: GeoRadius
  polygon?: GeoPolygon
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
  const poly = query[POLYGON_PARAM]
  const rawPoly = Array.isArray(poly) ? poly[0] : poly
  if (rawPoly !== null && rawPoly !== undefined && String(rawPoly).trim() !== '') out.polygon = parsePolygonParam(String(rawPoly))
  return out
}

// ---------------------------------------------------------------------------
// Zona dibujada (polígono)
// ---------------------------------------------------------------------------

const round5 = (n: number) => Math.round(n * 1e5) / 1e5

/**
 * Lee `poly=lat,lng;lat,lng;…`. Mal formado = error (nunca «todo»): un vértice
 * que no es un número, fuera de rango, menos de tres puntos distintos, más de
 * MAX_POLYGON_POINTS o una zona sin superficie (todos los puntos alineados).
 */
export function parsePolygonParam(raw: string): GeoPolygon {
  const parts = String(raw)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length > MAX_POLYGON_POINTS) throw new GeoFilterError(`La zona dibujada tiene demasiados vértices (máximo ${MAX_POLYGON_POINTS})`)
  const pts: GeoPolygon = []
  for (const part of parts) {
    const [a, b, ...rest] = part.split(',')
    const lat = num(a)
    const lng = num(b)
    if (rest.length || lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) throw new GeoFilterError('La zona dibujada tiene un vértice que no es «latitud,longitud»')
    if (lat < -90 || lat > 90) throw new GeoFilterError('Latitud fuera de rango (-90 a 90)')
    if (lng < -180 || lng > 180) throw new GeoFilterError('Longitud fuera de rango (-180 a 180)')
    pts.push({ lat: round5(lat), lng: round5(lng) })
  }
  // El cierre repetido (último = primero) no cuenta como vértice.
  if (pts.length > 1 && pts[0]!.lat === pts[pts.length - 1]!.lat && pts[0]!.lng === pts[pts.length - 1]!.lng) pts.pop()
  if (pts.length < MIN_POLYGON_POINTS) throw new GeoFilterError(`La zona dibujada necesita al menos ${MIN_POLYGON_POINTS} puntos`)
  if (Math.abs(signedArea(pts)) < 1e-10) throw new GeoFilterError('La zona dibujada no tiene superficie')
  return pts
}

/** El valor de `poly` para una zona (el inverso de parsePolygonParam). */
export function polygonParam(polygon: GeoPolygon): string {
  return polygon.map((p) => `${round5(p.lat)},${round5(p.lng)}`).join(';')
}

/** Área con signo en grados² (fórmula del cordón): sólo para saber si hay superficie. */
function signedArea(pts: GeoPolygon): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const q = pts[(i + 1) % pts.length]!
    a += p.lng * q.lat - q.lng * p.lat
  }
  return a / 2
}

/** La caja que envuelve la zona — el prefiltro barato en SQL. */
export function polygonBounds(polygon: GeoPolygon): GeoBBox {
  let north = -90
  let south = 90
  let east = -180
  let west = 180
  for (const p of polygon) {
    north = Math.max(north, p.lat)
    south = Math.min(south, p.lat)
    east = Math.max(east, p.lng)
    west = Math.min(west, p.lng)
  }
  return { north, south, east, west }
}

/** ¿Está el punto dentro de la zona? Trazado de rayo (par-impar); el borde cuenta como dentro. */
export function pointInPolygon(pt: GeoPoint, polygon: GeoPolygon): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    // Sobre un vértice o sobre una arista: dentro.
    if ((a.lat === pt.lat && a.lng === pt.lng) || onSegment(pt, a, b)) return true
    const crosses = a.lat > pt.lat !== b.lat > pt.lat
    if (crosses) {
      const x = ((b.lng - a.lng) * (pt.lat - a.lat)) / (b.lat - a.lat) + a.lng
      if (pt.lng < x) inside = !inside
    }
  }
  return inside
}
function onSegment(p: GeoPoint, a: GeoPoint, b: GeoPoint): boolean {
  const cross = (b.lng - a.lng) * (p.lat - a.lat) - (b.lat - a.lat) * (p.lng - a.lng)
  if (Math.abs(cross) > 1e-12) return false
  return p.lat >= Math.min(a.lat, b.lat) - 1e-12 && p.lat <= Math.max(a.lat, b.lat) + 1e-12 && p.lng >= Math.min(a.lng, b.lng) - 1e-12 && p.lng <= Math.max(a.lng, b.lng) + 1e-12
}

/**
 * Simplifica un trazo (Douglas-Peucker): quita los puntos que se desvían
 * menos de `tolerance` de la recta entre sus vecinos. En el navegador se usa
 * con píxeles (un trazo a mano alzada tiene cientos de puntos casi iguales).
 */
export function simplifyPath<T extends { x: number; y: number }>(points: T[], tolerance: number): T[] {
  if (points.length <= 2) return points.slice()
  const sq = tolerance * tolerance
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    let maxD = 0
    let idx = -1
    for (let i = first + 1; i < last; i++) {
      const d = perpSq(points[i]!, points[first]!, points[last]!)
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (idx > 0 && maxD > sq) {
      keep[idx] = true
      stack.push([first, idx], [idx, last])
    }
  }
  return points.filter((_, i) => keep[i])
}
function perpSq(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
  return (p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2
}

/** Como mucho `max` vértices, repartidos por el trazo (sin perder el primero ni el último). */
export function limitPolygonPoints<T>(points: T[], max = MAX_POLYGON_POINTS): T[] {
  if (points.length <= max) return points.slice()
  const out: T[] = []
  const step = (points.length - 1) / (max - 1)
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]!)
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
  return ['north', 'south', 'east', 'west', 'lat', 'lng', 'radiusKm', POLYGON_PARAM]
}
