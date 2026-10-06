<template>
  <div class="relative h-full w-full">
    <div v-if="!ready" class="skeleton absolute inset-0 z-[400]" />
    <div ref="el" class="h-full w-full" />

    <!-- Buscar en la zona visible (FASE 2): quien usa el mapa decide qué hacer con la caja. -->
    <button
      v-if="searchArea"
      type="button"
      class="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full border border-line bg-white/95 px-4 py-2 text-[12px] font-semibold text-ink shadow-xl backdrop-blur hover:bg-ink hover:text-white"
      data-testid="map-search-area"
      @click="emitArea"
    >
      {{ t('map.searchArea', 'Buscar en esta zona') }}
    </button>

    <!-- Buscar cerca de aquí (FASE 2): un radio alrededor del centro del mapa
         o, si el navegador lo permite, de la ubicación del visitante. Quien
         usa el mapa decide qué hacer con el punto (lo pone en la URL). -->
    <div
      v-if="nearby"
      class="absolute bottom-20 left-3 z-[500] flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-2xl border border-line bg-white/95 p-2 shadow-xl backdrop-blur lg:bottom-4"
      data-testid="map-nearby"
    >
      <label class="sr-only" for="map-nearby-radius">{{ t('filters.nearbyRadius', 'Radio') }}</label>
      <select id="map-nearby-radius" v-model.number="nearbyRadius" class="rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] font-semibold text-ink" data-testid="map-nearby-radius">
        <option v-for="km in NEARBY_RADIUS_OPTIONS" :key="km" :value="km">{{ km }} km</option>
      </select>
      <button type="button" class="rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-black" data-testid="map-search-nearby" @click="searchNearby('center')">
        {{ t('map.searchNearby', 'Buscar cerca de aquí') }}
      </button>
      <button v-if="canLocate" type="button" class="rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-ink hover:border-ink disabled:opacity-50" :disabled="locating" data-testid="map-nearby-locate" @click="searchNearby('me')">
        {{ locating ? t('map.nearbyLocating', 'Buscando tu ubicación…') : t('map.nearbyMyLocation', 'Mi ubicación') }}
      </button>
      <p v-if="nearbyNotice" class="w-full text-[11px] text-stone-500" data-testid="map-nearby-notice">{{ nearbyNotice }}</p>
    </div>

    <!-- Layer / POI controls -->
    <div class="absolute right-3 top-3 z-[500] w-52 rounded-2xl border border-line bg-white/95 p-3 shadow-xl backdrop-blur">
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">{{ t('map.layers.title', 'Vista') }}</p>
      <div class="mb-3 grid grid-cols-3 gap-1">
        <button v-for="b in baseOptions" :key="b.key" class="lbtn" :class="{ 'lbtn-on': base === b.key }" @click="setBase(b.key)">{{ b.label }}</button>
      </div>
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">{{ t('map.poi.title', 'Cerca') }}</p>
      <label v-for="p in poiTypes" :key="p.key" class="flex cursor-pointer items-center gap-2 py-1 text-[13px]">
        <input v-model="poiOn[p.key]" type="checkbox" class="accent-ink" @change="renderPois" >
        <span class="inline-block h-2.5 w-2.5 rounded-full" :style="{ background: p.color }" />
        {{ p.label }}
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import L from 'leaflet'
import 'leaflet.markercluster'
// leaflet/dist/leaflet.css ya viaja con useLeafletMap.ts (mismo motivo: sólo
// se resuelve para un `.client.vue`). Las de markercluster sí son propias
// de este componente, el único que las usa.
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { useLeafletMap, createTileLayer, type TileKey } from '~/composables/useLeafletMap'
import { withValidCoords } from '~/utils/maps/coords'
import { DEFAULT_NEARBY_RADIUS_KM, NEARBY_RADIUS_OPTIONS, roundSearchCoord } from '~/utils/publicSearch'

const { t } = useI18n()
const props = withDefaults(
  defineProps<{
    items: any[]
    activeId?: number | null
    fitToItems?: boolean
    searchArea?: boolean
    /** Enseña «Buscar cerca de aquí» (radio). */
    nearby?: boolean
    /** El radio activo, para dibujarlo. */
    nearbyCircle?: { lat: number; lng: number; radiusKm: number } | null
  }>(),
  { activeId: null, fitToItems: true, searchArea: false, nearby: false, nearbyCircle: null },
)
const emit = defineEmits<{
  'marker-click': [number]
  'marker-hover': [number | null]
  'search-area': [bounds: { north: number; south: number; east: number; west: number }]
  'search-nearby': [point: { lat: number; lng: number; radiusKm: number }]
}>()

// --- Buscar cerca de aquí ---------------------------------------------------
// «Mi ubicación» usa la geolocalización del navegador, que la cabecera
// Permissions-Policy abre sólo para el propio origen en la web pública
// (server/utils/permissionsPolicy.ts). Si el visitante la niega o no está
// disponible, se busca desde el centro del mapa y se dice. La posición sale
// redondeada a ~110 m (roundSearchCoord).
const nearbyRadius = ref<number>(props.nearbyCircle?.radiusKm || DEFAULT_NEARBY_RADIUS_KM)
const canLocate = ref(false)
const locating = ref(false)
const nearbyNotice = ref('')
function emitNearby(lat: number, lng: number) {
  emit('search-nearby', { lat: roundSearchCoord(lat), lng: roundSearchCoord(lng), radiusKm: nearbyRadius.value })
}
function searchNearby(from: 'center' | 'me') {
  if (!map.value) return
  nearbyNotice.value = ''
  const c = map.value.getCenter()
  if (from === 'center' || !canLocate.value) return emitNearby(c.lat, c.lng)
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      map.value?.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.value.getZoom(), 13))
      emitNearby(pos.coords.latitude, pos.coords.longitude)
    },
    () => {
      locating.value = false
      nearbyNotice.value = t('map.nearbyDenied', 'No se pudo usar tu ubicación: se busca desde el centro del mapa.')
      emitNearby(c.lat, c.lng)
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
  )
}

let nearbyLayer: L.Circle | null = null
function drawNearby() {
  if (!map.value) return
  if (nearbyLayer) {
    map.value.removeLayer(nearbyLayer)
    nearbyLayer = null
  }
  const c = props.nearbyCircle
  if (!c) return
  nearbyLayer = L.circle([c.lat, c.lng], { radius: c.radiusKm * 1000, color: '#16150f', weight: 1.5, fillOpacity: 0.06, interactive: false }).addTo(map.value)
}
watch(() => props.nearbyCircle, drawNearby, { deep: true })
// El desplegable sigue al radio de la URL sólo cuando ÉSTE cambia: dibujar el
// círculo al terminar de cargar el mapa no puede pisar el radio que el
// visitante ya haya elegido mientras cargaba.
watch(
  () => props.nearbyCircle?.radiusKm,
  (r) => {
    if (r) nearbyRadius.value = r
  },
)

/** La zona visible, redondeada (5 decimales ≈ 1 m: de sobra para una búsqueda). */
function emitArea() {
  if (!map.value) return
  const b = map.value.getBounds()
  const r = (n: number) => Math.round(n * 1e5) / 1e5
  emit('search-area', { north: r(Math.min(90, b.getNorth())), south: r(Math.max(-90, b.getSouth())), east: r(Math.min(180, b.getEast())), west: r(Math.max(-180, b.getWest())) })
}

// Centra sólo la vista inicial cuando todavía no hay ningún punto que
// mostrar — nunca marca una propiedad ahí. Dubái, el mercado principal de
// este portal; ver LocationPicker.client.vue para el equivalente de admin
// (Madrid), un valor de negocio distinto a propósito, no una inconsistencia.
const FALLBACK_CENTER: [number, number] = [25.15, 55.25]
const INITIAL_ZOOM = 12

const el = ref<HTMLElement | null>(null)
const ready = ref(false)

const initialPts = withValidCoords(props.items)
const initialCenter: [number, number] = initialPts.length ? [initialPts[0].lat, initialPts[0].lng] : FALLBACK_CENTER
const { map, onMapReady } = useLeafletMap(el, { zoomControl: true, scrollWheelZoom: true, center: initialCenter, zoom: INITIAL_ZOOM })

let cluster: any = null
let baseLayers: Partial<Record<TileKey, L.TileLayer>> = {}
const markers = new Map<number, any>()
let poiGroup: L.LayerGroup | null = null

const base = ref<TileKey>('light')
const baseOptions = computed(() => [
  { key: 'light' as const, label: t('map.layers.standard', 'Plano') },
  { key: 'satellite' as const, label: t('map.layers.satellite', 'Satélite') },
  { key: 'dark' as const, label: t('map.layers.dark', 'Oscuro') },
])
const poiTypes = computed(() => [
  { key: 'transporte', label: t('map.poi.transport', 'Transporte'), color: '#2563eb' },
  { key: 'colegios', label: t('map.poi.schools', 'Colegios'), color: '#16a34a' },
  { key: 'hospitales', label: t('map.poi.hospitals', 'Hospitales'), color: '#dc2626' },
  { key: 'super', label: t('map.poi.supermarkets', 'Supermercados'), color: '#d97706' },
  { key: 'playas', label: t('map.poi.beaches', 'Playas'), color: '#0891b2' },
])
const poiOn = reactive<Record<string, boolean>>({ transporte: false, colegios: false, hospitales: false, super: false, playas: false })

// Precios en la moneda base de la agencia, convertidos a la que eligió el
// visitante (utils/currency.ts) — antes «AED» fijo.
const { format: formatPrice, compact: priceShort } = useCurrency()

function setBase(key: TileKey) {
  if (!map.value) return
  for (const layer of Object.values(baseLayers)) if (layer) map.value.removeLayer(layer)
  base.value = key
  baseLayers[key]?.addTo(map.value)
}

function makeIcon(p: any, active = false) {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin${active ? ' map-pin-active' : ''}">${p.price ? priceShort(p.price) : '—'}</div>`,
    iconSize: [64, 28],
    iconAnchor: [32, 28],
  })
}

let poiFetchTimer: any = null
let poiFetchSeq = 0

// Real amenities near the current viewport, fetched live from OpenStreetMap
// (Overpass API) — never a fabricated position or walking time. Debounced
// so panning/zooming doesn't hammer the API.
function renderPois() {
  clearTimeout(poiFetchTimer)
  poiFetchTimer = setTimeout(fetchAndRenderPois, 350)
}

async function fetchAndRenderPois() {
  if (!map.value || !poiGroup) return
  const active = poiTypes.value.filter((pt) => poiOn[pt.key])
  if (!active.length) {
    poiGroup.clearLayers()
    return
  }
  const b = map.value.getBounds()
  const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(',')
  const seq = ++poiFetchSeq
  let pois: any[] = []
  try {
    const res: any = await $fetch('/api/public/pois', { query: { bbox, types: active.map((pt) => pt.key).join(',') } })
    pois = res.pois || []
  } catch {
    pois = []
  }
  if (seq !== poiFetchSeq) return // a newer request already superseded this one
  poiGroup.clearLayers()
  for (const poi of pois) {
    const poiType = poiTypes.value.find((pt) => pt.key === poi.type)
    if (!poiType) continue
    const m = L.marker([poi.lat, poi.lng], {
      icon: L.divIcon({ className: '', html: `<span class="poi-dot" style="background:${poiType.color}"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] }),
    }).bindPopup(`<b>${poi.name}</b><br><span style="color:#78716c">${poiType.label}</span>`)
    poiGroup.addLayer(m)
  }
}

/**
 * (Re)construye marcadores y bounds desde `props.items`. Antes esto sólo se
 * ejecutaba una vez dentro de onMounted: cambiar los filtros de /mapa
 * actualizaba la lista lateral pero el mapa se quedaba con los marcadores
 * del primer render — corregido llamando a esta misma función también desde
 * un watcher sobre `props.items`, así que la lista y el mapa nunca pueden
 * divergir.
 */
function buildMarkers() {
  if (!map.value || !cluster) return
  cluster.clearLayers()
  markers.clear()
  const pts = withValidCoords(props.items)
  const bounds: [number, number][] = []
  for (const p of pts) {
    const m = L.marker([p.lat, p.lng], { icon: makeIcon(p) })
    const sv = `https://www.google.com/maps?q=&layer=c&cbll=${p.lat},${p.lng}`
    const href = `/propiedades/${p.slug || p.id}`
    const cover = p.coverImage ? mediaUrl(p.coverImage) : null
    m.bindPopup(
      `<div class="map-card">` +
        (cover ? `<a href="${href}"><img src="${cover}" class="map-card-img" /></a>` : '') +
        `<div class="map-card-body">` +
        `<a href="${href}" class="map-card-name">${p.name}</a>` +
        `<p class="map-card-loc">${p.community || ''}</p>` +
        `<p class="map-card-price">${formatPrice(p.price || 0)}</p>` +
        `<div class="map-card-links">` +
        `<a href="${href}">${t('map.popup.viewDetails', 'Ver ficha')}</a>` +
        `<a href="${sv}" target="_blank" rel="noopener">${t('map.popup.streetView', 'Street View')}</a></div></div></div>`,
      { className: 'map-popup', maxWidth: 220 },
    )
    m.on('click', () => emit('marker-click', p.id))
    m.on('mouseover', () => emit('marker-hover', p.id))
    m.on('mouseout', () => emit('marker-hover', null))
    markers.set(p.id, m)
    cluster.addLayer(m)
    bounds.push([p.lat, p.lng])
  }
  // Tras «Buscar en esta zona» el mapa se queda donde lo dejó quien buscaba (fitToItems=false).
  if (props.fitToItems && bounds.length > 1) map.value.fitBounds(bounds, { padding: [60, 60] })
}

onMapReady(() => {
  if (!map.value) return
  baseLayers = { light: createTileLayer('light'), satellite: createTileLayer('satellite'), dark: createTileLayer('dark') }
  baseLayers.light!.addTo(map.value)
  baseLayers.light!.once('load', () => (ready.value = true))
  setTimeout(() => (ready.value = true), 4000)
  poiGroup = L.layerGroup().addTo(map.value)
  map.value.on('moveend', renderPois)

  cluster = (L as any).markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 })
  map.value.addLayer(cluster)
  buildMarkers()
  canLocate.value = typeof navigator !== 'undefined' && 'geolocation' in navigator
  drawNearby()
  // Al abrir el mapa con un radio en la URL (enlace, búsqueda guardada), se ve el círculo entero.
  if (nearbyLayer && !props.fitToItems) map.value.fitBounds(nearbyLayer.getBounds(), { padding: [40, 40] })
})

watch(() => props.items, buildMarkers)

watch(
  () => props.activeId,
  (id, prev) => {
    if (prev && markers.has(prev)) markers.get(prev).setIcon(makeIcon(props.items.find((i) => i.id === prev), false))
    if (id && markers.has(id)) {
      const p = props.items.find((i) => i.id === id)
      markers.get(id).setIcon(makeIcon(p, true))
      if (map.value) {
        cluster.zoomToShowLayer(markers.get(id), () => markers.get(id).openPopup())
      }
    }
  },
)
</script>

<style scoped>
.lbtn {
  border: 1px solid #e7e4de;
  border-radius: 0.5rem;
  padding: 0.35rem 0;
  font-size: 11px;
  font-weight: 600;
  color: #57534e;
  transition: all 0.15s;
}
.lbtn:hover {
  border-color: #16150f;
}
.lbtn-on {
  background: #16150f;
  border-color: #16150f;
  color: #fff;
}
</style>

<style>
.map-pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #16150f;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 9999px;
  padding: 3px 9px;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  white-space: nowrap;
  transition: all 0.15s;
}
.map-pin-active,
.map-pin:hover {
  background: #16150f;
  color: #fff;
  transform: scale(1.08);
  z-index: 1000;
}
.poi-dot {
  display: block;
  height: 14px;
  width: 14px;
  border-radius: 9999px;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.leaflet-container {
  font-family: 'Inter', sans-serif;
}

.map-popup .leaflet-popup-content-wrapper {
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.35);
}
.map-popup .leaflet-popup-content {
  margin: 0;
  width: 200px !important;
}
.map-popup .leaflet-popup-tip {
  background: #fff;
}
.map-card-img {
  display: block;
  height: 96px;
  width: 100%;
  object-fit: cover;
}
.map-card-body {
  padding: 12px 14px 14px;
}
.map-popup .map-card-name {
  display: block;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #16150f;
}
.map-popup .map-card-name:hover {
  text-decoration: underline;
}
.map-card-loc {
  margin-top: 1px;
  font-size: 12px;
  color: #78716c;
}
.map-card-price {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #16150f;
}
.map-card-links {
  margin-top: 8px;
  display: flex;
  gap: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.map-card-links a:first-child {
  color: #16150f;
  text-decoration: underline;
}
.map-card-links a:last-child {
  color: #2563eb;
}
</style>
