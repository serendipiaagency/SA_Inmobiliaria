/**
 * Los datos públicos de la ficha que se piden desde el navegador (#111): el
 * Serendipia Score y la Decisión rápida (`score`), los indicadores
 * (`engagement`) y el historial de precio (`price-history`). Varias tarjetas
 * usan el mismo — el Score y la Decisión rápida, o la tarjeta de precio del
 * móvil y la del escritorio —, así que se pide una sola vez por propiedad y
 * se comparte. Se pide al montar: el servidor pinta la ficha sin esperar a
 * estos cálculos.
 */
type InsightKind = 'score' | 'engagement' | 'price-history'

const inflight = new Map<string, Promise<unknown>>()

export function usePropertyInsight<T>(slug: string, kind: InsightKind) {
  const key = `ficha-${kind}-${slug}`
  const state = useState<{ loading: boolean; data: T | null }>(key, () => ({ loading: true, data: null }))
  onMounted(() => {
    if (!state.value.loading) return
    let request = inflight.get(key)
    if (!request) {
      request = $fetch<T>(`/api/public/properties/${encodeURIComponent(slug)}/${kind}`).catch(() => null)
      inflight.set(key, request)
    }
    request.then((data) => {
      state.value = { loading: false, data: (data as T) ?? null }
    })
  })
  return state
}
