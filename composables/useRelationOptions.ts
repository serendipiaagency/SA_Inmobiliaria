/**
 * Opciones para un campo que guarda el id de otro recurso del panel (oficina,
 * equipo, comercial, usuario…): los registros de `/api/admin/<resource>` con
 * su etiqueta legible. Una sola petición por recurso y pestaña, compartida
 * entre el formulario y el listado genéricos (`pages/admin/[resource]/`).
 *
 * Sólo da etiquetas: quién puede leer el recurso lo decide el servidor
 * (requireOrgScope), y si no puede, la lista queda vacía y el campo enseña
 * el id tal cual.
 */
export interface RelationOption {
  id: number
  label: string
}

const cache = new Map<string, Promise<RelationOption[]>>()

export function loadRelationOptions(resource: string, labelField = 'name'): Promise<RelationOption[]> {
  const cacheKey = `${resource}:${labelField}`
  let pending = cache.get(cacheKey)
  if (!pending) {
    pending = $fetch<{ rows: any[] }>(`/api/admin/${resource}`, { query: { perPage: 200 } })
      .then((res) => (res.rows || []).map((r) => ({ id: Number(r.id), label: String(r[labelField] ?? r.name ?? `#${r.id}`) })))
      .catch(() => {
        cache.delete(cacheKey)
        return []
      })
    cache.set(cacheKey, pending)
  }
  return pending
}

/** Olvida las opciones guardadas de un recurso (tras crear o borrar uno de sus registros). */
export function invalidateRelationOptions(resource: string): void {
  for (const key of [...cache.keys()]) if (key.startsWith(`${resource}:`)) cache.delete(key)
}

export function useRelationOptions(resource: string, labelField = 'name') {
  const options = ref<RelationOption[]>([])
  const loaded = ref(false)
  if (import.meta.client) {
    loadRelationOptions(resource, labelField).then((rows) => {
      options.value = rows
      loaded.value = true
    })
  }
  return { options, loaded }
}
