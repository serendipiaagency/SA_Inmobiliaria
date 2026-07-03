const KEY = 'sa_compare'
const MAX = 4

export interface CompareItem {
  id: number
  slug?: string | null
  name: string
  cover?: string | null
  price?: number | null
}

export function useCompare() {
  const items = useState<CompareItem[]>('compare', () => [])

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
  function has(id: number) {
    return items.value.some((i) => i.id === id)
  }
  const full = computed(() => items.value.length >= MAX)
  function toggle(item: CompareItem) {
    if (has(item.id)) {
      items.value = items.value.filter((i) => i.id !== item.id)
    } else if (!full.value) {
      items.value = [...items.value, item]
    }
    persist()
  }
  function remove(id: number) {
    items.value = items.value.filter((i) => i.id !== id)
    persist()
  }
  function clear() {
    items.value = []
    persist()
  }

  return { items, load, has, toggle, remove, clear, full, MAX }
}
