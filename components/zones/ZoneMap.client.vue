<template>
  <div ref="el" class="h-[420px] w-full" data-testid="zone-map-canvas" />
</template>

<script setup lang="ts">
/**
 * Mapa de una zona: centrado en sus coordenadas, con un pin por cada
 * propiedad publicada que el catálogo enseña para la zona (coordenadas ya
 * redactadas por la privacidad de la ficha). Sólo lectura. Los textos de los
 * popups se escapan: vienen de la base de datos, nunca al HTML tal cual.
 */
import L from 'leaflet'
import { useLeafletMap, createTileLayer, createPinIcon } from '~/composables/useLeafletMap'

const props = defineProps<{ lat: number; lng: number; zoom: number; name: string; pins: Array<{ id: number; lat: number; lng: number; name: string; slug: string; price?: number | null }> }>()

const el = ref<HTMLElement | null>(null)
const { map, onMapReady } = useLeafletMap(el, { zoomControl: true, scrollWheelZoom: false, center: [props.lat, props.lng], zoom: props.zoom })
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c)

onMapReady(() => {
  if (!map.value) return
  createTileLayer('light').addTo(map.value)
  if (!props.pins.length) {
    L.circle([props.lat, props.lng], { radius: props.zoom >= 14 ? 500 : 2500, color: '#1f4e5f', weight: 1, fillColor: '#1f4e5f', fillOpacity: 0.12 }).addTo(map.value)
    return
  }
  const group = L.featureGroup()
  for (const p of props.pins) {
    const m = L.marker([p.lat, p.lng], { icon: createPinIcon(), title: p.name })
    const price = typeof p.price === 'number' && p.price > 0 ? `<br><span>${esc(new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(p.price))}</span>` : ''
    m.bindPopup(`<a href="/propiedades/${encodeURIComponent(p.slug)}"><strong>${esc(p.name)}</strong></a>${price}`)
    group.addLayer(m)
  }
  group.addTo(map.value)
  if (props.pins.length > 1) map.value.fitBounds(group.getBounds().pad(0.2), { maxZoom: 15 })
})
</script>
