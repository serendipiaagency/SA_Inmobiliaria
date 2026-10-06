/**
 * Filtros del listado de propiedades añadidos en el bloque N7b (FASES 0, 2 y
 * 27): subtipo, comercial, oficina, propietario, portal, características,
 * barrio, municipio, etiquetas, campos personalizados y búsqueda geográfica.
 *
 * Viven como un único mapa `clave → texto` dentro de
 * `components/property-list/PropertyList.vue`, con los MISMOS nombres de
 * parámetro que entiende el servidor (`parsePropertyFilters`,
 * server/utils/properties/searchService.ts). Así van tal cual a la URL, a la
 * exportación CSV, a «todos los filtrados» de las acciones masivas y a un
 * filtro o vista guardada, sin una traducción más que pueda divergir.
 */
import { PROPERTY_AMENITY_GROUPS, PROPERTY_SHEET_FIELD_MAP, PROPERTY_SUBTYPES, propertySubtypeLabel } from './propertySheet'
import { formatCustomFieldValue, type CustomFieldDefinitionDto } from './customFieldCatalog'
import { COMMERCIAL_STATUS_NONE, commercialStatusLabel } from './propertyCommercialStatus'

export const EXTRA_FILTER_KEYS = [
  'subtype',
  'agentId',
  'officeId',
  'owner',
  'ownerId',
  'portal',
  'features',
  'neighborhood',
  'municipality',
  'tags',
  'north',
  'south',
  'east',
  'west',
  'lat',
  'lng',
  'radiusKm',
  // Cierre D1p: estado comercial común, vencimiento de la exclusiva y «Más características».
  'commercialStatus',
  'exclusivity',
  'amenities',
] as const

export const BBOX_KEYS = ['north', 'south', 'east', 'west'] as const
export const RADIUS_KEYS = ['lat', 'lng', 'radiusKm'] as const

export function isExtraFilterKey(key: string): boolean {
  return (EXTRA_FILTER_KEYS as readonly string[]).includes(key) || /^cf_\d+(_min|_max)?$/.test(key)
}

/**
 * Sólo las claves de filtro extra (con valor) de una query cualquiera.
 * `allowPortal: false` (2ª mano, cierre D1p): el filtro «Portal» no existe en
 * ese catálogo —la publicación multicanal sólo programa obra nueva— y no se
 * arrastra desde un enlace o una vista guardada, donde dejaría el listado a
 * cero sin que nada en pantalla lo explicara.
 */
export function pickExtraFilters(query: Record<string, unknown>, opts: { allowPortal?: boolean } = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(query)) {
    if (!isExtraFilterKey(k)) continue
    if (k === 'portal' && opts.allowPortal === false) continue
    const s = Array.isArray(v) ? v.join(',') : v == null ? '' : String(v)
    if (s.trim() !== '') out[k] = s
  }
  return out
}

/**
 * Las características del filtro «Características»: las cinco con columna en
 * los dos catálogos (las mismas que entiende la Domain Tool search_properties)
 * y, desde el cierre D1p, piscina privada / comunitaria y jardín privado de la
 * ficha ampliada. «Piscina» y «Jardín» a secas cuentan cualquiera de sus
 * variantes (searchService.ts, `PROPERTY_FEATURE_DETAIL_ALTERNATIVES`).
 */
export const PROPERTY_FEATURE_LABELS: Record<string, string> = {
  terrace: 'Terraza',
  pool: 'Piscina',
  privatePool: 'Piscina privada',
  communityPool: 'Piscina comunitaria',
  garage: 'Garaje',
  elevator: 'Ascensor',
  garden: 'Jardín',
  privateGarden: 'Jardín privado',
}

/** Las características de la ficha ampliada que ya están en «Características» no se repiten en «Más características». */
const FEATURES_IN_MAIN_LIST = new Set(['hasPrivatePool', 'hasCommunityPool', 'hasPrivateGarden'])

/** «Más características» (cierre D1p): las sí/no de la ficha ampliada por bloque, con su rótulo del catálogo. */
export const PROPERTY_AMENITY_FILTER_GROUPS = PROPERTY_AMENITY_GROUPS.map((g) => ({ ...g, fields: g.fields.filter((f) => !FEATURES_IN_MAIN_LIST.has(f.key)) })).filter((g) => g.fields.length > 0)

/** Opciones del filtro «Estado comercial» (con «Sin indicar»). */
export const COMMERCIAL_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  ...Object.keys(PROPERTY_SHEET_FIELD_MAP.commercialStatus?.optionLabels || {}).map((value) => ({ value, label: commercialStatusLabel(value) })),
  { value: COMMERCIAL_STATUS_NONE, label: 'Sin indicar' },
]

/** Opciones del filtro «Vencimiento de la exclusiva». */
export const EXCLUSIVITY_FILTER_LABELS: Record<string, string> = {
  expired: 'Exclusiva caducada',
  expiring: 'Exclusiva que caduca en 30 días',
}

export interface PropertyFilterOptions {
  offices: { id: number; name: string }[]
  agents: { id: number; name: string }[]
  tags: { id: number; name: string; uses?: number }[]
  customFields: CustomFieldDefinitionDto[]
  portals: { key: string; label: string }[]
}

export function subtypeOptions(propertyType: string | null | undefined): { value: string; label: string }[] {
  if (propertyType && PROPERTY_SUBTYPES[propertyType]) {
    return Object.entries(PROPERTY_SUBTYPES[propertyType]).map(([value, label]) => ({ value, label }))
  }
  // Sin tipo elegido: todos los subtipos, con el tipo delante para no confundirlos.
  return Object.entries(PROPERTY_SUBTYPES).flatMap(([type, subs]) => Object.keys(subs).map((value) => ({ value, label: propertySubtypeLabel(type, value) })))
}

function fmtCoord(v: string) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(4) : v
}

/** Las «pastillas» de filtros activos (con qué claves quitar cada una). */
export function extraFilterChips(extra: Record<string, string>, options: PropertyFilterOptions | null): { key: string; label: string; keys: string[] }[] {
  const chips: { key: string; label: string; keys: string[] }[] = []
  const name = <T extends { id: number; name: string }>(list: T[] | undefined, id: string) => list?.find((x) => String(x.id) === id)?.name
  if (extra.subtype) chips.push({ key: 'subtype', label: `Subtipo: ${subtypeOptions(null).find((o) => o.value === extra.subtype)?.label || extra.subtype}`, keys: ['subtype'] })
  if (extra.agentId) chips.push({ key: 'agentId', label: extra.agentId === 'none' ? 'Sin comercial' : `Comercial: ${name(options?.agents, extra.agentId) || `#${extra.agentId}`}`, keys: ['agentId'] })
  if (extra.officeId) chips.push({ key: 'officeId', label: `Oficina: ${name(options?.offices, extra.officeId) || `#${extra.officeId}`}`, keys: ['officeId'] })
  if (extra.owner) chips.push({ key: 'owner', label: `Propietario: ${extra.owner}`, keys: ['owner'] })
  if (extra.ownerId) chips.push({ key: 'ownerId', label: `Propietario #${extra.ownerId}`, keys: ['ownerId'] })
  if (extra.portal) chips.push({ key: 'portal', label: `Portal: ${options?.portals.find((p) => p.key === extra.portal)?.label || extra.portal}`, keys: ['portal'] })
  if (extra.features) {
    const labels = extra.features.split(',').map((f) => PROPERTY_FEATURE_LABELS[f] || f)
    chips.push({ key: 'features', label: `Con ${labels.join(', ').toLowerCase()}`, keys: ['features'] })
  }
  if (extra.amenities) {
    const labels = extra.amenities.split(',').map((k) => PROPERTY_SHEET_FIELD_MAP[k]?.label || k)
    chips.push({ key: 'amenities', label: `Con ${labels.join(', ').toLowerCase()}`, keys: ['amenities'] })
  }
  if (extra.commercialStatus) {
    const labels = extra.commercialStatus.split(',').map((v) => (v === COMMERCIAL_STATUS_NONE ? 'sin indicar' : commercialStatusLabel(v).toLowerCase()))
    chips.push({ key: 'commercialStatus', label: `Estado comercial: ${labels.join(' o ')}`, keys: ['commercialStatus'] })
  }
  if (extra.exclusivity) chips.push({ key: 'exclusivity', label: EXCLUSIVITY_FILTER_LABELS[extra.exclusivity] || extra.exclusivity, keys: ['exclusivity'] })
  if (extra.neighborhood) chips.push({ key: 'neighborhood', label: `Barrio: ${extra.neighborhood}`, keys: ['neighborhood'] })
  if (extra.municipality) chips.push({ key: 'municipality', label: `Municipio: ${extra.municipality}`, keys: ['municipality'] })
  if (extra.tags) {
    const labels = extra.tags.split(',').map((id) => name(options?.tags, id) || `#${id}`)
    chips.push({ key: 'tags', label: `Etiqueta: ${labels.join(' + ')}`, keys: ['tags'] })
  }
  if (BBOX_KEYS.some((k) => extra[k])) chips.push({ key: 'bbox', label: 'Zona del mapa', keys: [...BBOX_KEYS] })
  if (RADIUS_KEYS.some((k) => extra[k])) {
    chips.push({ key: 'radius', label: `A ${extra.radiusKm || '?'} km de (${fmtCoord(extra.lat || '')}, ${fmtCoord(extra.lng || '')})`, keys: [...RADIUS_KEYS] })
  }
  const cfIds = new Set(Object.keys(extra).map((k) => /^cf_(\d+)/.exec(k)?.[1]).filter(Boolean) as string[])
  for (const id of cfIds) {
    const def = options?.customFields.find((d) => String(d.id) === id)
    const label = def?.label || `Campo #${id}`
    const parts: string[] = []
    const v = extra[`cf_${id}`]
    if (v) parts.push(def ? formatCustomFieldValue(def.fieldType === 'multiselect' ? 'select' : def.fieldType, def.fieldType === 'boolean' ? v === '1' : v) || v : v)
    if (extra[`cf_${id}_min`]) parts.push(`desde ${extra[`cf_${id}_min`]}`)
    if (extra[`cf_${id}_max`]) parts.push(`hasta ${extra[`cf_${id}_max`]}`)
    chips.push({ key: `cf_${id}`, label: `${label}: ${parts.join(' ')}`, keys: [`cf_${id}`, `cf_${id}_min`, `cf_${id}_max`] })
  }
  return chips
}
