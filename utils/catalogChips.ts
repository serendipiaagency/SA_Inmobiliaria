import { nearbyFromQuery } from './publicSearch'
import { PROPERTY_SUBTYPES } from './propertySheet'
import {
  ESTADO_LABELS,
  FEATURE_LABELS,
  RENTAL_TERM_LABELS,
  SITUATION_LABELS,
  firstString,
  listParam,
  parseEstado,
  parseFeatures,
  parseLocations,
  parseRentalTerms,
  parseSituations,
  parseTypes,
  subtypeParent,
} from './searchState'

/**
 * Los chips de filtros activos del catálogo público (#109): uno por criterio
 * que hay en la URL (uno por valor, en los que admiten varios: cada ubicación,
 * cada tipo…), con su texto y lo que hay que quitar al pulsar su «×». Sin
 * filtros, ninguno — nunca chips de ejemplo. Se leen con utils/searchState.ts,
 * igual que el servidor.
 */

export interface CatalogChip {
  key: string
  label: string
  /** Lo que se borra de la URL al quitar el chip. */
  clear: string[]
  /** En un parámetro de varios valores: sólo este valor. */
  remove?: { param: string; value: string }
}

type Query = Record<string, unknown>
type Translate = (key: string, fallback: string) => string

const present = (v: unknown) => firstString(v) !== ''
const num = (v: unknown) => {
  const n = Number(firstString(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

const STATUS: Record<string, [string, string]> = {
  new: ['filters.status.new', 'Obra nueva'],
  under_construction: ['filters.status.underConstruction', 'En construcción'],
  ready: ['filters.status.ready', 'Listo para entrar'],
}

/** «300.000 € – 600.000 €», «Más de 100 m²», «Hasta 250.000 €». */
function range(min: number, max: number, fmt: (n: number) => string, t: Translate): string {
  if (min && max) return `${fmt(min)} – ${fmt(max)}`
  if (min) return `${t('catalog.moreThan', 'Más de')} ${fmt(min)}`
  return `${t('price.upTo', 'Hasta')} ${fmt(max)}`
}

export function catalogChips(query: Query, t: Translate, formatPrice: (n: number) => string, typeLabel: (type: string) => string): CatalogChip[] {
  const out: CatalogChip[] = []
  if (present(query.q)) out.push({ key: 'q', label: `«${firstString(query.q)}»`, clear: ['q'] })
  const op = firstString(query.operacion)
  if (op === 'venta') out.push({ key: 'operacion', label: t('catalog.forSale', 'En venta'), clear: ['operacion'] })
  if (op === 'alquiler') out.push({ key: 'operacion', label: t('catalog.forRent', 'En alquiler'), clear: ['operacion'] })
  for (const l of parseLocations(query)) {
    out.push({ key: `${l.kind}:${l.value}`, label: l.kind === 'postalCode' ? `CP ${l.value}` : l.value, clear: [], remove: { param: l.kind, value: l.value } })
  }
  if (['north', 'south', 'east', 'west'].every((k) => present(query[k]))) out.push({ key: 'area-map', label: t('catalog.mapArea', 'Zona del mapa'), clear: ['north', 'south', 'east', 'west'] })
  const nearby = nearbyFromQuery(query as Record<string, any>)
  if (nearby) out.push({ key: 'nearby', label: `${t('catalog.radius', 'Radio')} ${nearby.radiusKm} km`, clear: ['lat', 'lng', 'radiusKm'] })
  const minP = num(query.minPrice)
  const maxP = num(query.maxPrice)
  if (minP || maxP) out.push({ key: 'price', label: range(minP, maxP, formatPrice, t), clear: ['minPrice', 'maxPrice'] })
  const minA = num(query.minArea)
  const maxA = num(query.maxArea)
  if (minA || maxA) out.push({ key: 'area', label: range(minA, maxA, (n) => `${n} m²`, t), clear: ['minArea', 'maxArea'] })
  const beds = num(query.bedrooms)
  if (beds) out.push({ key: 'bedrooms', label: `${beds}+ ${t('catalog.bedroomsShort', 'habitaciones')}`, clear: ['bedrooms'] })
  const baths = num(query.bathrooms)
  if (baths) out.push({ key: 'bathrooms', label: `${baths}+ ${t('catalog.bathroomsShort', 'baños')}`, clear: ['bathrooms'] })
  const { types, subtypes } = parseTypes(query)
  for (const ty of types) out.push({ key: `type:${ty}`, label: typeLabel(ty), clear: [], remove: { param: 'type', value: ty } })
  // Un tipo antiguo fuera del catálogo común sigue teniendo su chip (y se puede quitar).
  for (const raw of listParam(query.type)) if (!types.includes(raw)) out.push({ key: `type:${raw}`, label: typeLabel(raw), clear: [], remove: { param: 'type', value: raw } })
  for (const s of subtypes) {
    const parent = subtypeParent(s)!
    out.push({ key: `subtype:${s}`, label: t(`filters.subtype.${s}`, PROPERTY_SUBTYPES[parent]?.[s] || s), clear: [], remove: { param: 'subtype', value: s } })
  }
  if (present(query.status)) {
    const s = STATUS[firstString(query.status)]
    out.push({ key: 'status', label: s ? t(s[0], s[1]) : firstString(query.status), clear: ['status'] })
  }
  const obra = firstString(query.obra)
  for (const k of parseEstado(query)) {
    // `obra=nueva|segunda` (enlaces del Hero anteriores) se quita entero.
    const fromObra = (k === 'obra_nueva' && obra === 'nueva') || (k === 'segunda_mano' && obra === 'segunda')
    out.push({ key: `estado:${k}`, label: t(ESTADO_LABELS[k][0], ESTADO_LABELS[k][1]), clear: fromObra ? ['obra'] : [], remove: fromObra ? undefined : { param: 'estado', value: k } })
  }
  for (const k of parseSituations(query)) out.push({ key: `situacion:${k}`, label: t(SITUATION_LABELS[k][0], SITUATION_LABELS[k][1]), clear: [], remove: { param: 'situacion', value: k } })
  for (const k of parseRentalTerms(query)) out.push({ key: `rentalTerm:${k}`, label: t(RENTAL_TERM_LABELS[k][0], RENTAL_TERM_LABELS[k][1]), clear: [], remove: { param: 'rentalTerm', value: k } })
  const minYield = num(query.minYield)
  if (minYield) out.push({ key: 'minYield', label: t('catalog.minYield', 'Rentabilidad desde {n} %').replace('{n}', String(minYield)), clear: ['minYield'] })
  for (const f of parseFeatures(query)) out.push({ key: f, label: t(FEATURE_LABELS[f]![0], FEATURE_LABELS[f]![1]), clear: [f] })
  if (present(query.energy)) out.push({ key: 'energy', label: `${t('catalog.energy', 'Eficiencia')} ${firstString(query.energy)}+`, clear: ['energy'] })
  if (present(query.orientation)) out.push({ key: 'orientation', label: `${t('catalog.orientation', 'Orientación')} ${firstString(query.orientation)}`, clear: ['orientation'] })
  const minYear = num(query.minYear)
  if (minYear) out.push({ key: 'minYear', label: `${t('catalog.since', 'Desde')} ${minYear}`, clear: ['minYear'] })
  return out
}

/** Lo que hay que cambiar en la URL al quitar un chip. */
export function chipRemovalPatch(query: Query, c: CatalogChip): Record<string, unknown> {
  const patch: Record<string, unknown> = { page: undefined }
  for (const k of c.clear) patch[k] = undefined
  if (c.remove) {
    const rest = listParam(query[c.remove.param], 50).filter((v) => v !== c.remove!.value)
    patch[c.remove.param] = rest.length ? rest : undefined
  }
  return patch
}
