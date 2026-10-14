import { MAP_ACTIONS, locationKindOfId, type MapAction } from './searchState'

/**
 * Presentación de los campos «Tipo de inmueble» y «Ubicación» del buscador
 * (Parte III del buscador global): lo que el Constructor Web ajusta por
 * bloque —en el Hero de la portada y en el panel de Propiedades, con las
 * MISMAS claves— y lo que los componentes leen. Sólo presentación: qué se
 * encuentra lo decide Property Search (utils/searchState.ts), nunca esto.
 *
 * Claves del contenido del bloque: typePlaceholder, typeShowCounts,
 * locationPlaceholder, locationSuggestions, locationShowCounts,
 * locationFeatured, locationMapSelect, locationMapDraw, locationMapNearby.
 */

/** Una ubicación destacada: una entidad del catálogo o una zona de la agencia, con el nombre con el que se eligió. */
export interface FeaturedLocation {
  id: string
  value: string
  context?: string | null
}

export interface SearchTypeOptions {
  /** Texto del campo vacío; vacío = el de la web en su idioma. */
  placeholder: string
  /** Número de propiedades junto a cada tipo. */
  showCounts: boolean
}

export interface SearchLocationOptions {
  placeholder: string
  /** Sugerencias como máximo (SEARCH_SUGGESTION_CHOICES). */
  maxSuggestions: number
  /** Número de propiedades en cada sugerencia. */
  showCounts: boolean
  /** Las que salen primero con el campo vacío (no limitan la búsqueda). */
  featured: FeaturedLocation[]
  /** Qué herramientas del mapa se ofrecen bajo las sugerencias. */
  mapSelect: boolean
  mapDraw: boolean
  mapNearby: boolean
}

export const SEARCH_SUGGESTION_CHOICES = [8, 10, 14, 20, 30] as const
export const SEARCH_SUGGESTIONS_DEFAULT = 14
export const SEARCH_FEATURED_MAX = 8
export const SEARCH_PLACEHOLDER_MAX = 60

const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, SEARCH_PLACEHOLDER_MAX) : '')

/** La lista de destacadas saneada: ids válidos (catálogo o zona), sin repetir, con nombre, como mucho SEARCH_FEATURED_MAX. */
export function normalizeFeaturedLocations(value: unknown): FeaturedLocation[] {
  const out: FeaturedLocation[] = []
  const seen = new Set<string>()
  for (const item of Array.isArray(value) ? value : []) {
    const id = typeof item?.id === 'string' ? item.id.trim() : ''
    if (!id || seen.has(id) || !locationKindOfId(id)) continue
    seen.add(id)
    out.push({ id, value: typeof item.value === 'string' ? item.value.trim().slice(0, 80) : '', context: typeof item.context === 'string' ? item.context.trim().slice(0, 80) : null })
    if (out.length >= SEARCH_FEATURED_MAX) break
  }
  return out
}

export function searchTypeOptions(content: Record<string, any> | null | undefined): SearchTypeOptions {
  return { placeholder: text(content?.typePlaceholder), showCounts: content?.typeShowCounts !== false }
}

export function searchLocationOptions(content: Record<string, any> | null | undefined): SearchLocationOptions {
  const n = Number(content?.locationSuggestions)
  return {
    placeholder: text(content?.locationPlaceholder),
    maxSuggestions: (SEARCH_SUGGESTION_CHOICES as readonly number[]).includes(n) ? n : SEARCH_SUGGESTIONS_DEFAULT,
    showCounts: content?.locationShowCounts !== false,
    featured: normalizeFeaturedLocations(content?.locationFeatured),
    mapSelect: content?.locationMapSelect !== false,
    mapDraw: content?.locationMapDraw !== false,
    mapNearby: content?.locationMapNearby !== false,
  }
}

/** Las herramientas del mapa activas, en su orden. */
export function searchMapTools(o: Pick<SearchLocationOptions, 'mapSelect' | 'mapDraw' | 'mapNearby'>): MapAction[] {
  const on: Record<MapAction, boolean> = { select: o.mapSelect, draw: o.mapDraw, nearby: o.mapNearby }
  return MAP_ACTIONS.filter((a) => on[a])
}
