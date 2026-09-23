<template>
  <div class="overflow-hidden rounded-xl border border-line">
    <div ref="el" class="h-80 w-full" />
  </div>
</template>

<script setup lang="ts">
import L from 'leaflet'
import { useLeafletMap, createTileLayer } from '~/composables/useLeafletMap'

const props = defineProps<{ lat: number | null | undefined; lng: number | null | undefined }>()
const emit = defineEmits<{ 'update:lat': [number]; 'update:lng': [number] }>()

// No property has a location yet until an admin sets one — centers on
// Madrid at a country-level zoom rather than implying a false default pin.
const FALLBACK_CENTER: [number, number] = [40.4168, -3.7038]
const FALLBACK_ZOOM = 5
const PIN_ZOOM = 15

function hasPin() {
  return typeof props.lat === 'number' && typeof props.lng === 'number'
}

const el = ref<HTMLElement | null>(null)
const start: [number, number] = hasPin() ? [props.lat as number, props.lng as number] : FALLBACK_CENTER
// useLeafletMap crea el mapa en su propio onMounted, registrado antes que el
// de aquí abajo — Vue dispara los hooks de un mismo componente en el orden
// en que se registran, así que map.value ya existe cuando llega el nuestro.
// Corrige de raíz el mapa en gris/mal encajado que salía al montarse en la
// pestaña "Ubicación" (oculta con v-show, no la primera del editor): antes
// nada llamaba a invalidateSize() al mostrarla; ahora el ResizeObserver del
// composable lo hace solo, para esta pestaña y para cualquier otro sitio
// oculto donde se monte este picker en el futuro.
const { map } = useLeafletMap(el, { zoomControl: true, scrollWheelZoom: true, center: start, zoom: hasPin() ? PIN_ZOOM : FALLBACK_ZOOM })

let marker: L.Marker | null = null
// Distinguishes a lat/lng prop change caused by this component's own
// click/drag (emit → parent → prop comes back down) from one caused
// externally (a geocode result) — only the latter should re-center/zoom.
let lastEmitted: string | null = null

function emitPosition(latlng: L.LatLng) {
  const lat = Math.round(latlng.lat * 1e6) / 1e6
  const lng = Math.round(latlng.lng * 1e6) / 1e6
  lastEmitted = `${lat},${lng}`
  emit('update:lat', lat)
  emit('update:lng', lng)
}

function ensureMarker(latlng: L.LatLng) {
  if (!map.value) return
  if (marker) {
    marker.setLatLng(latlng)
  } else {
    marker = L.marker(latlng, { draggable: true }).addTo(map.value)
    marker.on('dragend', () => emitPosition(marker!.getLatLng()))
  }
}

function placeMarker(latlng: L.LatLng) {
  ensureMarker(latlng)
  emitPosition(latlng)
}

onMounted(() => {
  if (!map.value) return
  createTileLayer('light').addTo(map.value)
  if (hasPin()) ensureMarker(L.latLng(start[0], start[1]))
  map.value.on('click', (e: L.LeafletMouseEvent) => placeMarker(e.latlng))
})

// A successful geocode from the parent updates props.lat/lng externally —
// re-center and (re)place the marker to reflect it. Skipped when the change
// is just this component's own click/drag echoing back down.
watch(
  () => [props.lat, props.lng],
  ([lat, lng]) => {
    if (!map.value || typeof lat !== 'number' || typeof lng !== 'number') return
    const key = `${lat},${lng}`
    if (key === lastEmitted) return
    const latlng = L.latLng(lat, lng)
    ensureMarker(latlng)
    map.value.setView(latlng, Math.max(map.value.getZoom(), PIN_ZOOM))
  },
)
</script>
