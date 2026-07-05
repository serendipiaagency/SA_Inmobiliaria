export function useBottomBar() {
  const activeBars = useState<Record<string, boolean>>('bottomBarRegistry', () => ({}))
  function register(id: string, visible: boolean) {
    activeBars.value = { ...activeBars.value, [id]: visible }
  }
  const hasActiveBar = computed(() => Object.values(activeBars.value).some(Boolean))
  return { register, hasActiveBar }
}
