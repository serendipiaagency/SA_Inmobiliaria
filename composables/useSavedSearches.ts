import { nearbyFromQuery } from '~/utils/publicSearch'

const KEY = 'sa_saved_searches'

export interface SavedSearch {
  id: string
  label: string
  query: Record<string, string>
  createdAt: number
}

/**
 * Saved searches, persisted client-side (no account system to attach them
 * to). Mirrors the useFavorites/useCompare localStorage pattern.
 */
export function useSavedSearches() {
  const items = useState<SavedSearch[]>('saved-searches', () => [])

  function load() {
    if (import.meta.client) {
      try {
        items.value = JSON.parse(localStorage.getItem(KEY) || '[]')
      } catch {
        items.value = []
      }
    }
  }
  function persist() {
    if (import.meta.client) localStorage.setItem(KEY, JSON.stringify(items.value))
  }

  function isSaved(query: Record<string, any>) {
    const norm = normalize(query)
    return items.value.some((s) => normalize(s.query) === norm)
  }

  function save(label: string, query: Record<string, any>) {
    const clean: Record<string, string> = {}
    for (const [k, v] of Object.entries(query)) if (v != null && v !== '') clean[k] = String(v)
    const entry: SavedSearch = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label, query: clean, createdAt: Date.now() }
    items.value = [entry, ...items.value].slice(0, 30)
    persist()
    return entry
  }

  function remove(id: string) {
    items.value = items.value.filter((s) => s.id !== id)
    persist()
  }

  function normalize(query: Record<string, any>) {
    const clean: Record<string, string> = {}
    for (const [k, v] of Object.entries(query)) if (v != null && v !== '' && k !== 'page') clean[k] = String(v)
    return JSON.stringify(Object.keys(clean).sort().map((k) => [k, clean[k]]))
  }

  return { items, load, save, remove, isSaved }
}

/**
 * El nombre con el que se guarda una búsqueda pública («Chamberí · 28010 · a
 * menos de 5 km · 2+ hab.»), desde la query de la URL. Lo comparten el
 * listado y el mapa, así que una búsqueda por código postal o por radio se
 * reconoce en «Búsquedas guardadas».
 */
export function describePublicSearch(query: Record<string, any>, t: (key: string, fallback?: string) => string, typeLabel: (type: string) => string): string {
  const parts: string[] = []
  if (query.q) parts.push(String(query.q))
  if (query.municipality) parts.push(String(query.municipality))
  if (query.neighborhood) parts.push(String(query.neighborhood))
  if (query.postalCode) parts.push(String(query.postalCode))
  const nearby = nearbyFromQuery(query)
  if (nearby) parts.push(`${t('search.label.near', 'a menos de')} ${nearby.radiusKm} km`)
  if (query.type) parts.push(typeLabel(String(query.type)))
  if (query.bedrooms) parts.push(`${query.bedrooms}+ ${t('card.beds', 'hab.')}`)
  if (query.minPrice || query.maxPrice) parts.push(t('search.label.budget', 'presupuesto'))
  if (query.pool) parts.push(t('search.label.pool', 'piscina'))
  if (query.status === 'new') parts.push(t('search.label.newBuild', 'obra nueva'))
  if (!parts.length) parts.push(t('search.label.allProperties', 'Todas las propiedades'))
  return parts.join(' · ')
}
