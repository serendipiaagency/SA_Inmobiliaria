<template>
  <div ref="el" class="h-full w-full" />
</template>

<script setup lang="ts">
import L from 'leaflet'

const props = defineProps<{ items: any[]; accent?: string; dark?: boolean; origin?: string; currency?: string }>()
const el = ref<HTMLElement | null>(null)
let map: any = null

const RATES: Record<string, { r: number; s: string }> = {
  AED: { r: 1, s: 'AED ' }, USD: { r: 0.2723, s: '$' }, EUR: { r: 0.2532, s: '€' }, GBP: { r: 0.2151, s: '£' }, CNY: { r: 1.962, s: '¥' },
}
function priceShort(v: number) {
  const c = RATES[(props.currency || 'AED').toUpperCase()] || RATES.AED
  const val = (v || 0) * c.r
  if (val >= 1e6) return `${c.s}${(val / 1e6).toFixed(val % 1e6 ? 1 : 0)}M`
  return `${c.s}${Math.round(val / 1000)}k`
}

onMounted(async () => {
  await nextTick()
  const pts = props.items.filter((i) => i.lat && i.lng)
  const center = pts.length ? [pts[0].lat, pts[0].lng] : [25.15, 55.25]
  map = L.map(el.value as HTMLElement, { zoomControl: true, scrollWheelZoom: false }).setView(center as any, 12)
  const url = props.dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
  L.tileLayer(url, { maxZoom: 20, attribution: '© OSM · CARTO' }).addTo(map)

  const accent = props.accent || '#16150f'
  const bounds: any[] = []
  for (const p of pts) {
    const m = L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="background:${accent};color:#fff;border-radius:999px;padding:3px 9px;font:700 12px Inter,sans-serif;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3)">${priceShort(p.price)}</div>`,
        iconSize: [56, 24],
        iconAnchor: [28, 24],
      }),
    })
    m.bindPopup(
      `<div style="width:170px;font-family:Inter,sans-serif"><a href="${props.origin || ''}/property-details/${p.slug || p.id}" target="_blank" rel="noopener" style="font-weight:600;color:#16150f;text-decoration:none">${p.name}</a>` +
        `<div style="color:#78716c;font-size:12px">${p.community || ''}</div>` +
        `<div style="font-weight:700;margin-top:3px;color:${accent}">${priceShort(p.price)}</div></div>`,
    )
    m.addTo(map)
    bounds.push([p.lat, p.lng])
  }
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] })
})
onBeforeUnmount(() => { if (map) map.remove() })
</script>
