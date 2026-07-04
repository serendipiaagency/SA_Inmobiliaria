<template>
  <div ref="root" class="sa-embed" :class="dark ? 'sa-dark' : ''" :style="rootStyle">
    <!-- Header (optional) -->
    <div v-if="showHeader" class="sa-head">
      <span class="sa-head-title">{{ headingText }}</span>
      <a :href="`${origin}/properties`" target="_blank" rel="noopener" class="sa-head-link">{{ moreLabel }} →</a>
    </div>

    <!-- Map layout -->
    <div v-if="layout === 'map'" class="sa-map-wrap">
      <ClientOnly>
        <EmbedMiniMap :items="rows" :accent="accent" :dark="dark" :origin="origin" :currency="currency" />
        <template #fallback><div class="sa-map-fallback">Cargando mapa…</div></template>
      </ClientOnly>
    </div>

    <!-- Carousel layout -->
    <div v-else-if="layout === 'carousel'" class="sa-carousel">
      <a v-for="p in rows" :key="p.id" :href="link(p)" target="_blank" rel="noopener" class="sa-card sa-card-carousel">
        <div class="sa-media"><img :src="img(p.photos && p.photos[0])" :alt="p.name" loading="lazy" /><span v-if="badge(p)" class="sa-badge">{{ badge(p) }}</span></div>
        <div class="sa-body">
          <p class="sa-price">{{ money(p.price) }}</p>
          <h4 class="sa-name">{{ p.name }}</h4>
          <p class="sa-sub">{{ p.community }}</p>
          <p class="sa-meta">{{ metaText(p) }}</p>
        </div>
      </a>
    </div>

    <!-- List layout -->
    <div v-else-if="layout === 'list'" class="sa-list">
      <a v-for="p in rows" :key="p.id" :href="link(p)" target="_blank" rel="noopener" class="sa-card sa-card-list">
        <div class="sa-media sa-media-list"><img :src="img(p.photos && p.photos[0])" :alt="p.name" loading="lazy" /></div>
        <div class="sa-body">
          <div class="sa-row"><h4 class="sa-name">{{ p.name }}</h4><span class="sa-price">{{ money(p.price) }}</span></div>
          <p class="sa-sub">{{ p.community }}</p>
          <p class="sa-meta">{{ metaText(p) }}</p>
        </div>
      </a>
    </div>

    <!-- Grid layout (default) -->
    <div v-else class="sa-grid" :style="{ '--cols': cols }">
      <a v-for="p in rows" :key="p.id" :href="link(p)" target="_blank" rel="noopener" class="sa-card">
        <div class="sa-media"><img :src="img(p.photos && p.photos[0])" :alt="p.name" loading="lazy" /><span v-if="badge(p)" class="sa-badge">{{ badge(p) }}</span></div>
        <div class="sa-body">
          <p class="sa-price">{{ money(p.price) }}</p>
          <h4 class="sa-name">{{ p.name }}</h4>
          <p class="sa-sub">{{ p.community }}</p>
          <p class="sa-meta">{{ metaText(p) }}</p>
        </div>
      </a>
    </div>

    <a v-if="showBranding" :href="origin" target="_blank" rel="noopener" class="sa-brand">SA Inmobiliaria</a>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'SA Inmobiliaria — Widget' })

const route = useRoute()
const q = route.query

const layout = String(q.widget || q.layout || 'grid')
const filter = String(q.filter || 'all')
const city = String(q.city || '')
const limit = Math.min(24, Math.max(1, parseInt(String(q.limit || '6'), 10) || 6))
const dark = String(q.theme || '') === 'dark'
const accent = sanitizeColor(String(q.accent || '')) || (dark ? '#e9c46a' : '#16150f')
const font = String(q.font || 'sans') === 'serif' ? "'Playfair Display', Georgia, serif" : "'Inter', system-ui, sans-serif"
const radius = Math.min(28, Math.max(0, parseInt(String(q.radius || '16'), 10) || 16))
const cols = Math.min(4, Math.max(1, parseInt(String(q.cols || '3'), 10) || 3))
const currency = (String(q.currency || 'AED') || 'AED').toUpperCase()
const showHeader = String(q.header || '1') !== '0'
const showBranding = String(q.branding || '1') !== '0'

const origin = ref('')
const root = ref<HTMLElement | null>(null)

const { data } = await useFetch<any>('/api/widget/properties', { query: { filter, city, limit } })
const rows = computed<any[]>(() => data.value?.rows || [])

const RATES: Record<string, { r: number; s: string }> = {
  AED: { r: 1, s: 'AED ' }, USD: { r: 0.2723, s: '$' }, EUR: { r: 0.2532, s: '€' }, GBP: { r: 0.2151, s: '£' }, CNY: { r: 1.962, s: '¥' },
}
function money(v: number | null | undefined) {
  if (v == null) return '—'
  const c = RATES[currency] || RATES.AED
  return `${c.s}${new Intl.NumberFormat('en-US').format(Math.round(v * c.r))}`
}
function img(src: string | null | undefined) {
  if (!src) return `${origin.value}/placeholder.svg`
  if (src.startsWith('http') || src.startsWith('data:')) return src
  return `${origin.value}${src.startsWith('/') ? '' : '/api/media/'}${src}`
}
function link(p: any) {
  return `${origin.value}/property-details/${p.slug || p.id}`
}
function metaText(p: any) {
  const parts: string[] = []
  if (p.bedrooms != null) parts.push(`${p.bedrooms || 'Estudio'}${p.bedrooms ? ' hab' : ''}`)
  if (p.bathrooms != null) parts.push(`${p.bathrooms} baños`)
  if (p.area) parts.push(`${Math.round(p.area)} m²`)
  return parts.join(' · ')
}
function badge(p: any) {
  if (p.priceOld && p.price && p.priceOld > p.price) return `−${Math.round(((p.priceOld - p.price) / p.priceOld) * 100)}%`
  if (p.isExclusive) return 'Exclusiva'
  if (p.status === 'new') return 'Obra Nueva'
  return ''
}
const headingText = computed(() => {
  const map: Record<string, string> = { featured: 'Destacadas', latest: 'Últimas incorporaciones', luxury: 'Selección Luxury', promo: 'Promociones', new: 'Obra Nueva', all: 'Propiedades' }
  return map[filter] || 'Propiedades'
})
const moreLabel = 'Ver todas'

function sanitizeColor(v: string) {
  return /^#?[0-9a-fA-F]{3,8}$/.test(v) ? (v.startsWith('#') ? v : `#${v}`) : ''
}

const rootStyle = computed(() => ({
  '--accent': accent,
  '--radius': `${radius}px`,
  fontFamily: font,
}))

function postHeight() {
  if (!root.value) return
  const h = Math.ceil(root.value.getBoundingClientRect().height)
  window.parent?.postMessage({ type: 'sa-embed-height', height: h, id: String(route.query.id || '') }, '*')
}
onMounted(() => {
  origin.value = window.location.origin
  nextTick(postHeight)
  setTimeout(postHeight, 400)
  setTimeout(postHeight, 1200)
  const ro = new ResizeObserver(postHeight)
  if (root.value) ro.observe(root.value)
  window.addEventListener('load', postHeight)
})
</script>

<style scoped>
.sa-embed {
  --bg: #ffffff;
  --fg: #16150f;
  --muted: #78716c;
  --line: #e7e4de;
  --card: #ffffff;
  background: var(--bg);
  color: var(--fg);
  padding: 14px;
  box-sizing: border-box;
  width: 100%;
}
.sa-dark {
  --bg: #0f0f0d;
  --fg: #f5f4f0;
  --muted: #a8a29e;
  --line: #26251f;
  --card: #17160f;
}
* { box-sizing: border-box; }
.sa-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
.sa-head-title { font-size: 18px; font-weight: 600; }
.sa-head-link { font-size: 12px; font-weight: 600; color: var(--accent); text-decoration: none; }
.sa-grid { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); gap: 14px; }
@media (max-width: 720px) { .sa-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 460px) { .sa-grid { grid-template-columns: 1fr; } }
.sa-carousel { display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 8px; }
.sa-card-carousel { flex: 0 0 260px; scroll-snap-align: start; }
.sa-list { display: flex; flex-direction: column; gap: 10px; }
.sa-card { display: block; text-decoration: none; color: inherit; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; transition: transform .25s ease, box-shadow .25s ease; }
.sa-card:hover { transform: translateY(-3px); box-shadow: 0 16px 34px -18px rgba(0,0,0,.4); }
.sa-card-list { display: flex; align-items: stretch; }
.sa-media { position: relative; aspect-ratio: 4/3; overflow: hidden; background: var(--line); }
.sa-media-list { flex: 0 0 128px; aspect-ratio: 1/1; }
.sa-media img { width: 100%; height: 100%; object-fit: cover; transition: transform .6s ease; }
.sa-card:hover .sa-media img { transform: scale(1.05); }
.sa-badge { position: absolute; top: 8px; left: 8px; background: var(--accent); color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; }
.sa-body { padding: 12px 13px; }
.sa-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.sa-price { font-size: 16px; font-weight: 700; color: var(--accent); margin: 0; }
.sa-name { font-size: 14px; font-weight: 600; margin: 3px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sa-sub { font-size: 12px; color: var(--muted); margin: 2px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sa-meta { font-size: 11px; color: var(--muted); margin: 6px 0 0; }
.sa-map-wrap { height: 420px; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--line); }
.sa-map-fallback { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted); font-size: 13px; }
.sa-brand { display: inline-block; margin-top: 12px; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); text-decoration: none; }
</style>
