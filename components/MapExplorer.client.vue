<template>
  <div class="relative h-full w-full">
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

function renderPois() {
  if (!map) return
  poiGroup.clearLayers()
  const pts = props.items.filter((i) => i.lat && i.lng)
  if (!pts.length) return
  const c = pts[0]
  for (const t of poiTypes) {
    if (!poiOn[t.key]) continue
    for (let k = 0; k < 3; k++) {
      const seed = (c.id * 7 + k * 13 + t.key.length) % 20
      const lat = c.lat + (seed - 10) * 0.0016 + (t.key.length % 3) * 0.001
      const lng = c.lng + (k - 1) * 0.0021 + (seed - 10) * 0.0012
      const walk = 4 + ((seed + k) % 12)
      const m = L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: `<span class="poi-dot" style="background:${t.color}"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] }),
      }).bindPopup(`<b>${t.label}</b><br>🚶 ${walk} min · 🚗 ${Math.max(2, Math.round(walk / 3))} min`)
      poiGroup.addLayer(m)
    }
  }
}

onMounted(async () => {
  await nextTick()
  const pts = props.items.filter((i) => i.lat && i.lng)
  const center = pts.length ? [pts[0].lat, pts[0].lng] : [25.15, 55.25]
  map = L.map(el.value as HTMLElement, { zoomControl: true, scrollWheelZoom: true }).setView(center as any, 12)
  baseLayers = { plano: tile('plano'), satelite: tile('satelite'), oscuro: tile('oscuro') }
  baseLayers.plano.addTo(map)
  poiGroup = L.layerGroup().addTo(map)

  cluster = (L as any).markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 })
  const bounds: any[] = []
  for (const p of pts) {
    const m = L.marker([p.lat, p.lng], { icon: makeIcon(p) })
    const sv = `https://www.google.com/maps?q=&layer=c&cbll=${p.lat},${p.lng}`
    m.bindPopup(
      `<div style="width:190px"><a href="/property-details/${p.slug || p.id}" style="font-weight:600;color:#16150f">${p.name}</a>` +
        `<div style="color:#78716c;font-size:12px">${p.community || ''}</div>` +
        `<div style="font-weight:600;margin-top:4px">AED ${new Intl.NumberFormat('en-US').format(p.price || 0)}</div>` +
        `<div style="margin-top:6px;display:flex;gap:8px;font-size:12px">` +
        `<a href="/property-details/${p.slug || p.id}" style="color:#16150f;text-decoration:underline">Ver ficha</a>` +
        `<a href="${sv}" target="_blank" rel="noopener" style="color:#2563eb">Street View</a></div></div>`,
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
</style>
