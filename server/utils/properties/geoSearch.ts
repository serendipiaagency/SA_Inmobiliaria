import { sql, type SQL } from 'drizzle-orm'
import { createError } from 'h3'
import { GeoFilterError, KM_PER_DEG_LAT, kmPerDegLng, parseGeoQuery, radiusBounds, type GeoBBox, type GeoFilter, type GeoRadius } from '../../../utils/maps/geo'

/**
 * Búsqueda geográfica (FASE 2) en SQL: zona visible del mapa (bounding box)
 * y radio alrededor de un punto. El cálculo vive en `utils/maps/geo.ts`
 * (compartido con el cliente); aquí sólo se traduce a condiciones.
 *
 * Recibe las expresiones de latitud y longitud, no la tabla: el listado del
 * panel filtra por las coordenadas reales, y la web pública por las que
 * enseña (redondeadas si la ubicación es aproximada) — así buscar por zona
 * nunca revela más precisión de la que ya se publica.
 */

export type { GeoFilter, GeoBBox, GeoRadius }

/** Igual que `parseGeoQuery`, con el error convertido en un 422 legible. */
export function parseGeoFilters(query: Record<string, unknown>): GeoFilter {
  try {
    return parseGeoQuery(query)
  } catch (e) {
    if (e instanceof GeoFilterError) throw createError({ statusCode: 422, statusMessage: e.message })
    throw e
  }
}

function bboxCond(lat: unknown, lng: unknown, b: GeoBBox): SQL {
  const latCond = sql`${lat} between ${b.south} and ${b.north}`
  // Una caja que cruza el antimeridiano (oeste > este) son dos franjas.
  const lngCond = b.west <= b.east ? sql`${lng} between ${b.west} and ${b.east}` : sql`(${lng} >= ${b.west} or ${lng} <= ${b.east})`
  return sql`(${latCond} and ${lngCond})`
}

/**
 * Las coordenadas que se PUBLICAN de una propiedad, como expresiones SQL: si
 * la ubicación es aproximada, redondeadas a la cuadrícula de su radio de
 * privacidad (`approximateGridDegrees()`, mínimo 0,001°), igual que
 * `toPublicProperty()`. Lo usan la búsqueda pública y las alertas de
 * búsquedas guardadas: buscar por zona nunca afina más que el pin publicado.
 */
export function publicCoordsSql(P: { lat: unknown; lng: unknown; locationPrivacy: unknown; locationPrivacyRadius: unknown }): { lat: SQL; lng: SQL } {
  const grid = sql`max(0.001, coalesce(${P.locationPrivacyRadius}, 0) / 111000.0)`
  return {
    lat: sql`(case when ${P.locationPrivacy} = 'approximate' then round(${P.lat} / ${grid}) * ${grid} else ${P.lat} end)`,
    lng: sql`(case when ${P.locationPrivacy} = 'approximate' then round(${P.lng} / ${grid}) * ${grid} else ${P.lng} end)`,
  }
}

/** Distancia al cuadrado (km²) con la aproximación equirectangular — para ordenar y para el filtro de radio. */
export function squaredDistanceSql(lat: unknown, lng: unknown, r: Pick<GeoRadius, 'lat' | 'lng'>): SQL<number> {
  const ky = KM_PER_DEG_LAT
  const kx = kmPerDegLng(r.lat)
  return sql<number>`(((${lat}) - ${r.lat}) * ${ky}) * (((${lat}) - ${r.lat}) * ${ky}) + (((${lng}) - ${r.lng}) * ${kx}) * (((${lng}) - ${r.lng}) * ${kx})`
}

/**
 * Condiciones de la caja y/o el radio. Sin filtro geográfico no añade nada;
 * con él, una propiedad sin coordenadas (o con el (0,0) de «sin asignar»,
 * ver `utils/maps/coords.ts`) nunca entra.
 */
export function geoConds(lat: unknown, lng: unknown, geo: GeoFilter | undefined): SQL[] {
  if (!geo || (!geo.bbox && !geo.radius)) return []
  const conds: SQL[] = [sql`(${lat} is not null and ${lng} is not null and not (${lat} = 0 and ${lng} = 0))`]
  if (geo.bbox) conds.push(bboxCond(lat, lng, geo.bbox))
  if (geo.radius) {
    conds.push(bboxCond(lat, lng, radiusBounds(geo.radius)))
    conds.push(sql`${squaredDistanceSql(lat, lng, geo.radius)} <= ${geo.radius.radiusKm * geo.radius.radiusKm}`)
  }
  return conds
}
