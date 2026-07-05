<template>
  <div class="relative h-full w-full">
    <div v-if="!ready" class="skeleton absolute inset-0 z-[400]" />
    <div ref="el" class="h-full w-full" />

    <!-- Layer / POI controls -->
    <div class="absolute right-3 top-3 z-[500] w-52 rounded-2xl border border-line bg-white/95 p-3 shadow-xl backdrop-blur">
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Vista</p>
      <div class="mb-3 grid grid-cols-3 gap-1">
        <button v-for="b in baseOptions" :key="b.key" class="lbtn" :class="{ 'lbtn-on': base === b.key }" @click="setBase(b.key)">{{ b.label }}</button>
      </div>
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Cerca</p>
      <label v-for="p in poiTypes" :key="p.key" class="flex cursor-pointer items-center gap-2 py-1 text-[13px]">
        <input type="checkbox" v-model="poiOn[p.key]" class="accent-ink" @change="renderPois" />
        <span class="inline-block h-2.5 w-2.5 rounded-full" :style="{ background: p.color }" />
        {{ p.label }}
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import L from 'leaflet'
import 'leaflet.markercluster'

const props = defineProps<{ items: any[]; activeId?: number | null }>()
const emit = defineEmits<{ 'marker-click': [number]; 'marker-hover': [number | null] }>()

const el = ref<HTMLElement | null>(null)
const ready = ref(false)
let map: any = null
let cluster: any = null
let baseLayers: Record<string, any> = {}
const markers: Record<number, any> = {}
let poiGroup: any = null

const base = ref('plano')
const baseOptions = [
  { key: 'plano', label: 'Plano' },
  { key: 'satelite', label: 'Satélite' },
  { key: 'oscuro', label: 'Oscuro' },
]
const poiTypes = [
  { key: 'transporte', label: 'Transporte', color: '#2563eb' },
  { key: 'colegios', label: 'Colegios', color: '#16a34a' },
  { key: 'hospitales', label: 'Hospitales', color: '#dc2626' },
  { key: 'super', label: 'Supermercados', color: '#d97706' },
  { key: 'playas', label: 'Playas', color: '#0891b2' },
]
const poiOn = reactive<Record<string, boolean>>({ transporte: false, colegios: false, hospitales: false, super: false, playas: false })

function tile(key: string) {
  if (key === 'satelite')
    return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' })
  if (key === 'oscuro')
    return L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: '© OSM · CARTO' })
  return L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: '© OSM · CARTO' })
}

function priceShort(v: number) {
  if (!v) return '—'
  if (v >= 1e6) return `${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)}M`
  return `${Math.round(v / 1000)}k`
}

function setBase(key: string) {
  if (!map) return
  Object.values(baseLayers).forEach((l: any) => map.removeLayer(l))
  base.value = key
  baseLayers[key].addTo(map)
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
  if (!map) return
  const active = poiTypes.filter((t) => poiOn[t.key])
  if (!active.length) {
    poiGroup.clearLayers()
    return
  }
  const b = map.getBounds()
  const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(',')
  const seq = ++poiFetchSeq
  let pois: any[] = []
  try {
    const res: any = await $fetch('/api/public/pois', { query: { bbox, types: active.map((t) => t.key).join(',') } })
    pois = res.pois || []
  } catch {
    pois = []
  }
  if (seq !== poiFetchSeq) return // a newer request already superseded this one
  poiGroup.clearLayers()
  for (const poi of pois) {
    const t = poiTypes.find((pt) => pt.key === poi.type)
    if (!t) continue
    const m = L.marker([poi.lat, poi.lng], {
      icon: L.divIcon({ className: '', html: `<span class="poi-dot" style="background:${t.color}"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] }),
    }).bindPopup(`<b>${poi.name}</b><br><span style="color:#78716c">${t.label}</span>`)
    poiGroup.addLayer(m)
  }
}

onMounted(async () => {
  await nextTick()
  const pts = props.items.filter((i) => i.lat && i.lng)
  const center = pts.length ? [pts[0].lat, pts[0].lng] : [25.15, 55.25]
  map = L.map(el.value as HTMLElement, { zoomControl: true, scrollWheelZoom: true }).setView(center as any, 12)
  baseLayers = { plano: tile('plano'), satelite: tile('satelite'), oscuro: tile('oscuro') }
  baseLayers.plano.addTo(map)
  baseLayers.plano.once('load', () => (ready.value = true))
  setTimeout(() => (ready.value = true), 4000)
  poiGroup = L.layerGroup().addTo(map)
  map.on('moveend', renderPois)

  cluster = (L as any).markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 })
  const bounds: any[] = []
  for (const p of pts) {
    const m = L.marker([p.lat, p.lng], { icon: makeIcon(p) })
    const sv = `https://www.google.com/maps?q=&layer=c&cbll=${p.lat},${p.lng}`
    const href = `/property-details/${p.slug || p.id}`
    const cover = p.coverImage ? mediaUrl(p.coverImage) : null
    m.bindPopup(
      `<div class="map-card">` +
        (cover ? `<a href="${href}"><img src="${cover}" class="map-card-img" /></a>` : '') +
        `<div class="map-card-body">` +
        `<a href="${href}" class="map-card-name">${p.name}</a>` +
        `<p class="map-card-loc">${p.community || ''}</p>` +
        `<p class="map-card-price">AED ${new Intl.NumberFormat('en-US').format(p.price || 0)}</p>` +
        `<div class="map-card-links">` +
        `<a href="${href}">Ver ficha</a>` +
        `<a href="${sv}" target="_blank" rel="noopener">Street View</a></div></div></div>`,
      { className: 'map-popup', maxWidth: 220 },
    )
    m.on('click', () => emit('marker-click', p.id))
    m.on('mouseover', () => emit('marker-hover', p.id))
    m.on('mouseout', () => emit('marker-hover', null))
    markers[p.id] = m
    cluster.addLayer(m)
    bounds.push([p.lat, p.lng])
  }
  map.addLayer(cluster)
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [60, 60] })
})

watch(
  () => props.activeId,
  (id, prev) => {
    if (prev && markers[prev]) markers[prev].setIcon(makeIcon(props.items.find((i) => i.id === prev), false))
    if (id && markers[id]) {
      const p = props.items.find((i) => i.id === id)
      markers[id].setIcon(makeIcon(p, true))
      if (map) {
        cluster.zoomToShowLayer(markers[id], () => markers[id].openPopup())
      }
    }
  },
)

onBeforeUnmount(() => {
  if (map) map.remove()
})
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
  font-family: 'Playfair Display', serif;
  font-size: 15px;
  font-weight: 500;
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
