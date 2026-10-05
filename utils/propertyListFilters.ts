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
import { PROPERTY_SUBTYPES, propertySubtypeLabel } from './propertySheet'
import { formatCustomFieldValue, type CustomFieldDefinitionDto } from './customFieldCatalog'

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
] as const

export const BBOX_KEYS = ['north', 'south', 'east', 'west'] as const
export const RADIUS_KEYS = ['lat', 'lng', 'radiusKm'] as const

export function isExtraFilterKey(key: string): boolean {
  return (EXTRA_FILTER_KEYS as readonly string[]).includes(key) || /^cf_\d+(_min|_max)?$/.test(key)
}

/** Sólo las claves de filtro extra (con valor) de una query cualquiera. */
export function pickExtraFilters(query: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(query)) {
    if (!isExtraFilterKey(k)) continue
    const s = Array.isArray(v) ? v.join(',') : v == null ? '' : String(v)
    if (s.trim() !== '') out[k] = s
  }
  return out
}

/** Las características con columna en los dos catálogos (mismas que entiende la Domain Tool search_properties). */
export const PROPERTY_FEATURE_LABELS: Record<string, string> = {
  terrace: 'Terraza',
  pool: 'Piscina',
  garage: 'Garaje',
  elevator: 'Ascensor',
  garden: 'Jardín',
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
