<template>
  <div>
    <!-- Search header -->
    <header class="sticky top-[73px] z-30 border-b border-line bg-paper/95 backdrop-blur">
      <div class="mx-auto max-w-screen-2xl px-6 py-4 lg:px-10">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div class="lg:flex-1">
            <SmartSearch
              v-model="q"
              rounded
              :placeholder="t('search.placeholder', 'Ciudad, barrio, calle o referencia…')"
              @select="onSelect"
              @enter="applySearch"
            />
          </div>
          <div class="flex items-center gap-2">
            <button class="filters-btn" @click="modalOpen = true">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" d="M3 5h18M6 12h12M10 19h4" />
              </svg>
              {{ t('filters.button', 'Filtros') }}
              <span v-if="activeCount" class="badge">{{ activeCount }}</span>
            </button>
            <div class="relative">
              <select v-model="sort" class="sort-select" @change="applyPatch({ sort: sort || undefined, page: undefined })">
                <option value="">{{ t('properties.sort.recommended', 'Recomendado') }}</option>
                <option value="price_asc">{{ t('properties.sort.priceAsc', 'Precio ↑') }}</option>
                <option value="price_desc">{{ t('properties.sort.priceDesc', 'Precio ↓') }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Quick chips -->
        <div class="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            v-for="c in quickChips"
            :key="c.key"
            type="button"
            class="quick-chip"
            :class="{ 'quick-on': isChipOn(c) }"
            @click="toggleChip(c)"
          >
            {{ c.label }}
          </button>
        </div>
      </div>
    </header>

    <div class="mx-auto max-w-screen-2xl px-6 py-8 lg:px-10">
      <div class="mb-6 flex items-baseline justify-between">
        <p class="text-sm text-stone-500">
          <span class="font-semibold text-ink">{{ data?.total ?? 0 }}</span>
          {{ (data?.total ?? 0) === 1 ? t('properties.count.singular', 'propiedad') : t('properties.count.plural', 'propiedades') }}
          <span v-if="q"> · “{{ q }}”</span>
        </p>
        <div class="flex items-center gap-4">
          <button
            v-if="activeCount || q"
            type="button"
            class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest transition"
            :class="searchIsSaved ? 'text-ink' : 'text-stone-400 hover:text-ink'"
            @click="onSaveSearch"
          >
            <svg class="h-3.5 w-3.5" :fill="searchIsSaved ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
            {{ searchIsSaved ? t('search.saved') : t('search.save') }}
          </button>
          <button v-if="activeCount || q" class="text-[11px] font-semibold uppercase tracking-widest text-stone-400 hover:text-ink" @click="clearAll">
            {{ t('hero.clear') }}
          </button>
        </div>
      </div>

      <div class="results-fade" :class="{ 'is-loading': pending }">
        <transition-group
          v-if="data?.rows?.length"
          name="grid"
          tag="div"
          class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <ProjectCard v-for="p in data.rows" :key="p.id" :project="p" />
        </transition-group>
        <div v-else-if="!pending" class="py-24 text-center">
          <p class="font-serif text-2xl text-stone-500">{{ t('properties.empty.title', 'No hay propiedades que coincidan.') }}</p>
          <button class="btn-quiet mt-6" @click="clearAll">{{ t('properties.clearFilters', 'Limpiar filtros') }}</button>
        </div>
        <div v-else class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div v-for="i in 8" :key="i" class="overflow-hidden rounded-2xl">
            <div class="skeleton aspect-[4/3] rounded-2xl" />
            <div class="skeleton mt-4 h-4 w-2/3 rounded" />
            <div class="skeleton mt-2 h-5 w-1/2 rounded" />
          </div>
        </div>
      </div>

      <div v-if="totalPages > 1" class="mt-14 flex items-center justify-center gap-4">
        <button class="btn-quiet" :disabled="page <= 1" @click="applyPatch({ page: String(page - 1) })">← {{ t('properties.pagination.prev', 'Anterior') }}</button>
        <span class="text-[11px] font-semibold uppercase tracking-widest text-stone-450">
          {{ t('properties.pagination.page', 'Página') }} {{ page }} {{ t('properties.pagination.of', 'de') }} {{ totalPages }}
        </span>
        <button class="btn-quiet" :disabled="page >= totalPages" @click="applyPatch({ page: String(page + 1) })">{{ t('properties.pagination.next', 'Siguiente') }} →</button>
      </div>
    </div>

    <FiltersModal :open="modalOpen" :model-value="modalSeed" :q="q" @close="modalOpen = false" @apply="onApplyFilters" />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead({ title: t('properties.head.title', 'Buscar propiedades — M&M Real Estate') })
const toast = useToast()
const { save: saveSearch, isSaved } = useSavedSearches()
const route = useRoute()
const router = useRouter()

const q = ref(String(route.query.q || ''))
const sort = ref(String(route.query.sort || ''))
const modalOpen = ref(false)

watch(
  () => route.query.q,
  (v) => (q.value = String(v || '')),
)

const page = computed(() => Math.max(1, parseInt(String(route.query.page || '1'), 10) || 1))

const { data, pending } = await useFetch('/api/public/properties', {
  query: computed(() => ({ ...route.query, page: page.value })),
})
const totalPages = computed(() => Math.ceil((data.value?.total || 0) / (data.value?.perPage || 12)))

// Advanced filter keys that count toward the badge
const ADV = ['minPrice','maxPrice','minArea','maxArea','bedrooms','bathrooms','type','status','orientation','minYear','energy','elevator','pool','garage','terrace','garden','pets','accessible']
const activeCount = computed(() => ADV.filter((k) => route.query[k]).length)

const searchIsSaved = computed(() => isSaved(route.query as Record<string, any>))
function searchLabel() {
  const parts: string[] = []
  if (q.value) parts.push(q.value)
  if (route.query.bedrooms) parts.push(`${route.query.bedrooms}+ ${t('card.beds', 'hab.')}`)
  if (route.query.minPrice || route.query.maxPrice) parts.push(t('search.label.budget', 'presupuesto'))
  if (route.query.pool) parts.push(t('search.label.pool', 'piscina'))
  if (route.query.status === 'new') parts.push(t('search.label.newBuild', 'obra nueva'))
  if (!parts.length) parts.push(t('search.label.allProperties', 'Todas las propiedades'))
  return parts.join(' · ')
}
function onSaveSearch() {
  if (searchIsSaved.value) return
  saveSearch(searchLabel(), route.query as Record<string, any>)
  toast.success(t('search.saved'))
}

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

// Quick chips
const quickChips = computed(() => [
  { key: 'status', value: 'new', label: t('filters.status.new', 'Obra nueva') },
  { key: 'pool', value: '1', label: t('filters.feature.pool', 'Piscina') },
  { key: 'garage', value: '1', label: t('filters.feature.garage', 'Garaje') },
  { key: 'terrace', value: '1', label: t('filters.feature.terrace', 'Terraza') },
  { key: 'garden', value: '1', label: t('filters.feature.garden', 'Jardín') },
])
function isChipOn(c: { key: string; value: string }) {
  return String(route.query[c.key] || '') === c.value
}
function toggleChip(c: { key: string; value: string }) {
  const patch: Record<string, any> = { page: undefined }
  patch[c.key] = isChipOn(c) ? undefined : c.value
  applyPatch(patch)
}

function applyPatch(patch: Record<string, any>) {
  const query: Record<string, any> = { ...route.query, ...patch }
  Object.keys(query).forEach((k) => (query[k] == null || query[k] === '') && delete query[k])
  router.push({ query })
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
  applyPatch({ q: q.value || undefined, page: undefined })
}

function onApplyFilters(qy: Record<string, string>) {
  modalOpen.value = false
  // Preserve q & sort, replace advanced filters entirely with modal output
  const query: Record<string, any> = { ...qy }
  if (sort.value) query.sort = sort.value
  router.push({ query })
}

function clearAll() {
  q.value = ''
  sort.value = ''
  router.push({ query: {} })
}
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
.sort-select {
  border: 1px solid #e7e4de;
  border-radius: 9999px;
  padding: 0.65rem 1.1rem;
  font-size: 13px;
  color: #16150f;
  background: #fff;
}
.sort-select:focus {
  border-color: #16150f;
}
.sort-select:focus-visible {
  outline: 2px solid #16150f;
  outline-offset: 2px;
}
.quick-chip {
  flex-shrink: 0;
  white-space: nowrap;
  border: 1px solid #e7e4de;
  border-radius: 9999px;
  padding: 0.5rem 1rem;
  font-size: 13px;
  color: #57534e;
  background: #fff;
  transition: all 0.18s;
}
.quick-chip:hover {
  border-color: #16150f;
  color: #16150f;
}
.quick-chip:active {
  transform: scale(0.95);
}
.quick-on {
  background: #16150f;
  border-color: #16150f;
  color: #fff;
}

.grid-enter-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.grid-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.grid-leave-active {
  position: absolute;
}
.results-fade {
  transition: opacity 0.25s var(--ease-out);
}
.results-fade.is-loading {
  opacity: 0.45;
  pointer-events: none;
}
</style>
