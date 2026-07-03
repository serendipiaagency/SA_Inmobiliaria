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
    ids.value = isFavorite(id) ? ids.value.filter((x) => x !== id) : [...ids.value, id]
    persist()
  }

  return { ids, load, isFavorite, toggle }
}
