<template>
  <div class="relative h-full w-full overflow-hidden rounded-[10px]">
    <div ref="el" class="h-full w-full" />
    <!-- Delante del mapa: sin arrastre ni zoom aquí, el mapa grande es «Buscar en el mapa». -->
    <div class="absolute inset-0 z-[500]" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import L from 'leaflet'
import { useLeafletMap, createTileLayer, createPinIcon } from '~/composables/useLeafletMap'
import { withValidCoords } from '~/utils/maps/coords'

/**
 * El mapa pequeño del panel de filtros del catálogo (#109): un mapa real
 * (las mismas teselas que el resto de la web, sin clave de API), con un
 * marcador en el centro de lo que se está viendo y un área que lo abarca.
 * Con un radio activo («cerca de un punto»), ese radio. Es una vista
 * resumida: para buscar sobre el mapa está el botón «Buscar en el mapa».
 */
const props = defineProps<{
  items: { lat?: number | null; lng?: number | null }[]
  circle?: { lat: number; lng: number; radiusKm: number } | null
}>()

// Igual que el teaser del Constructor (MapTeaserMap.client.vue): sin datos, España.
const FALLBACK_CENTER: [number, number] = [40.4168, -3.7038]
const el = ref<HTMLElement | null>(null)
const { map, onMapReady } = useLeafletMap(el, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, attributionControl: false, center: FALLBACK_CENTER, zoom: 5 })

let layer: L.LayerGroup | null = null
function draw() {
  if (!map.value) return
  layer?.remove()
  layer = L.layerGroup().addTo(map.value)
  const pts = withValidCoords(props.items)
  let center: L.LatLng | null = null
  let radiusM = 0
  if (props.circle) {
    center = L.latLng(props.circle.lat, props.circle.lng)
    radiusM = props.circle.radiusKm * 1000
  } else if (pts.length) {
    const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number]))
    center = bounds.getCenter()
    radiusM = Math.max(400, center.distanceTo(bounds.getNorthEast()))
  }
  if (!center) {
    map.value.setView(FALLBACK_CENTER, 5)
    return
  }
  const circle = L.circle(center, { radius: radiusM, color: '#5b7fb8', weight: 1, fillColor: '#7c9fd6', fillOpacity: 0.22 }).addTo(layer)
  L.marker(center, { icon: createPinIcon(), interactive: false }).addTo(layer)
  map.value.fitBounds(circle.getBounds(), { padding: [10, 10], maxZoom: 15 })
}

onMapReady(() => {
  if (!map.value) return
  createTileLayer('light').addTo(map.value)
  draw()
})
watch(() => [props.items, props.circle], draw, { deep: true })
</script>
