const KEY = 'sa_favorites'

export function useFavorites() {
  const ids = useState<number[]>('favorites', () => [])

  function load() {
    if (import.meta.client) {
      try {
        ids.value = JSON.parse(localStorage.getItem(KEY) || '[]')
      } catch {
        ids.value = []
      }
    }
  }
  function persist() {
    if (import.meta.client) localStorage.setItem(KEY, JSON.stringify(ids.value))
  }
  function isFavorite(id: number) {
    return ids.value.includes(id)
  }
  function toggle(id: number) {
    const on = !isFavorite(id)
    ids.value = on ? [...ids.value, id] : ids.value.filter((x) => x !== id)
    persist()
    if (import.meta.client) $fetch('/api/public/favorite', { method: 'POST', body: { id, on } }).catch(() => {})
  }

  return { ids, load, isFavorite, toggle }
}
