/**
 * Filtros y vistas guardadas sobre Property Search (FASE 27 incremento 2).
 *
 * Guarda sólo la CONFIGURACIÓN del filtro (`queryJson`/`columnsJson`), nunca
 * un resultado — aplicar una vista compartida vuelve a pedir
 * `/api/admin/<resource>` con la sesión de quien la aplica, así que los
 * permisos se evalúan en ese momento, no se heredan de quien la creó
 * (§75-76, §153). El servidor (server/utils/properties/savedViews.ts)
 * refuerza lo mismo: compartir amplía quién LEE, nunca quién puede editar o
 * borrar — eso sigue siendo sólo quien la creó.
 */
export interface PropertySavedView {
  id: number
  resource: string
  kind: 'filter' | 'view'
  name: string
  visibility: 'private' | 'shared'
  queryJson: string
  columnsJson: string | null
  density: 'comfortable' | 'compact' | null
  userId: number
  updatedAt: string
}

export interface SavePropertyViewInput {
  kind: 'filter' | 'view'
  name: string
  visibility: 'private' | 'shared'
  query: Record<string, unknown>
  columns?: string[] | null
  density?: string | null
}

export function usePropertySavedViews(resource: 'properties' | 'developer-properties') {
  const { data, refresh, pending } = useFetch<{ rows: PropertySavedView[] }>('/api/admin/property-saved-views', {
    query: { resource, perPage: 100 },
  })

  const views = computed(() => data.value?.rows ?? [])
  const filters = computed(() => views.value.filter((v) => v.kind === 'filter'))
  const savedViews = computed(() => views.value.filter((v) => v.kind === 'view'))

  async function save(input: SavePropertyViewInput) {
    await $fetch('/api/admin/property-saved-views', {
      method: 'POST',
      body: {
        resource,
        kind: input.kind,
        name: input.name,
        visibility: input.visibility,
        queryJson: JSON.stringify(input.query),
        columnsJson: input.columns ? JSON.stringify(input.columns) : null,
        density: input.density ?? null,
      },
    })
    await refresh()
  }

  async function remove(id: number) {
    await $fetch(`/api/admin/property-saved-views/${id}`, { method: 'DELETE' })
    await refresh()
  }

  return { views, filters, savedViews, pending, refresh, save, remove }
}
