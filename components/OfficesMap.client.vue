<template>
  <div ref="el" class="h-full min-h-[280px] w-full" data-testid="offices-map-canvas" />
</template>

<script setup lang="ts">
/**
 * Mapa de las oficinas publicadas (bloque «Nuestras oficinas» y /oficinas):
 * un pin por oficina con coordenadas, popup con su nombre y dirección
 * (escapados: vienen de la base de datos). En el lienzo del Constructor no
 * se arrastra, como el mapa teaser. Sólo lectura.
 */
import L from 'leaflet'
import { useLeafletMap, createTileLayer, createPinIcon } from '~/composables/useLeafletMap'

const props = withDefaults(defineProps<{ offices: Array<{ id: number; name: string; lat: number | null; lng: number | null; address?: string | null; city?: string | null }>; mode?: 'production' | 'builder' | 'preview' }>(), { mode: 'production' })

const el = ref<HTMLElement | null>(null)
const pins = computed(() => props.offices.filter((o) => typeof o.lat === 'number' && typeof o.lng === 'number' && Number.isFinite(o.lat) && Number.isFinite(o.lng)) as Array<{ id: number; name: string; lat: number; lng: number; address?: string | null; city?: string | null }>)
const first = pins.value[0]
const { map, onMapReady } = useLeafletMap(el, { zoomControl: true, scrollWheelZoom: false, dragging: props.mode !== 'builder', center: first ? [first.lat, first.lng] : [40.4168, -3.7038], zoom: first ? 15 : 5 })
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c)

let layer: L.LayerGroup | null = null
function render() {
  if (!map.value) return
  if (!layer) layer = L.layerGroup().addTo(map.value)
  layer.clearLayers()
  const bounds: [number, number][] = []
  for (const o of pins.value) {
    const m = L.marker([o.lat, o.lng], { icon: createPinIcon(), title: o.name })
    const where = [o.address, o.city].filter(Boolean).map(esc).join('<br>')
    m.bindPopup(`<strong>${esc(o.name)}</strong>${where ? `<br>${where}` : ''}`)
    layer.addLayer(m)
    bounds.push([o.lat, o.lng])
  }
  if (bounds.length > 1) map.value.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
  else if (bounds.length === 1) map.value.setView(bounds[0], 15)
}

onMapReady(() => {
  if (!map.value) return
  createTileLayer('light').addTo(map.value)
  render()
})
watch(pins, render)
</script>
