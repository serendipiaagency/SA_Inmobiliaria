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
            <span v-if="activeCount" class="badge">{{ activeCount }}</span>
          </button>
        </div>
        <div class="flex items-center justify-between">
          <p class="text-sm text-stone-500"><span class="font-semibold text-ink">{{ data?.total ?? items.length }}</span> {{ t('mapa.propertiesOnMap', 'propiedades en el mapa') }}</p>
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
              <img :src="mediaUrl(p.coverImage)" :alt="p.name" class="h-full w-full object-cover" loading="lazy" />
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
        <MapExplorer :items="items" :active-id="active" @marker-hover="active = $event" @marker-click="onMarkerClick" />
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
const { t } = useI18n()
useHead({ title: t('mapa.head.title', 'Mapa — M&M Real Estate') })
const router = useRouter()
const route = useRoute()
const { format: formatPrice } = useCurrency()

const q = ref(String(route.query.q || ''))
const modalOpen = ref(false)

watch(
  () => route.query.q,
  (v) => (q.value = String(v || '')),
)

const { data } = await useFetch('/api/public/properties', {
  query: computed(() => ({ ...route.query, perPage: 48 })),
})
const items = computed(() => (data.value?.rows || []).filter((p: any) => p.lat && p.lng))

// Advanced filter keys that count toward the badge
const ADV = ['minPrice','maxPrice','minArea','maxArea','bedrooms','bathrooms','type','status','orientation','minYear','energy','elevator','pool','garage','terrace','garden','pets','accessible']
const activeCount = computed(() => ADV.filter((k) => route.query[k]).length)

// Seed for the modal from current URL query
const modalSeed = computed(() => {
  const s: Record<string, any> = {}
  for (const k of ['minPrice','maxPrice','minArea','maxArea','bedrooms','bathrooms','minYear'])
    if (route.query[k]) s[k] = Number(route.query[k])
  for (const k of ['type','status','orientation','energy']) if (route.query[k]) s[k] = String(route.query[k])
  for (const k of ['elevator','pool','garage','terrace','garden','pets','accessible'])
    if (route.query[k] === '1') s[k] = true
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
  router.push(`/property-details/${p.slug || p.id}`)
}
function onSelect(sel: { type: string; value: string; slug?: string }) {
  if (sel.type === 'reference' && sel.slug) {
    router.push(`/property-details/${sel.slug}`)
    return
  }
  q.value = sel.value
  applySearch()
}
function applySearch() {
  router.push({ query: { ...route.query, q: q.value || undefined } })
}

onMounted(() => {
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
