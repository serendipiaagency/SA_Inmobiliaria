import { parseLocations, type LocationSelection } from '~/utils/searchState'

/**
 * Nombre y contexto de las ubicaciones elegidas por identificador (la URL sólo
 * lleva `loc=es:mun:33024,…`): se piden una vez a /api/public/location-resolve
 * y se recuerdan en la sesión. Lo que el visitante elige en el autocompletado
 * ya viene con nombre y entra en la misma memoria, así que casi nunca hay
 * petición al navegar del Hero al catálogo.
 */
export interface LocationName {
  value: string
  context?: string | null
  parents?: string[]
}

export function useLocationNames() {
  const known = useState<Record<string, LocationName>>('location-names', () => ({}))

  function remember(list: LocationSelection[]) {
    const next = { ...known.value }
    let changed = false
    for (const l of list) {
      if (l.id && l.value && !next[l.id]) {
        next[l.id] = { value: l.value, context: l.context ?? null, parents: l.parents }
        changed = true
      }
    }
    if (changed) known.value = next
  }

  /** Rellena los nombres que falten (ids sin nombre), pidiéndolos al servidor si hace falta. */
  async function resolve(list: LocationSelection[]): Promise<LocationSelection[]> {
    const missing = list.filter((l) => l.id && !l.value && !known.value[l.id]).map((l) => l.id!)
    if (missing.length) {
      try {
        const res = await $fetch<{ items: LocationSelection[] }>('/api/public/location-resolve', { query: { ids: missing.join(',') } })
        remember(res.items)
      } catch {
        // Sin red o id desconocido: el chip enseña el id hasta que haya nombre; el filtro sigue funcionando.
      }
    }
    return withNames(list)
  }

  /** La lista con los nombres que ya se conocen (síncrono). */
  function withNames(list: LocationSelection[]): LocationSelection[] {
    return list.map((l) => {
      if (!l.id || l.value) return l
      const k = known.value[l.id]
      return k ? { ...l, value: k.value, context: k.context ?? null, parents: k.parents } : l
    })
  }

  return { known, remember, resolve, withNames }
}

/** Las ubicaciones de una consulta (URL), con sus nombres resueltos en cuanto llegan. */
export function useResolvedLocations(query: () => Record<string, unknown>) {
  const { resolve, withNames } = useLocationNames()
  const resolved = ref<LocationSelection[]>(withNames(parseLocations(query())))
  watch(
    () => parseLocations(query()),
    async (list) => {
      resolved.value = withNames(list)
      if (list.some((l) => l.id && !l.value)) resolved.value = await resolve(list)
    },
    { immediate: true, deep: true },
  )
  return resolved
}
