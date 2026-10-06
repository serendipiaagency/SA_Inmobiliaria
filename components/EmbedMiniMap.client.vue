<template>
  <div ref="el" class="h-full w-full" />
</template>

<script setup lang="ts">
import L from 'leaflet'
import { useLeafletMap, createTileLayer } from '~/composables/useLeafletMap'
import { withValidCoords } from '~/utils/maps/coords'
import { formatDisplayPrice } from '~/utils/currency'

/** `baseCurrency`: la de la agencia, en la que están los precios; `currency`: la que se enseña (utils/currency.ts). */
const props = defineProps<{ items: any[]; accent?: string; dark?: boolean; origin?: string; currency?: string; baseCurrency?: string }>()

function priceShort(v: number) {
  return formatDisplayPrice(v || 0, props.baseCurrency, props.currency || props.baseCurrency, { compact: true })
}

const FALLBACK_CENTER: [number, number] = [25.15, 55.25]
const el = ref<HTMLElement | null>(null)
const pts = withValidCoords(props.items)
const initialCenter: [number, number] = pts.length ? [pts[0].lat, pts[0].lng] : FALLBACK_CENTER
const { map, onMapReady } = useLeafletMap(el, { zoomControl: true, scrollWheelZoom: false, center: initialCenter, zoom: 12 })

onMapReady(() => {
  if (!map.value) return
  createTileLayer(props.dark ? 'dark' : 'light').addTo(map.value)

  const accent = props.accent || '#16150f'
  const bounds: [number, number][] = []
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
      `<div style="width:170px;font-family:Inter,sans-serif"><a href="${props.origin || ''}/propiedades/${p.slug || p.id}" target="_blank" rel="noopener" style="font-weight:600;color:#16150f;text-decoration:none">${p.name}</a>` +
        `<div style="color:#78716c;font-size:12px">${p.community || ''}</div>` +
        `<div style="font-weight:700;margin-top:3px;color:${accent}">${priceShort(p.price)}</div></div>`,
    )
    m.addTo(map.value)
    bounds.push([p.lat, p.lng])
  }
  if (bounds.length > 1) map.value.fitBounds(bounds, { padding: [40, 40] })
})
</script>
