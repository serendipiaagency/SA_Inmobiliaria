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
import { mapTilesConfig, tileSpec, type TileKey } from '~/utils/maps/tiles'

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
  let stopWaiting: (() => void) | null = null
  const readyCallbacks: (() => void)[] = []

  function init() {
    if (map.value || !container.value) return
    map.value = L.map(container.value, options)
    resizeObserver = new ResizeObserver(() => map.value?.invalidateSize())
    resizeObserver.observe(container.value)
    for (const cb of readyCallbacks.splice(0)) cb()
  }

  onMounted(() => {
    init()
    // Un componente `.client` que se monta durante la hidratación (entrar a
    // la página por un enlace o recargarla) pinta primero el marcador de
    // posición de Nuxt (nuxt/dist/app/components/client-only.js) y ejecuta
    // sus onMounted ANTES de pintar su plantilla real: el contenedor todavía
    // no existe. Antes el mapa no se creaba nunca en ese caso — /mapa salía
    // vacío al entrar directamente y sólo funcionaba navegando desde otra
    // página. Ahora se crea en cuanto el contenedor aparece.
    if (!map.value) {
      stopWaiting = watch(
        container,
        () => {
          init()
          if (map.value) stopWaiting?.()
        },
        { flush: 'post' },
      )
    }
  })

  /**
   * Lo que el componente tiene que hacer cuando el mapa ya existe (capas,
   * marcadores, listeners). Sustituye al `onMounted` de cada mapa, que con la
   * hidratación podía llegar antes que el mapa.
   */
  function onMapReady(cb: () => void) {
    if (map.value) cb()
    else readyCallbacks.push(cb)
  }

  onBeforeUnmount(() => {
    stopWaiting?.()
    readyCallbacks.length = 0
    resizeObserver?.disconnect()
    resizeObserver = null
    // map.remove() ya limpia todas las capas/marcadores/listeners propios —
    // ningún consumidor necesita su propia limpieza de marcadores al
    // desmontar, sólo al RECONSTRUIR con datos nuevos mientras sigue montado.
    map.value?.remove()
    map.value = null
  })

  return { map, onMapReady }
}

/**
 * El marcador de un punto (ficha pública de la propiedad, editor de
 * ubicación): un SVG en línea, no el icono por defecto de Leaflet. Ese busca
 * `marker-icon.png` en una ruta que deduce de su CSS, y con los nombres con
 * hash del build (`marker-icon.2b3e1faf.png`) la deduce mal: el mapa enseñaba
 * una imagen rota con el texto «Marker». Sin ficheros que cargar, no puede
 * romperse ni lo bloquea la CSP.
 */
export function createPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'pi-pin',
    html: '<svg width="30" height="42" viewBox="0 0 30 42" aria-hidden="true"><path d="M15 40.5S28 25.6 28 15a13 13 0 1 0-26 0c0 10.6 13 25.5 13 25.5Z" fill="#16150f" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="#fff"/></svg>',
    iconSize: [30, 42],
    iconAnchor: [15, 41],
    popupAnchor: [0, -36],
  })
}

export type { TileKey }

/**
 * Las tres capas base de todo el sistema de mapas. Las URLs y atribuciones
 * viven en utils/maps/tiles.ts: CARTO con su clave o, sin ella, OpenStreetMap
 * (desde sep-2026 CARTO sin clave sólo sirve la tesela «API KEY REQUIRED»).
 * No se cambia de proveedor sin un motivo documentado en docs/maps.md.
 */
export function createTileLayer(key: TileKey): L.TileLayer {
  const { url, options } = tileSpec(key, mapTilesConfig())
  return L.tileLayer(url, options)
}
