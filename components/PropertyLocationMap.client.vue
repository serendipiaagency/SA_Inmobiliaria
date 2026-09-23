<template>
  <div ref="el" class="h-full w-full" />
</template>

<script setup lang="ts">
/**
 * El pin de "Dónde está" en la ficha pública de una propiedad — sólo
 * lectura, nada que arrastrar ni en qué hacer clic para reubicar (eso es
 * el editor de admin, LocationPicker.client.vue). Siempre las coordenadas
 * reales de la propiedad, nunca un valor estático: quien la monta
 * (pages/propiedades/[slug].vue) sólo lo hace cuando `hasValidCoords` ya
 * ha comprobado que hay una ubicación real que enseñar.
 */
import L from 'leaflet'
import { useLeafletMap, createTileLayer } from '~/composables/useLeafletMap'

const props = defineProps<{ lat: number; lng: number; label?: string | null }>()

const ZOOM = 15
const el = ref<HTMLElement | null>(null)
const { map } = useLeafletMap(el, { zoomControl: true, scrollWheelZoom: false, center: [props.lat, props.lng], zoom: ZOOM })

onMounted(() => {
  if (!map.value) return
  createTileLayer('light').addTo(map.value)
  const marker = L.marker([props.lat, props.lng]).addTo(map.value)
  if (props.label) marker.bindPopup(props.label)
})
</script>
