<template>
  <div class="card mb-4 overflow-hidden" data-testid="property-list-map">
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-[12px]">
      <button type="button" class="btn-quiet !px-2.5 !py-1 text-xs" data-testid="map-search-area" @click="searchArea">Buscar en esta zona</button>
      <span class="text-stone-300">|</span>
      <label class="flex items-center gap-1.5">
        Radio
        <input v-model.number="radiusKm" type="number" min="0.1" max="500" step="0.5" class="input !w-20 !py-1 text-xs" aria-label="Radio en km" data-testid="map-radius-km">
        km
      </label>
      <button
        type="button"
        class="btn-quiet !px-2.5 !py-1 text-xs"
        :class="pickingCenter ? '!border-ink !text-ink' : ''"
        data-testid="map-pick-center"
        @click="pickingCenter = !pickingCenter"
      >
        {{ pickingCenter ? 'Pulsa en el mapa…' : 'Buscar alrededor de un punto' }}
      </button>
      <button v-if="hasGeo" type="button" class="text-[12px] font-medium text-stone-500 hover:text-ink hover:underline" data-testid="map-clear-geo" @click="emit('clear-geo')">Quitar zona</button>
      <span class="ml-auto text-stone-500" data-testid="map-count">
        <template v-if="loading">Cargando…</template>
        <template v-else>{{ total }} con ubicación<template v-if="capped"> · se enseñan {{ maxPoints }}: acerca el mapa o filtra más</template></template>
      </span>
    </div>
    <div class="relative">
      <div ref="el" class="h-[420px] w-full" :class="pickingCenter ? 'cursor-crosshair' : ''" />
      <p v-if="error" class="absolute inset-x-0 top-2 mx-auto w-fit rounded bg-red-50 px-3 py-1 text-[12px] text-red-700">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import L from 'leaflet'
import { useLeafletMap, createTileLayer } from '~/composables/useLeafletMap'
import { withValidCoords } from '~/utils/maps/coords'
import { PROPERTY_LIST_CONFIG } from '~/composables/usePropertyListConfig'

/**
 * Mapa del listado de propiedades del panel (FASE 2, bloque N7b), en los dos
 * catálogos. Reutiliza la base compartida de mapas (`useLeafletMap`, tiles
 * CartoDB — docs/maps.md). Pinta TODO el resultado filtrado con ubicación
 * (`?view=map` del mismo listado, con tope) y permite acotar la búsqueda:
 *  - «Buscar en esta zona»: la zona visible (bounding box);
 *  - «Buscar alrededor de un punto»: se pulsa en el mapa y se busca en el radio.
 * No filtra nada por su cuenta: emite el filtro y el listado lo aplica (URL,
 * CSV, vistas guardadas y acciones masivas lo ven igual).
 */
const props = defineProps<{ resource: 'properties' | 'developer-properties'; filters: Record<string, string> }>()
const emit = defineEmits<{
  'search-area': [bounds: { north: number; south: number; east: number; west: number }]
  'search-radius': [center: { lat: number; lng: number; radiusKm: number }]
  'clear-geo': []
}>()

const config = computed(() => PROPERTY_LIST_CONFIG[props.resource])
const el = ref<HTMLElement | null>(null)
// Centro de reserva sin propiedades: Madrid, igual que el editor de ubicación.
const { map, onMapReady } = useLeafletMap(el, { zoomControl: true, scrollWheelZoom: true, center: [40.4168, -3.7038], zoom: 5, preferCanvas: true })

const radiusKm = ref<number>(Number(props.filters.radiusKm) || 5)
const pickingCenter = ref(false)
const loading = ref(false)
const error = ref('')
const total = ref(0)
const capped = ref(false)
const maxPoints = ref(1000)
const hasGeo = computed(() => ['north', 'south', 'east', 'west', 'lat', 'lng', 'radiusKm'].some((k) => props.filters[k]))

let markers: L.LayerGroup | null = null
let geoLayer: L.Layer | null = null
let fittedOnce = false

// Moneda de la agencia, sin convertir (utils/currency.ts) — antes «€» fijo.
const { format: formatAgencyMoney } = useAgencyCurrency()
function money(v: unknown) {
  return typeof v === 'number' ? formatAgencyMoney(v) : ''
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

function drawGeo() {
  if (!map.value) return
  if (geoLayer) {
    geoLayer.remove()
    geoLayer = null
  }
  const f = props.filters
  if (f.north && f.south && f.east && f.west) {
    geoLayer = L.rectangle(
      [
        [Number(f.south), Number(f.west)],
        [Number(f.north), Number(f.east)],
      ],
      { color: '#16150f', weight: 1, fillOpacity: 0.04, interactive: false },
    ).addTo(map.value)
  } else if (f.lat && f.lng && f.radiusKm) {
    geoLayer = L.circle([Number(f.lat), Number(f.lng)], { radius: Number(f.radiusKm) * 1000, color: '#16150f', weight: 1, fillOpacity: 0.04, interactive: false }).addTo(map.value)
  }
}

async function load() {
  if (!map.value) return
  loading.value = true
  error.value = ''
  try {
    const query: Record<string, string> = { ...props.filters, view: 'map' }
    delete query.page
    const res = await $fetch<{ points: any[]; total: number; capped: boolean; maxPoints: number }>(`/api/admin/${props.resource}`, { query })
    total.value = res.total
    capped.value = res.capped
    maxPoints.value = res.maxPoints
    markers?.remove()
    markers = L.layerGroup()
    const pts = withValidCoords(res.points)
    for (const p of pts) {
      const title = escapeHtml(config.value.rowTitle(p) || `#${p.id}`)
      const where = escapeHtml([p.district || p.community, p.city].filter(Boolean).join(' · '))
      L.circleMarker([p.lat, p.lng], { radius: 6, color: '#ffffff', weight: 1.5, fillColor: '#16150f', fillOpacity: 0.85 })
        .bindPopup(`<a href="/admin/${props.resource}/${p.id}" style="font-weight:600">${title}</a><br><span style="color:#78716c">${where}</span><br>${money(p.price)}`)
        .addTo(markers)
    }
    markers.addTo(map.value)
    drawGeo()
    // Encuadre: la zona buscada si la hay; si no, los resultados (sólo la primera vez, para no pelear con quien mueve el mapa).
    if (geoLayer && 'getBounds' in geoLayer) {
      if (!fittedOnce) map.value.fitBounds((geoLayer as L.Rectangle).getBounds(), { padding: [20, 20] })
    } else if (pts.length && !fittedOnce) {
      map.value.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 15 })
    }
    fittedOnce = true
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo cargar el mapa'
  } finally {
    loading.value = false
  }
}

function searchArea() {
  if (!map.value) return
  const b = map.value.getBounds()
  const round = (n: number) => Math.round(n * 1e5) / 1e5
  emit('search-area', {
    north: round(Math.min(90, b.getNorth())),
    south: round(Math.max(-90, b.getSouth())),
    east: round(Math.min(180, b.getEast())),
    west: round(Math.max(-180, b.getWest())),
  })
}

onMapReady(() => {
  if (!map.value) return
  createTileLayer('light').addTo(map.value)
  map.value.on('click', (e: L.LeafletMouseEvent) => {
    if (!pickingCenter.value) return
    pickingCenter.value = false
    const r = Number(radiusKm.value)
    emit('search-radius', { lat: Math.round(e.latlng.lat * 1e6) / 1e6, lng: Math.round(e.latlng.lng * 1e6) / 1e6, radiusKm: r > 0 && r <= 500 ? r : 5 })
  })
  load()
})

// Cualquier cambio de filtro (incluida la zona) vuelve a pedir los puntos.
watch(
  () => JSON.stringify(props.filters),
  () => {
    if (props.filters.radiusKm) radiusKm.value = Number(props.filters.radiusKm)
    // Con una zona nueva, el mapa se encuadra en ella; con otro filtro, se queda donde está.
    if (hasGeo.value) fittedOnce = false
    load()
  },
)
</script>
