import L from 'leaflet'
// Importado aquí (no en el array `css:` global de nuxt.config.ts) para que
// viaje con el chunk asíncrono de quien use este composable — que siempre es
// un `.client.vue`. Un import global queda atado a lo primero que tire de él
// en el build y ese CSS nunca llega a tener un <link> aquí — Nuxt sólo
// precarga CSS de lo que renderiza en servidor, y un `.client.vue` por
// diseño no renderiza nada ahí. Ver docs/production-hardening-audit.md.
// Centralizado aquí en vez de repetido en cada componente de mapa: antes
// vivía duplicado (con el mismo comentario) en LocationPicker, MapExplorer y
// EmbedMiniMap.
import 'leaflet/dist/leaflet.css'

/**
 * Un mapa Leaflet sobre `container`, con su tamaño mantenido en sincronía
 * mediante ResizeObserver — la corrección de raíz para la causa más
 * frecuente de "mapa en gris/mal encajado": crearse dentro de un contenedor
 * oculto (una pestaña con `v-show`, un acordeón, un modal que aún no se
 * abrió). `L.map()` calcula el tamaño interno una sola vez, en el momento de
 * crearse; si en ese instante el contenedor mide 0×0 (display:none), tiles
 * y marcadores quedan posicionados para ese tamaño y ningún cambio de CSS
 * posterior lo corrige por sí solo — hace falta llamar a
 * `invalidateSize()` cuando el contenedor recupera su tamaño real.
 *
 * ResizeObserver es la única señal genérica para "el contenedor cambió de
 * tamaño", sin que este composable (ni quien lo usa) tenga que conocer el
 * mecanismo concreto de visibilidad de turno: no dispara mientras el
 * elemento sigue en `display:none` (no tiene caja), y dispara exactamente
 * una vez cuando pasa a tener una caja real — justo cuando hace falta
 * `invalidateSize()`. Cualquier consumidor futuro que monte un mapa dentro
 * de algo que pueda estar oculto al montarse queda cubierto sin más que usar
 * este composable, sin parches por caso.
 */
export function useLeafletMap(container: Ref<HTMLElement | null>, options: L.MapOptions = {}) {
  const map = shallowRef<L.Map | null>(null)
  let resizeObserver: ResizeObserver | null = null

  onMounted(() => {
    if (!container.value) return
    map.value = L.map(container.value, options)
    resizeObserver = new ResizeObserver(() => map.value?.invalidateSize())
    resizeObserver.observe(container.value)
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    // map.remove() ya limpia todas las capas/marcadores/listeners propios —
    // ningún consumidor necesita su propia limpieza de marcadores al
    // desmontar, sólo al RECONSTRUIR con datos nuevos mientras sigue montado.
    map.value?.remove()
    map.value = null
  })

  return { map }
}

/** Las tres capas base que usa todo el sistema de mapas — un único sitio para sus URLs, no repetidas por componente. */
export const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
} as const

export type TileKey = keyof typeof TILE_URLS

/** Nunca cambiar de proveedor de tiles sin motivo documentado (megaprompt de mapas): sigue siendo CartoDB/Esri, sólo con una URL compartida en vez de tres copias. */
export function createTileLayer(key: TileKey): L.TileLayer {
  if (key === 'satellite') return L.tileLayer(TILE_URLS.satellite, { maxZoom: 19, attribution: 'Esri' })
  return L.tileLayer(TILE_URLS[key], { maxZoom: 20, attribution: '© OSM · CARTO' })
}
