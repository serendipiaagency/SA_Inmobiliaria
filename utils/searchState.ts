import { PROPERTY_SUBTYPES, PROPERTY_TYPES, PROPERTY_TYPE_GROUPS } from './propertySheet'

/**
 * El estado ÚNICO de una búsqueda de la web pública: lo comparten el buscador
 * del Hero, la barra y el panel de Propiedades, los chips, la vista Galería /
 * Mapa, /mapa, las alertas de búsquedas guardadas y el servidor
 * (server/utils/properties/publicSearch.ts). Vive en la URL de /propiedades:
 * se puede recargar, compartir, ir atrás y adelante sin perder nada.
 *
 * Aquí sólo hay nombres de parámetros, catálogos y validación — ni SQL ni Vue —
 * para que cliente y servidor lean la URL exactamente igual.
 */

type Query = Record<string, unknown>

// ---------------------------------------------------------------------------
// Operación
// ---------------------------------------------------------------------------

export const OPERATIONS = ['venta', 'alquiler'] as const
export type Operation = (typeof OPERATIONS)[number]
/** Si la web no dice otra cosa (Constructor → Propiedades → «Operación de partida»). */
export const DEFAULT_OPERATION: Operation = 'venta'

export function parseOperation(v: unknown): Operation | null {
  const s = firstString(v)
  return s === 'venta' || s === 'alquiler' ? s : null
}

// ---------------------------------------------------------------------------
// Ordenación: exactamente ocho, todas en el servidor y antes de paginar.
// ---------------------------------------------------------------------------

/** '' = Relevancia. `newest` ya existía en enlaces guardados. */
export const SORT_KEYS = ['', 'price_asc', 'price_desc', 'newest', 'oldest', 'price_drop', 'ppm2_asc', 'ppm2_desc'] as const
export type SortKey = (typeof SORT_KEYS)[number]
/** Accesos rápidos: Relevancia | Baratos | Recientes. El resto, en «Más». */
export const QUICK_SORTS: SortKey[] = ['', 'price_asc', 'newest']
export const MORE_SORTS: SortKey[] = ['price_desc', 'oldest', 'price_drop', 'ppm2_asc', 'ppm2_desc']
export const SORT_LABELS: Record<SortKey, [string, string]> = {
  '': ['sort.relevance', 'Relevancia'],
  price_asc: ['sort.cheapest', 'Baratos'],
  price_desc: ['sort.priceHigh', 'Precio más alto'],
  newest: ['sort.newest', 'Recientes'],
  oldest: ['sort.oldest', 'Antiguos'],
  price_drop: ['sort.priceDrop', 'Han bajado más'],
  ppm2_asc: ['sort.ppm2Asc', 'Baratos €/m²'],
  ppm2_desc: ['sort.ppm2Desc', 'Caros €/m²'],
}

export function parseSort(v: unknown): SortKey {
  const s = firstString(v)
  return (SORT_KEYS as readonly string[]).includes(s) ? (s as SortKey) : ''
}

// ---------------------------------------------------------------------------
// Ubicación: varias a la vez (unión), cada una con su tipo real.
// ---------------------------------------------------------------------------

/**
 * Ubicaciones por TEXTO en la URL (?municipality=Gijón&neighborhood=Somió…):
 * las de siempre, que siguen valiendo (enlaces antiguos y nombres que sólo
 * existen en el inventario de la agencia, como una calle).
 */
export const LOCATION_KINDS = ['region', 'province', 'municipality', 'neighborhood', 'postalCode', 'street'] as const
/** …y «zone», una zona administrable de la agencia, que sólo va por identificador. */
export type LocationKind = (typeof LOCATION_KINDS)[number] | 'zone'
export const LOCATION_KIND_LABELS: Record<LocationKind, [string, string]> = {
  region: ['location.kind.region', 'Comunidad autónoma'],
  province: ['location.kind.province', 'Provincia'],
  municipality: ['location.kind.municipality', 'Municipio'],
  neighborhood: ['location.kind.neighborhood', 'Barrio o localidad'],
  postalCode: ['location.kind.postalCode', 'Código postal'],
  street: ['location.kind.street', 'Calle'],
  zone: ['location.kind.zone', 'Zona'],
}
/** Encabezados de la lista de sugerencias. */
export const LOCATION_GROUP_LABELS: Record<LocationKind, [string, string]> = {
  region: ['location.group.region', 'Comunidades autónomas'],
  province: ['location.group.province', 'Provincias'],
  municipality: ['location.group.municipality', 'Municipios'],
  neighborhood: ['location.group.neighborhood', 'Barrios y localidades'],
  postalCode: ['location.group.postalCode', 'Códigos postales'],
  street: ['location.group.street', 'Calles'],
  zone: ['location.group.zone', 'Zonas de la inmobiliaria'],
}
/** Orden en que se enseñan los grupos de sugerencias y los chips. */
export const LOCATION_DISPLAY_ORDER: LocationKind[] = ['municipality', 'neighborhood', 'zone', 'postalCode', 'province', 'region', 'street']

/**
 * Una ubicación elegida. Con `id` es una ENTIDAD geográfica real (catálogo de
 * España: es:ccaa:34, es:prov:33, es:mun:33024, es:loc:3108732, es:cp:33201; o
 * una zona de la agencia: zone:12) y el filtro busca por su ámbito; sin él es
 * un texto del inventario (calle, nombre guardado…) y el filtro busca por
 * nombre, como siempre. `value` es el nombre que se enseña.
 */
export interface LocationSelection {
  kind: LocationKind
  value: string
  id?: string
  /** «Asturias», «Gijón/Xixón»…: de dónde es, para el chip. */
  context?: string | null
  /** Ids que la contienen (municipio → provincia y comunidad…), para avisar de redundancias. */
  parents?: string[]
}
/** Tope de ubicaciones a la vez: más no cabe en una URL legible ni en una consulta razonable. */
export const MAX_LOCATIONS = 12
/** Parámetro de la URL con los identificadores canónicos: ?loc=es:mun:33024,es:cp:33201 */
export const LOCATION_ID_PARAM = 'loc'

const LOCATION_ID_RE = /^(es:(ccaa|prov|mun|loc|cp):[A-Za-z0-9]{1,12}|zone:\d{1,9})$/
/** El tipo de una entidad por su identificador; null si el id no es válido. */
export function locationKindOfId(id: string): LocationKind | null {
  if (!LOCATION_ID_RE.test(id)) return null
  if (id.startsWith('zone:')) return 'zone'
  const level = id.split(':')[1]
  return level === 'ccaa' ? 'region' : level === 'prov' ? 'province' : level === 'mun' ? 'municipality' : level === 'loc' ? 'neighborhood' : 'postalCode'
}

/** Las ubicaciones de la URL: primero las entidades (`loc`), luego los textos de cada tipo. Sin repetidos; tope MAX_LOCATIONS. */
export function parseLocations(query: Query): LocationSelection[] {
  const out: LocationSelection[] = []
  const seen = new Set<string>()
  for (const id of listParam(query[LOCATION_ID_PARAM], 40).flatMap((v) => v.split(','))) {
    const kind = locationKindOfId(id.trim())
    if (!kind || seen.has(id)) continue
    seen.add(id)
    // Sin nombre todavía: lo pone quien lo enseña (resuelto por /api/public/location-resolve); un CP ya es su nombre.
    out.push({ kind, value: kind === 'postalCode' ? id.slice('es:cp:'.length) : '', id: id.trim() })
    if (out.length >= MAX_LOCATIONS) return out
  }
  for (const kind of LOCATION_KINDS) {
    for (const raw of listParam(query[kind], 20)) {
      const value = kind === 'postalCode' ? raw.replace(/\s+/g, '').toUpperCase().slice(0, 10) : raw.slice(0, 80)
      const key = `${kind}:${normalizeText(value)}`
      if (!value || seen.has(key)) continue
      seen.add(key)
      out.push({ kind, value })
      if (out.length >= MAX_LOCATIONS) return out
    }
  }
  return out
}

/** Lo que va a la URL por las ubicaciones elegidas: `loc` con los ids y, aparte, los textos de cada tipo (cada parámetro, vacío si no hay). */
export function locationsPatch(list: LocationSelection[]): Record<string, string | string[] | undefined> {
  const patch: Record<string, string | string[] | undefined> = {}
  const ids = list.filter((l) => l.id).map((l) => l.id!)
  patch[LOCATION_ID_PARAM] = ids.length ? ids.join(',') : undefined
  for (const kind of LOCATION_KINDS) {
    const values = list.filter((l) => !l.id && l.kind === kind).map((l) => l.value)
    patch[kind] = values.length ? values : undefined
  }
  return patch
}

export function locationKey(l: LocationSelection): string {
  return l.id ?? `${l.kind}:${normalizeText(l.value)}`
}

/**
 * Redundancias entre lo elegido: una ubicación contenida en otra también
 * elegida (un municipio con su provincia, un barrio con su municipio, un CP
 * con su municipio) no añade nada al filtro (es una unión). Se devuelve el
 * id de la que la contiene, para decirlo en el chip, nunca para quitarla sola.
 */
export function coveredBy(sel: LocationSelection, all: LocationSelection[], parents: (id: string) => string[]): string | null {
  if (!sel.id) return null
  const chosen = new Set(all.filter((l) => l.id && l.id !== sel.id).map((l) => l.id!))
  for (const p of parents(sel.id)) if (chosen.has(p)) return p
  return null
}

// ---------------------------------------------------------------------------
// Tipos y subtipos: los de Property Core (utils/propertySheet.ts), agrupados
// para el panel. No es otra taxonomía: sólo cómo se enseñan.
// ---------------------------------------------------------------------------

export interface TypeFamily {
  key: string
  label: [string, string]
  types: string[]
}
export interface TypeCategory {
  key: string
  label: [string, string]
  /** Viviendas se divide en Pisos y Casas y chalets; el resto es un tipo suelto. */
  families: TypeFamily[]
}
export const PROPERTY_TYPE_TREE: TypeCategory[] = PROPERTY_TYPE_GROUPS.map((g) => ({
  key: g.key,
  label: g.label,
  families: g.families.map((f) => ({ key: f.key, label: f.label, types: [...f.types] })),
}))
/** Tipos en los que habitaciones y baños tienen sentido. */
export const RESIDENTIAL_TYPES = new Set(['Apartment', 'Penthouse', 'Duplex', 'Studio', 'House', 'Villa', 'Townhouse', 'Finca'])

const SUBTYPE_PARENT: Record<string, string> = Object.fromEntries(Object.entries(PROPERTY_SUBTYPES).flatMap(([type, subs]) => Object.keys(subs).map((s) => [s, type])))
export function subtypeParent(subtype: string): string | null {
  return SUBTYPE_PARENT[subtype] ?? null
}

export function parseTypes(query: Query): { types: string[]; subtypes: string[] } {
  const known = new Set<string>(PROPERTY_TYPES)
  const types = listParam(query.type, 20).filter((t) => known.has(t))
  const subtypes = listParam(query.subtype, 40).filter((s) => SUBTYPE_PARENT[s])
  return { types: [...new Set(types)], subtypes: [...new Set(subtypes)] }
}

/** ¿Habitaciones y baños aplican a lo elegido? Sin tipo elegido, sí. */
export function bedroomsApply(types: string[], subtypes: string[] = []): boolean {
  const parents = new Set([...types, ...subtypes.map((s) => SUBTYPE_PARENT[s]!).filter(Boolean)])
  return parents.size === 0 || [...parents].some((t) => RESIDENTIAL_TYPES.has(t))
}

// ---------------------------------------------------------------------------
// Estado del inmueble: dos ejes que no se mezclan.
//  - obra nueva / segunda mano (estado comercial de la promoción o tipo);
//  - estado de conservación (`condition` y «Reformado» de la ficha ampliada).
// La ocupación NO es estado: es «Situación» y sólo lo que la agencia anuncia.
// ---------------------------------------------------------------------------

export const NEW_BUILD_KEYS = ['obra_nueva', 'segunda_mano'] as const
export const CONDITION_KEYS = ['a_estrenar', 'reformado', 'buen_estado', 'para_reformar'] as const
export const ESTADO_KEYS = [...NEW_BUILD_KEYS, ...CONDITION_KEYS] as const
export type EstadoKey = (typeof ESTADO_KEYS)[number]
export const ESTADO_LABELS: Record<EstadoKey, [string, string]> = {
  obra_nueva: ['estado.newBuild', 'Obra nueva'],
  segunda_mano: ['estado.secondHand', 'Segunda mano'],
  a_estrenar: ['estado.brandNew', 'A estrenar'],
  reformado: ['estado.renovated', 'Reformado'],
  buen_estado: ['estado.good', 'Buen estado'],
  para_reformar: ['estado.toRenovate', 'Para reformar'],
}

export function parseEstado(query: Query): EstadoKey[] {
  const keys = new Set(listParam(query.estado, 10).filter((k): k is EstadoKey => (ESTADO_KEYS as readonly string[]).includes(k)))
  // `obra=nueva|segunda` (enlaces del Hero anteriores) es lo mismo.
  const obra = firstString(query.obra)
  if (obra === 'nueva') keys.add('obra_nueva')
  if (obra === 'segunda') keys.add('segunda_mano')
  return ESTADO_KEYS.filter((k) => keys.has(k))
}

// ---------------------------------------------------------------------------
// Situación de la vivienda: sólo lo que la agencia marca para anunciar
// (property_details.listing_situation). Nunca la ocupación interna.
// ---------------------------------------------------------------------------

export const SITUATION_KEYS = ['bare_ownership', 'rented', 'occupied'] as const
export type SituationKey = (typeof SITUATION_KEYS)[number]
export const SITUATION_LABELS: Record<SituationKey, [string, string]> = {
  bare_ownership: ['situation.bareOwnership', 'Nuda propiedad'],
  rented: ['situation.rented', 'Alquilada, con inquilinos'],
  occupied: ['situation.occupied', 'Ocupada'],
}
export function parseSituations(query: Query): SituationKey[] {
  return listParam(query.situacion, 5).filter((k): k is SituationKey => (SITUATION_KEYS as readonly string[]).includes(k))
}

// ---------------------------------------------------------------------------
// Alquiler: sólo con «Alquilar».
// ---------------------------------------------------------------------------

export const RENTAL_TERM_KEYS = ['long_term', 'seasonal'] as const
export type RentalTermKey = (typeof RENTAL_TERM_KEYS)[number]
export const RENTAL_TERM_LABELS: Record<RentalTermKey, [string, string]> = {
  long_term: ['rental.longTerm', 'Larga estancia'],
  seasonal: ['rental.seasonal', 'De temporada'],
}
export function parseRentalTerms(query: Query): RentalTermKey[] {
  return listParam(query.rentalTerm, 3).filter((k): k is RentalTermKey => (RENTAL_TERM_KEYS as readonly string[]).includes(k))
}
/** Parámetros que sólo tienen sentido alquilando: se quitan al pasar a «Comprar». */
export const RENTAL_ONLY_PARAMS = ['rentalTerm', 'expensesIncluded'] as const
/** …y los que sólo tienen sentido comprando. */
export const SALE_ONLY_PARAMS = ['minYield'] as const

// ---------------------------------------------------------------------------
// Características, agrupadas. Cada una es un campo estructurado de Property
// Core (nunca una palabra buscada en la descripción).
// ---------------------------------------------------------------------------

export const FEATURE_GROUPS: { key: string; label: [string, string]; features: string[] }[] = [
  { key: 'exterior', label: ['features.group.exterior', 'Exterior'], features: ['terrace', 'balcony', 'garden', 'patio', 'views'] },
  { key: 'building', label: ['features.group.building', 'Edificio'], features: ['elevator', 'accessible', 'concierge', 'communal'] },
  { key: 'equipment', label: ['features.group.equipment', 'Equipamiento'], features: ['garage', 'storeroom', 'pool', 'heating', 'airConditioning'] },
  { key: 'other', label: ['features.group.other', 'Otros'], features: ['furnished', 'pets'] },
]
export const FEATURE_KEYS = FEATURE_GROUPS.flatMap((g) => g.features)
export const FEATURE_LABELS: Record<string, [string, string]> = {
  terrace: ['filters.feature.terrace', 'Terraza'],
  balcony: ['filters.feature.balcony', 'Balcón'],
  garden: ['filters.feature.garden', 'Jardín'],
  patio: ['filters.feature.patio', 'Patio'],
  views: ['filters.feature.views', 'Vistas'],
  elevator: ['filters.feature.elevator', 'Ascensor'],
  accessible: ['filters.feature.accessible', 'Accesible'],
  concierge: ['filters.feature.concierge', 'Portería'],
  communal: ['filters.feature.communal', 'Zonas comunes'],
  garage: ['filters.feature.garage', 'Garaje'],
  storeroom: ['filters.feature.storeroom', 'Trastero'],
  pool: ['filters.feature.pool', 'Piscina'],
  heating: ['filters.feature.heating', 'Calefacción'],
  airConditioning: ['filters.feature.airConditioning', 'Aire acondicionado'],
  furnished: ['filters.feature.furnished', 'Amueblado'],
  pets: ['filters.feature.pets', 'Mascotas'],
  expensesIncluded: ['filters.feature.expensesIncluded', 'Gastos incluidos'],
}
export function parseFeatures(query: Query): string[] {
  return [...FEATURE_KEYS, 'expensesIncluded'].filter((k) => firstString(query[k]) === '1' || (k === 'furnished' && firstString(query.furnished) === 'yes'))
}

/** Orientación (`orientation`) y eficiencia mínima (`energy`): las mismas opciones en el catálogo y en el Hero. */
export const ORIENTATION_OPTIONS: { v: string; k: string; l: string }[] = [
  { v: 'N', k: 'filters.orientation.north', l: 'Norte' },
  { v: 'S', k: 'filters.orientation.south', l: 'Sur' },
  { v: 'E', k: 'filters.orientation.east', l: 'Este' },
  { v: 'W', k: 'filters.orientation.west', l: 'Oeste' },
  { v: 'SE', k: 'filters.orientation.southeast', l: 'Sureste' },
  { v: 'SW', k: 'filters.orientation.southwest', l: 'Suroeste' },
  { v: 'NE', k: 'filters.orientation.northeast', l: 'Noreste' },
  { v: 'NW', k: 'filters.orientation.northwest', l: 'Noroeste' },
]
export const ENERGY_FILTER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

// ---------------------------------------------------------------------------
// Rango de precio: escalas distintas para comprar (importe) y alquilar
// (renta mensual), en la moneda BASE de la agencia (utils/currency.ts).
// ---------------------------------------------------------------------------

export const SALE_PRICE_STEPS = [0, 50_000, 75_000, 100_000, 125_000, 150_000, 175_000, 200_000, 225_000, 250_000, 300_000, 350_000, 400_000, 450_000, 500_000, 600_000, 700_000, 800_000, 900_000, 1_000_000, 1_250_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000, 4_000_000, 5_000_000]
export const RENT_PRICE_STEPS = [0, 300, 400, 500, 600, 700, 800, 900, 1_000, 1_100, 1_200, 1_400, 1_600, 1_800, 2_000, 2_500, 3_000, 3_500, 4_000, 5_000, 6_000, 8_000, 10_000]
export function priceSteps(op: Operation): number[] {
  return op === 'alquiler' ? RENT_PRICE_STEPS : SALE_PRICE_STEPS
}

/** Un importe positivo y razonable, o null («sin límite»). Nunca negativo ni NaN. */
export function parseAmount(v: unknown, max = 1e10): number | null {
  const s = firstString(v)
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(Math.round(n), max)
}

/** Mínimo y máximo coherentes: si vienen al revés, se intercambian (nunca un rango vacío por error). */
export function orderedRange(min: number | null, max: number | null): [number | null, number | null] {
  if (min != null && max != null && min > max) return [max, min]
  return [min, max]
}

// ---------------------------------------------------------------------------
// «Nueva búsqueda» y compatibilidad
// ---------------------------------------------------------------------------

/** Todo lo que forma la búsqueda en la URL de /propiedades (lo que «Nueva búsqueda» borra). */
export const SEARCH_PARAMS = [
  'q', 'operacion', 'sort', 'page',
  LOCATION_ID_PARAM, ...LOCATION_KINDS, 'city', 'community', 'lat', 'lng', 'radiusKm', 'north', 'south', 'east', 'west',
  'minPrice', 'maxPrice', 'minArea', 'maxArea', 'bedrooms', 'bathrooms',
  'type', 'subtype', 'estado', 'obra', 'status', 'new', 'condition', 'situacion', 'rentalTerm',
  ...FEATURE_KEYS, 'expensesIncluded', 'orientation', 'energy', 'minYear', 'minYield', 'developerId',
] as const

/** Al cambiar de operación: fuera lo que no sirve en la otra (precio, alquiler/inversión); lo demás se queda. */
export function operationSwitchPatch(next: Operation): Record<string, undefined | string> {
  const patch: Record<string, undefined | string> = { operacion: next, minPrice: undefined, maxPrice: undefined, page: undefined }
  for (const k of next === 'venta' ? RENTAL_ONLY_PARAMS : SALE_ONLY_PARAMS) patch[k] = undefined
  return patch
}

// ---------------------------------------------------------------------------
// «Más filtros» (components/FiltersModal.vue): maneja un valor de cada cosa.
// ---------------------------------------------------------------------------

/** Lo que el modal maneja: al aplicar, sustituye a esto y sólo a esto. */
export const MODAL_KEYS = ['municipality', 'neighborhood', 'postalCode', 'lat', 'lng', 'radiusKm', 'minPrice', 'maxPrice', 'minArea', 'maxArea', 'bedrooms', 'bathrooms', 'type', 'status', 'orientation', 'minYear', 'energy', 'elevator', 'pool', 'garage', 'terrace', 'garden', 'pets', 'accessible'] as const

/** Lo que hay en la URL, para abrir el modal con ello (sólo lo que el modal sabe enseñar: un valor). */
export function modalSeedFrom(query: Query): Record<string, unknown> {
  const s: Record<string, unknown> = {}
  for (const k of ['minPrice', 'maxPrice', 'minArea', 'maxArea', 'bedrooms', 'bathrooms', 'minYear']) if (firstString(query[k])) s[k] = Number(firstString(query[k]))
  for (const k of ['municipality', 'neighborhood', 'postalCode', 'type', 'status', 'orientation', 'energy']) if (listParam(query[k]).length === 1) s[k] = listParam(query[k])[0]
  for (const k of ['elevator', 'pool', 'garage', 'terrace', 'garden', 'pets', 'accessible']) if (firstString(query[k]) === '1') s[k] = true
  return s
}

/**
 * Aplicar el modal: sus filtros sustituyen a esos mismos en la URL; todo lo
 * demás (operación, orden, vista, estado, subtipos, situación, alquiler…) se
 * queda. Un parámetro con varios valores que el modal no podía enseñar (p. ej.
 * tres municipios elegidos en el panel) también se queda si el modal no lo trae.
 */
export function mergeModalFilters(current: Query, modal: Record<string, string>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(current)) {
    if (k === 'page') continue
    const managed = (MODAL_KEYS as readonly string[]).includes(k)
    if (managed && !(Array.isArray(v) && v.length > 1 && !(k in modal))) continue
    next[k] = v
  }
  return { ...next, ...modal }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function firstString(v: unknown): string {
  if (Array.isArray(v)) return firstString(v[0])
  return v == null ? '' : String(v).trim()
}

/** Un parámetro que puede repetirse (`?type=A&type=B`) o venir separado por comas. */
export function listParam(v: unknown, max = 20): string[] {
  const raw = Array.isArray(v) ? v : v == null || v === '' ? [] : [v]
  const out: string[] = []
  for (const item of raw) {
    for (const part of String(item).split(',')) {
      const s = part.trim()
      if (s && !out.includes(s)) out.push(s)
      if (out.length >= max) return out
    }
  }
  return out
}

/** Sin tildes, sin mayúsculas, espacios simples: «Ovíedo » → «oviedo». */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
