<template>
  <div class="flex h-[calc(100vh-73px)] flex-col lg:flex-row">
    <!-- List -->
    <div v-show="view === 'list' || isDesktop" class="flex w-full flex-col border-r border-line lg:w-[42%] xl:w-[38%]">
      <div class="space-y-3 border-b border-line px-6 py-4">
        <div class="flex items-center gap-2">
          <div class="flex-1">
            <SmartSearch v-model="q" rounded :placeholder="t('search.placeholder', 'Ciudad, barrio, calle o referencia…')" @select="onSelect" @enter="applySearch" />
          </div>
          <button class="filters-btn" @click="modalOpen = true">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" d="M3 5h18M6 12h12M10 19h4" />
            </svg>
            {{ t('filters.button', 'Filtros') }}
            <span v-if="activeCount" class="badge" data-testid="map-filters-badge">{{ activeCount }}</span>
          </button>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p class="mr-auto text-sm text-stone-500"><span class="font-semibold text-ink">{{ data?.total ?? items.length }}</span> {{ t('mapa.propertiesOnMap', 'propiedades en el mapa') }}</p>
          <button v-if="hasArea" type="button" class="text-[11px] font-semibold uppercase tracking-widest text-stone-400 hover:text-ink" data-testid="map-clear-area" @click="clearArea">
            {{ t('mapa.clearArea', 'Quitar zona') }}
          </button>
          <button v-if="nearby" type="button" class="text-[11px] font-semibold uppercase tracking-widest text-stone-400 hover:text-ink" data-testid="map-clear-nearby" @click="clearNearby">
            {{ t('mapa.clearNearby', 'Quitar radio') }} ({{ nearby.radiusKm }} km)
          </button>
          <button
            v-if="activeCount || q"
            type="button"
            class="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest transition"
            :class="searchIsSaved ? 'text-ink' : 'text-stone-400 hover:text-ink'"
            data-testid="map-save-search"
            @click="onSaveSearch"
          >
            {{ searchIsSaved ? t('search.saved') : t('search.save') }}
          </button>
          <button v-if="activeCount || q" type="button" class="text-[11px] font-semibold uppercase tracking-widest text-stone-400 hover:text-ink" @click="clearAll">
            {{ t('hero.clear', 'Limpiar') }}
          </button>
        </div>
      </div>
      <div ref="listEl" class="flex-1 overflow-y-auto px-4 py-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div
            v-for="p in items"
            :key="p.id"
            :ref="(e) => setCardRef(p.id, e)"
            class="cursor-pointer rounded-2xl border transition"
            :class="active === p.id ? 'border-ink shadow-lg' : 'border-line hover:border-stone-300'"
            @mouseenter="active = p.id"
            @mouseleave="active = null"
            @click="goTo(p)"
          >
            <div class="aspect-[4/3] overflow-hidden rounded-t-2xl bg-stone-100">
              <img :src="mediaUrl(p.coverImage)" :alt="p.name" class="h-full w-full object-cover" loading="lazy" >
            </div>
            <div class="p-4">
              <p class="font-semibold">{{ formatPrice(p.price) }}</p>
              <h3 class="truncate font-serif text-lg font-medium">{{ p.name }}</h3>
              <p class="truncate text-[13px] text-stone-500">{{ p.community }}</p>
              <p class="mt-1 text-[12px] text-stone-400">
                {{ p.bedrooms || t('card.studio', 'Estudio') }}<span v-if="p.bedrooms"> {{ t('card.beds', 'hab.') }}</span> · {{ p.bathrooms }} {{ t('card.baths', 'baños') }} · {{ Math.round(p.area || 0) }} m²
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Map -->
    <div v-show="view === 'map' || isDesktop" class="relative flex-1">
      <ClientOnly>
        <MapExplorer
          :items="items"
          :active-id="active"
          :fit-to-items="!hasArea && !nearby"
          search-area
          nearby
          :nearby-circle="nearby"
          @marker-hover="active = $event"
          @marker-click="onMarkerClick"
          @search-area="onSearchArea"
          @search-nearby="onSearchNearby"
        />
        <template #fallback>
          <div class="flex h-full items-center justify-center bg-stone-100 text-stone-400">{{ t('mapa.loading', 'Cargando mapa…') }}</div>
        </template>
      </ClientOnly>
    </div>

    <!-- Mobile toggle -->
    <button class="fixed bottom-5 left-1/2 z-[600] -translate-x-1/2 rounded-full bg-ink px-6 py-3 text-[12px] font-semibold uppercase tracking-widest2 text-white shadow-xl lg:hidden" @click="view = view === 'map' ? 'list' : 'map'">
      {{ view === 'map' ? t('mapa.viewList', 'Ver lista') : t('mapa.viewMap', 'Ver mapa') }}
    </button>

    <FiltersModal :open="modalOpen" :model-value="modalSeed" :q="q" @close="modalOpen = false" @apply="onApplyFilters" />
  </div>
</template>

<script setup lang="ts">
import { withValidCoords } from '~/utils/maps/coords'
import { countActivePublicFilters, nearbyFromQuery, nearbyQuery, withoutNearby } from '~/utils/publicSearch'

const { t } = useI18n()
const { tenant, load: loadTenant } = useTenant()
await loadTenant()
useHead(
  seoHead({
    title: `${t('mapa.head.title', 'Mapa')} — ${tenant.value?.companyName || tenant.value?.name}`,
    description: 'Explora propiedades en Dubái sobre un mapa interactivo con amenidades y filtros por zona.',
  }),
)
const router = useRouter()
const route = useRoute()
const { format: formatPrice } = useCurrency()

const q = ref(String(route.query.q || ''))
const modalOpen = ref(false)

watch(
  () => route.query.q,
  (v) => (q.value = String(v || '')),
)

// `view=map` (FASE 2): hasta 300 propiedades sobre el mapa (antes 48), y la
// zona visible como filtro (north/south/east/west) cuando se pulsa «Buscar en esta zona».
const { data } = await useFetch('/api/public/properties', {
  query: computed(() => ({ ...route.query, view: 'map', perPage: 300 })),
})
const AREA_KEYS = ['north', 'south', 'east', 'west'] as const
const hasArea = computed(() => AREA_KEYS.every((k) => typeof route.query[k] === 'string' && route.query[k]))
function withoutArea(query: Record<string, any>) {
  return Object.fromEntries(Object.entries(query).filter(([k]) => !(AREA_KEYS as readonly string[]).includes(k)))
}
// Zona visible y radio no se combinan: buscar por uno quita el otro, para
// que lo que se ve en el mapa sea siempre exactamente lo que filtra.
function onSearchArea(b: { north: number; south: number; east: number; west: number }) {
  router.push({ query: { ...withoutNearby(route.query), north: String(b.north), south: String(b.south), east: String(b.east), west: String(b.west) } })
}
function clearArea() {
  router.push({ query: withoutArea(route.query) })
}

// «Buscar cerca de aquí» (FASE 2): lat/lng/radiusKm en la URL, que el API ya
// filtra sobre las coordenadas publicadas. Cuenta en la insignia y se guarda
// con la búsqueda.
const nearby = computed(() => nearbyFromQuery(route.query))
function onSearchNearby(p: { lat: number; lng: number; radiusKm: number }) {
  router.push({ query: { ...withoutArea(withoutNearby(route.query)), ...nearbyQuery(p.lat, p.lng, p.radiusKm) } })
}
function clearNearby() {
  router.push({ query: withoutNearby(route.query) })
}
const items = computed(() => withValidCoords((data.value?.rows as any[]) || []))

// Filtros activos de la insignia: los del modal (con el código postal) y el
// radio, que cuenta como uno (utils/publicSearch.ts).
const activeCount = computed(() => countActivePublicFilters(route.query))

// Guardar la búsqueda del mapa (código postal y radio incluidos), igual que
// en el listado: se abre después desde «Búsquedas guardadas».
const toast = useToast()
const { save: saveSearch, isSaved, load: loadSavedSearches } = useSavedSearches()
const typeLabel = usePropertyTypeLabel()
const savableQuery = computed(() => withoutArea(route.query))
const searchIsSaved = computed(() => isSaved(savableQuery.value))
function onSaveSearch() {
  if (searchIsSaved.value) return
  saveSearch(describePublicSearch({ ...savableQuery.value, q: q.value }, t, typeLabel), savableQuery.value)
  toast.success(t('search.saved'))
}

// Seed for the modal from current URL query
const modalSeed = computed(() => {
  const s: Record<string, any> = {}
  for (const k of ['minPrice','maxPrice','minArea','maxArea','bedrooms','bathrooms','minYear'])
    if (route.query[k]) s[k] = Number(route.query[k])
  for (const k of ['municipality','neighborhood','postalCode','type','status','orientation','energy']) if (route.query[k]) s[k] = String(route.query[k])
  for (const k of ['elevator','pool','garage','terrace','garden','pets','accessible'])
    if (route.query[k] === '1') s[k] = true
  if (nearby.value) Object.assign(s, nearby.value)
  return s
})

function onApplyFilters(qy: Record<string, string>) {
  modalOpen.value = false
  router.push({ query: qy })
}
function clearAll() {
  q.value = ''
  router.push({ query: {} })
}

const active = ref<number | null>(null)
const view = ref<'list' | 'map'>('map')
const isDesktop = ref(true)
const listEl = ref<HTMLElement | null>(null)
const cardRefs: Record<number, HTMLElement> = {}
function setCardRef(id: number, e: any) {
  if (e) cardRefs[id] = e
}

function onMarkerClick(id: number) {
  active.value = id
  const card = cardRefs[id]
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
function goTo(p: any) {
  router.push(`/propiedades/${p.slug || p.id}`)
}
function onSelect(sel: { type: string; value: string; slug?: string }) {
  if (sel.type === 'reference' && sel.slug) {
    router.push(`/propiedades/${sel.slug}`)
    return
  }
  q.value = sel.value
  applySearch()
}
function applySearch() {
  router.push({ query: { ...route.query, q: q.value || undefined } })
}

onMounted(() => {
  loadSavedSearches()
  isDesktop.value = window.innerWidth >= 1024
  window.addEventListener('resize', () => (isDesktop.value = window.innerWidth >= 1024))
})
</script>

<style scoped>
.filters-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid #16150f;
  border-radius: 9999px;
  padding: 0.65rem 1.1rem;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #16150f;
  transition: all 0.2s;
  white-space: nowrap;
}
.filters-btn:hover {
  background: #16150f;
  color: #fff;
}
.filters-btn:active {
  transform: scale(0.96);
}
.badge {
  display: inline-flex;
  height: 1.25rem;
  min-width: 1.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #16150f;
  padding: 0 0.35rem;
  font-size: 11px;
  color: #fff;
}
.filters-btn:hover .badge {
  background: #fff;
  color: #16150f;
}
</style>
