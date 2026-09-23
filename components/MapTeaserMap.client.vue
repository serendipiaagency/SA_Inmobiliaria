<template>
  <div class="relative h-full w-full">
    <div ref="el" class="h-full w-full" />
    <!-- Capa de bloqueo en modo edición: un `<div>` aparte delante del mapa,
         no una clase reactiva sobre el propio contenedor de Leaflet (ver
         nota más abajo sobre por qué esa vía rompía el mapa). Sin listeners
         propios, así que un clic la atraviesa hacia el `SbBox` — lo
         intercepta la fase de captura de SiteBlockFrame.vue antes de llegar
         aquí — pero al ser hermano de `el`, un mousedown/wheel nunca
         burbujea a través del contenedor de Leaflet, así que ni arrastra ni
         hace zoom mientras se edita. -->
    <div v-if="locked" class="mtm-lock-overlay absolute inset-0 z-[1200]" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import L from 'leaflet'
import { useLeafletMap, createTileLayer } from '~/composables/useLeafletMap'

interface MapTeaserPin {
  id: number
  lat: number
  lng: number
  name: string
  slug?: string | null
  community?: string | null
  price?: number | null
}

const props = withDefaults(
  defineProps<{
    pins: MapTeaserPin[]
    /** Igual que LeadFormBlock/BookVisitBlock: en el lienzo el mapa no debe capturar el gesto que selecciona el bloque. */
    mode?: 'production' | 'builder' | 'preview'
  }>(),
  { mode: 'production' },
)

// Mismo fallback que el editor de admin (LocationPicker.client.vue): Madrid.
// /mapa usa Dubái a propósito — mercado distinto, ver la nota en
// MapExplorer.client.vue — no es una inconsistencia a unificar.
const FALLBACK_CENTER: [number, number] = [40.4168, -3.7038]
const FALLBACK_ZOOM = 5
const SINGLE_ZOOM = 13

const el = ref<HTMLElement | null>(null)
const initialCenter: [number, number] = props.pins.length ? [props.pins[0].lat, props.pins[0].lng] : FALLBACK_CENTER
const { map } = useLeafletMap(el, {
  zoomControl: true,
  scrollWheelZoom: false,
  center: initialCenter,
  zoom: props.pins.length === 1 ? SINGLE_ZOOM : FALLBACK_ZOOM,
})

/**
 * El primer clic en el lienzo del Constructor selecciona el bloque, como
 * cualquier otro nodo — no debe interactuar con el mapa. SiteBlockFrame.vue
 * sólo intercepta click/dblclick en fase de captura, lo que no basta para el
 * propio arrastre (mousedown) o zoom con rueda (wheel) de Leaflet.
 *
 * La primera versión de este bloqueo ponía `pointer-events:none` con una
 * clase reactiva directamente sobre el `<div>` que L.map() toma como
 * contenedor. Se veía bien al montar, pero en cuanto `mode` cambiaba
 * (editor → Vista previa) Vue volvía a calcular esa clase y REESCRIBÍA por
 * completo el `className` del elemento — Leaflet añade `leaflet-container` y
 * el resto de sus clases de forma imperativa (`container.className += ...`),
 * fuera de la reactividad de Vue, así que cualquier repintado del binding
 * las borraba sin que Leaflet se enterase: el mapa seguía "vivo" (paneles,
 * marcador y controles seguían ahí) pero sin su clase raíz, y con ella se
 * iba el `position:relative` del que depende el posicionamiento de las
 * teselas — de ahí el rectángulo en blanco. Un `<div>` de bloqueo aparte
 * (arriba, hermano de `el`) nunca toca las clases que Leaflet gestiona.
 */
const locked = computed(() => props.mode === 'builder')
watchEffect(() => {
  if (!map.value) return
  if (locked.value) map.value.keyboard.disable()
  else map.value.keyboard.enable()
})

const { format: formatPrice } = useCurrency()

function makeIcon(p: MapTeaserPin) {
  const label = p.price ? formatPrice(p.price) : p.name
  return L.divIcon({ className: '', html: `<div class="mtm-pin">${label}</div>`, iconSize: [76, 28], iconAnchor: [38, 28] })
}

let markersLayer: L.LayerGroup | null = null

function render() {
  if (!map.value) return
  if (!markersLayer) markersLayer = L.layerGroup().addTo(map.value)
  markersLayer.clearLayers()

  if (!props.pins.length) {
    map.value.setView(FALLBACK_CENTER, FALLBACK_ZOOM)
    return
  }

  const bounds: [number, number][] = []
  for (const p of props.pins) {
    const href = `/propiedades/${p.slug || p.id}`
    const marker = L.marker([p.lat, p.lng], { icon: makeIcon(p) })
    marker.bindPopup(
      `<div class="mtm-card"><a href="${href}" class="mtm-card-name">${p.name}</a>` +
        (p.community ? `<p class="mtm-card-loc">${p.community}</p>` : '') +
        (p.price ? `<p class="mtm-card-price">${formatPrice(p.price)}</p>` : '') +
        `</div>`,
      { className: 'mtm-popup', maxWidth: 200 },
    )
    markersLayer.addLayer(marker)
    bounds.push([p.lat, p.lng])
  }
  if (bounds.length > 1) map.value.fitBounds(bounds, { padding: [48, 48] })
  else map.value.setView(bounds[0], SINGLE_ZOOM)
}

onMounted(() => {
  if (!map.value) return
  createTileLayer('light').addTo(map.value)
  render()
})

watch(() => props.pins, render)
</script>

<style>
.mtm-pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #16150f;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 9999px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  white-space: nowrap;
}
.mtm-popup .leaflet-popup-content-wrapper {
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.35);
}
.mtm-popup .leaflet-popup-content {
  margin: 0;
  width: 200px !important;
}
.mtm-card {
  padding: 12px 14px 14px;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
}
.mtm-card-name {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #16150f;
}
.mtm-card-name:hover {
  text-decoration: underline;
}
.mtm-card-loc {
  margin-top: 1px;
  font-size: 12px;
  color: #78716c;
}
.mtm-card-price {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #16150f;
}
</style>
