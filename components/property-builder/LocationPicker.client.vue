<template>
  <div class="overflow-hidden rounded-xl border border-line">
    <div ref="el" class="h-80 w-full" />
  </div>
</template>

<script setup lang="ts">
import L from 'leaflet'

const props = defineProps<{ lat: number | null | undefined; lng: number | null | undefined }>()
const emit = defineEmits<{ 'update:lat': [number]; 'update:lng': [number] }>()

// No property has a location yet until an admin sets one — centers on
// Madrid at a country-level zoom rather than implying a false default pin.
const FALLBACK_CENTER: [number, number] = [40.4168, -3.7038]
const FALLBACK_ZOOM = 5
const PIN_ZOOM = 15

const el = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let marker: L.Marker | null = null
// Distinguishes a lat/lng prop change caused by this component's own
// click/drag (emit → parent → prop comes back down) from one caused
// externally (a geocode result) — only the latter should re-center/zoom.
let lastEmitted: string | null = null

function hasPin() {
  return typeof props.lat === 'number' && typeof props.lng === 'number'
}

function emitPosition(latlng: L.LatLng) {
  const lat = Math.round(latlng.lat * 1e6) / 1e6
  const lng = Math.round(latlng.lng * 1e6) / 1e6
  lastEmitted = `${lat},${lng}`
  emit('update:lat', lat)
  emit('update:lng', lng)
}

function ensureMarker(latlng: L.LatLng) {
  if (!map) return
  if (marker) {
    marker.setLatLng(latlng)
  } else {
    marker = L.marker(latlng, { draggable: true }).addTo(map)
    marker.on('dragend', () => emitPosition(marker!.getLatLng()))
  }
}

function placeMarker(latlng: L.LatLng) {
  ensureMarker(latlng)
  emitPosition(latlng)
}

onMounted(() => {
  if (!el.value) return
  const start: [number, number] = hasPin() ? [props.lat as number, props.lng as number] : FALLBACK_CENTER
  map = L.map(el.value, { zoomControl: true, scrollWheelZoom: true }).setView(start, hasPin() ? PIN_ZOOM : FALLBACK_ZOOM)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: '© OSM · CARTO' }).addTo(map)

  if (hasPin()) ensureMarker(L.latLng(start[0], start[1]))

  map.on('click', (e: L.LeafletMouseEvent) => placeMarker(e.latlng))
})

// A successful geocode from the parent updates props.lat/lng externally —
// re-center and (re)place the marker to reflect it. Skipped when the change
// is just this component's own click/drag echoing back down.
watch(
  () => [props.lat, props.lng],
  ([lat, lng]) => {
    if (!map || typeof lat !== 'number' || typeof lng !== 'number') return
    const key = `${lat},${lng}`
    if (key === lastEmitted) return
    const latlng = L.latLng(lat, lng)
    ensureMarker(latlng)
    map.setView(latlng, Math.max(map.getZoom(), PIN_ZOOM))
  },
)

onBeforeUnmount(() => {
  if (map) map.remove()
})
</script>
