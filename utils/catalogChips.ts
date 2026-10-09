import { nearbyFromQuery } from './publicSearch'

/**
 * Los chips de filtros activos del catálogo público (#109): uno por criterio
 * que hay en la URL, con su texto y las claves que hay que quitar al pulsar su
 * «×». Sin filtros, ninguno — nunca chips de ejemplo.
 */

export interface CatalogChip {
  key: string
  label: string
  /** Lo que se borra de la URL al quitar el chip. */
  clear: string[]
}

type Query = Record<string, unknown>
type Translate = (key: string, fallback: string) => string

const present = (v: unknown) => v != null && v !== ''
const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

const FEATURES: [string, string, string][] = [
  ['terrace', 'filters.feature.terrace', 'Terraza'],
  ['pool', 'filters.feature.pool', 'Piscina'],
  ['garage', 'filters.feature.garage', 'Garaje'],
  ['garden', 'filters.feature.garden', 'Jardín'],
  ['elevator', 'filters.feature.elevator', 'Ascensor'],
  ['pets', 'filters.feature.pets', 'Admite mascotas'],
  ['accessible', 'filters.feature.accessible', 'Accesible'],
]
const STATUS: Record<string, [string, string]> = {
  new: ['filters.status.new', 'Obra nueva'],
  under_construction: ['filters.status.underConstruction', 'En construcción'],
  ready: ['filters.status.ready', 'Listo para entrar'],
}

function range(min: number, max: number, fmt: (n: number) => string): string {
  if (min && max) return `${fmt(min)} - ${fmt(max)}`
  if (min) return `> ${fmt(min)}`
  return `< ${fmt(max)}`
}

export function catalogChips(query: Query, t: Translate, formatPrice: (n: number) => string, typeLabel: (type: string) => string): CatalogChip[] {
  const out: CatalogChip[] = []
  if (present(query.q)) out.push({ key: 'q', label: `«${String(query.q)}»`, clear: ['q'] })
  if (query.operacion === 'venta') out.push({ key: 'operacion', label: t('catalog.forSale', 'En venta'), clear: ['operacion'] })
  if (query.operacion === 'alquiler') out.push({ key: 'operacion', label: t('catalog.forRent', 'En alquiler'), clear: ['operacion'] })
  if (present(query.municipality)) out.push({ key: 'municipality', label: String(query.municipality), clear: ['municipality'] })
  if (present(query.neighborhood)) out.push({ key: 'neighborhood', label: String(query.neighborhood), clear: ['neighborhood'] })
  if (present(query.postalCode)) out.push({ key: 'postalCode', label: `CP ${String(query.postalCode)}`, clear: ['postalCode'] })
  if (['north', 'south', 'east', 'west'].every((k) => present(query[k]))) out.push({ key: 'area-map', label: t('catalog.mapArea', 'Zona del mapa'), clear: ['north', 'south', 'east', 'west'] })
  const nearby = nearbyFromQuery(query as Record<string, any>)
  if (nearby) out.push({ key: 'nearby', label: `${t('catalog.radius', 'Radio')} ${nearby.radiusKm} km`, clear: ['lat', 'lng', 'radiusKm'] })
  const minP = num(query.minPrice)
  const maxP = num(query.maxPrice)
  if (minP || maxP) out.push({ key: 'price', label: range(minP, maxP, formatPrice), clear: ['minPrice', 'maxPrice'] })
  const minA = num(query.minArea)
  const maxA = num(query.maxArea)
  if (minA || maxA) out.push({ key: 'area', label: range(minA, maxA, (n) => `${n} m²`), clear: ['minArea', 'maxArea'] })
  const beds = num(query.bedrooms)
  if (beds) out.push({ key: 'bedrooms', label: `${beds}+ ${t('catalog.bedroomsShort', 'habitaciones')}`, clear: ['bedrooms'] })
  const baths = num(query.bathrooms)
  if (baths) out.push({ key: 'bathrooms', label: `${baths}+ ${t('catalog.bathroomsShort', 'baños')}`, clear: ['bathrooms'] })
  if (present(query.type)) out.push({ key: 'type', label: typeLabel(String(query.type)), clear: ['type'] })
  if (present(query.status)) {
    const s = STATUS[String(query.status)]
    out.push({ key: 'status', label: s ? t(s[0], s[1]) : String(query.status), clear: ['status'] })
  }
  if (query.obra === 'nueva') out.push({ key: 'obra', label: t('catalog.newBuild', 'Obra nueva'), clear: ['obra'] })
  if (query.obra === 'segunda') out.push({ key: 'obra', label: t('catalog.secondHand', 'Segunda mano'), clear: ['obra'] })
  const minYield = num(query.minYield)
  if (minYield) out.push({ key: 'minYield', label: t('catalog.minYield', 'Rentabilidad desde {n} %').replace('{n}', String(minYield)), clear: ['minYield'] })
  for (const [k, i18n, fallback] of FEATURES) if (query[k] === '1') out.push({ key: k, label: t(i18n, fallback), clear: [k] })
  if (present(query.energy)) out.push({ key: 'energy', label: `${t('catalog.energy', 'Eficiencia')} ${String(query.energy)}+`, clear: ['energy'] })
  if (present(query.orientation)) out.push({ key: 'orientation', label: `${t('catalog.orientation', 'Orientación')} ${String(query.orientation)}`, clear: ['orientation'] })
  const minYear = num(query.minYear)
  if (minYear) out.push({ key: 'minYear', label: `${t('catalog.since', 'Desde')} ${minYear}`, clear: ['minYear'] })
  return out
}
