import { shouldReloadOnChunkError, CHUNK_RELOAD_TTL_MS } from '~/utils/chunkReload'

/**
 * Fragmentos de JS de un despliegue anterior.
 *
 * Cada despliegue publica fragmentos con nombres nuevos y retira los viejos.
 * Quien abrió una página antes del despliegue sigue con el HTML viejo: cuando
 * más abajo se carga un componente diferido (Propiedades similares, el mapa,
 * la galería completa…), pide un fragmento que ya no existe y esa parte se
 * queda en blanco con «Failed to fetch dynamically imported module».
 *
 * Nuxt ya recarga cuando eso pasa al cambiar de página (va directo a la de
 * destino, `emitRouteChunkError: 'automatic'`). Aquí se cubre el resto: un
 * fallo fuera de una navegación en la web pública recarga la misma página una
 * vez, con lo que llegan el HTML y los fragmentos nuevos. `reloadNuxtApp`
 * guarda la ruta recargada un minuto en la pestaña: si el fragmento sigue
 * sin llegar después de recargar, no se vuelve a recargar en bucle.
 *
 * No se usa `'automatic-immediate'` porque también recarga sola cuando detecta
 * una compilación nueva (cada hora), y en el panel eso borraría lo que se
 * esté editando. Por lo mismo, en el panel (/admin) no se recarga nunca sin
 * que la persona navegue.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  let navigating = false
  router.beforeEach(() => {
    navigating = true
  })
  router.afterEach(() => {
    navigating = false
  })
  router.onError(() => {
    navigating = false
  })

  nuxtApp.hook('app:chunkError', () => {
    const path = router.currentRoute.value.fullPath
    if (!shouldReloadOnChunkError({ path, navigating })) return
    reloadNuxtApp({ path, ttl: CHUNK_RELOAD_TTL_MS })
  })
})
