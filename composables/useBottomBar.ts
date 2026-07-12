export function useBottomBar() {
  const activeBars = useState<Record<string, boolean>>('bottomBarRegistry', () => ({}))
  function register(id: string, visible: boolean) {
    // No-op guard. register() is called from a watchEffect (in PropertyStickyBar
    // and CompareBar); without this early return the spread below both READS and
    // WRITES activeBars, which invalidates the effect's own dependency and spins
    // an infinite reactive loop — Vue caps it at 100 updates per flush but it
    // still burns CPU on every tick and, combined with the heavy property page,
    // hangs the browser before the page finishes loading.
    if (activeBars.value[id] === visible) return
    activeBars.value = { ...activeBars.value, [id]: visible }
  }
  const hasActiveBar = computed(() => Object.values(activeBars.value).some(Boolean))
  return { register, hasActiveBar }
}
