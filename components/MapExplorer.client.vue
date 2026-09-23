<template>
  <div class="relative h-full w-full">
    <div v-if="!ready" class="skeleton absolute inset-0 z-[400]" />
    <div ref="el" class="h-full w-full" />

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

const { t } = useI18n()
const props = defineProps<{ items: any[]; activeId?: number | null }>()
const emit = defineEmits<{ 'marker-click': [number]; 'marker-hover': [number | null] }>()

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
const { map } = useLeafletMap(el, { zoomControl: true, scrollWheelZoom: true, center: initialCenter, zoom: INITIAL_ZOOM })

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

function priceShort(v: number) {
  if (!v) return '—'
  if (v >= 1e6) return `${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)}M`
  return `${Math.round(v / 1000)}k`
}

function setBase(key: TileKey) {
  if (!map.value) return
  for (const layer of Object.values(baseLayers)) if (layer) map.value.removeLayer(layer)
  base.value = key
  baseLayers[key]?.addTo(map.value)
}

function makeIcon(p: any, active = false) {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin${active ? ' map-pin-active' : ''}">AED ${priceShort(p.price)}</div>`,
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
        `<p class="map-card-price">AED ${new Intl.NumberFormat('en-US').format(p.price || 0)}</p>` +
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
  if (bounds.length > 1) map.value.fitBounds(bounds, { padding: [60, 60] })
}

onMounted(() => {
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
