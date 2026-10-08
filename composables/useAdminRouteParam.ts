/**
 * Un parámetro de la ruta (`resource`, `id`) de las páginas genéricas del
 * panel (pages/admin/[resource]/index.vue y [id].vue), estable mientras se
 * sale de ellas.
 *
 * Al pasar rápido de una página genérica a otra que no lo es —Oficinas →
 * Equipos → Propiedades (web) sin esperar a que Equipos termine de cargar—,
 * Vue puede volver a pintar, o montar, el componente genérico con la ruta
 * NUEVA antes de retirarlo. Esa ruta no trae `resource`: con
 * `String(route.params.resource)` salía «undefined», no era ningún recurso y
 * la página lanzaba «Recurso desconocido» como 404 fatal — la persona veía
 * «Esta página no existe» (o la página en blanco) en vez de la que había
 * pulsado. Pasaba en producción, no en local: depende de la latencia.
 *
 * `value` conserva el último valor que sí tenía la ruta; `onThisRoute` dice si
 * la ruta actual es de verdad de esta página, que es lo único que justifica
 * un 404 («/admin/algo-que-no-existe» lo sigue dando).
 */
export function useAdminRouteParam(name: 'resource' | 'id') {
  const route = useRoute()
  const read = () => {
    const v = route.params[name]
    return typeof v === 'string' && v ? v : null
  }
  const last = ref<string | null>(read())
  watch(read, (v) => {
    if (v) last.value = v
  })
  return {
    value: computed(() => read() ?? last.value ?? ''),
    onThisRoute: computed(() => read() !== null),
  }
}
