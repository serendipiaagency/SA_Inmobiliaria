<template>
  <SitePageLayout :page="sitePage" :home-data="sitePageData">
    <div class="cat-page">
      <div class="mx-auto max-w-screen-2xl px-4 pb-16 pt-6 sm:px-6 lg:px-10">
        <!-- Barra: buscador, orden y Galería / Mapa -->
        <div class="flex flex-wrap items-center gap-3 lg:flex-nowrap" data-testid="catalog-bar">
          <div class="min-w-0 flex-1 basis-full sm:basis-auto">
            <SmartSearch v-model="q" rounded :placeholder="t('search.placeholder', 'Ciudad, barrio, calle o referencia…')" @select="onSelect" @enter="applySearch" />
          </div>
          <!-- En un contenedor: `.cat-btn` fija su display y le ganaría a `lg:hidden`. -->
          <div class="lg:hidden">
            <button type="button" class="cat-btn" data-testid="catalog-open-drawer" @click="drawer = true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
              {{ t('catalog.filters', 'Filtros') }}
              <span v-if="chips.length" class="cat-count">{{ chips.length }}</span>
            </button>
          </div>
          <label class="cat-sort">
            <span class="sr-only">{{ t('catalog.sortBy', 'Ordenar') }}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
            <select v-model="sort" data-testid="catalog-sort" @change="applyPatch({ sort: sort || undefined, page: undefined })">
              <option value="">{{ t('properties.sort.recommended', 'Recomendado') }}</option>
              <option value="price_asc">{{ t('properties.sort.priceAsc', 'Precio ↑') }}</option>
              <option value="price_desc">{{ t('properties.sort.priceDesc', 'Precio ↓') }}</option>
            </select>
          </label>
          <div class="flex gap-2" role="group" :aria-label="t('catalog.view', 'Vista')">
            <button type="button" class="cat-view" :class="{ 'cat-view-on': !isMap }" :aria-pressed="!isMap" data-testid="catalog-view-gallery" @click="setView('galeria')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
              {{ t('catalog.gallery', 'Galería') }}
            </button>
            <button type="button" class="cat-view" :class="{ 'cat-view-on': isMap }" :aria-pressed="isMap" data-testid="catalog-view-map" @click="setView('mapa')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" /><path d="M9 4v13.5M15 6.5V20" /></svg>
              {{ t('catalog.map', 'Mapa') }}
            </button>
          </div>
        </div>

        <div class="mt-6 flex items-start gap-6">
          <!-- Panel de filtros (escritorio) -->
          <aside v-if="!collapsed" class="hidden w-[335px] shrink-0 lg:block" data-testid="catalog-aside">
            <div class="sticky top-[92px]">
              <CatalogFilters :query="route.query" :facets="facets" :total="total" :items="data?.rows || []" collapsible @patch="applyPatch" @clear="clearAll" @open-map="setView('mapa')" @show-results="showResults" @collapse="collapsed = true" @more="modalOpen = true" />
            </div>
          </aside>

          <section ref="resultsEl" class="min-w-0 flex-1" data-testid="catalog-results">
            <!-- Cabecera del catálogo: total real y filtros activos -->
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button v-if="collapsed" type="button" class="cat-btn hidden lg:inline-flex" data-testid="catalog-expand" @click="collapsed = false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                {{ t('catalog.filters', 'Filtros') }}
              </button>
              <p class="mr-1 text-[15px] text-stone-500" data-testid="catalog-total">
                <strong class="font-bold text-ink">{{ total.toLocaleString('es-ES') }}</strong>
                {{ total === 1 ? t('properties.count.singular', 'propiedad') : t('properties.count.plural', 'propiedades') }}
              </p>
              <button v-for="c in chips" :key="c.key" type="button" class="cat-chip" :data-chip="c.key" :aria-label="`${t('catalog.removeFilter', 'Quitar')} ${c.label}`" @click="removeChip(c)">
                {{ c.label }}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
              <button v-if="chips.length" type="button" class="text-[13px] font-medium text-ink underline underline-offset-4" data-testid="catalog-clear" @click="clearAll">
                {{ t('properties.clearFilters', 'Limpiar filtros') }}
              </button>
              <div class="ml-auto flex items-center gap-4">
                <button
                  v-if="chips.length"
                  type="button"
                  class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest transition"
                  :class="searchIsSaved ? 'text-ink' : 'text-stone-400 hover:text-ink'"
                  @click="onSaveSearch"
                >
                  <svg class="h-3.5 w-3.5" :fill="searchIsSaved ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                  {{ searchIsSaved ? t('search.saved') : t('search.save') }}
                </button>
                <div class="relative">
                  <button type="button" class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-stone-400 hover:text-ink" @click="savingSearch = !savingSearch">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
                    {{ t('catalog.alert', 'Avísame') }}
                  </button>
                  <div v-if="savingSearch" class="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-line bg-white p-3 shadow-lg">
                    <p class="mb-2 text-xs text-stone-500">Te avisamos por email cuando aparezca una propiedad nueva que coincida con esta búsqueda.</p>
                    <input v-model="savedSearchEmail" type="email" placeholder="tu@email.com" class="w-full rounded-lg border border-line px-3 py-2 text-sm" >
                    <button type="button" class="mt-2 w-full rounded-lg bg-ink py-2 text-xs font-medium text-white disabled:opacity-50" :disabled="savingSearchPending" @click="subscribeSearchAlert">
                      {{ savingSearchPending ? 'Guardando…' : 'Guardar búsqueda' }}
                    </button>
                    <p v-if="savedSearchDone" class="mt-2 text-xs font-medium text-emerald-700">¡Listo! Te avisaremos por email.</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Galería: 3 columnas en escritorio -->
            <template v-if="!isMap">
              <div class="results-fade mt-5" :class="{ 'is-loading': pending }">
                <div
                  v-if="data?.rows?.length"
                  class="grid grid-cols-1 gap-5 sm:grid-cols-2"
                  :class="collapsed ? 'lg:grid-cols-3' : 'xl:grid-cols-3'"
                  data-testid="catalog-grid"
                >
                  <ProjectCard v-for="p in data.rows" :key="p.id" :project="p" variant="catalog" />
                </div>
                <div v-else-if="!pending" class="py-24 text-center">
                  <p class="font-serif text-2xl text-stone-500">{{ t('properties.empty.title', 'No hay propiedades que coincidan.') }}</p>
                  <button class="btn-quiet mt-6" @click="clearAll">{{ t('properties.clearFilters', 'Limpiar filtros') }}</button>
                </div>
                <div v-else class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  <div v-for="i in 6" :key="i" class="overflow-hidden rounded-xl border border-line bg-white">
                    <div class="skeleton aspect-[33/20]" />
                    <div class="p-4"><div class="skeleton h-4 w-2/3 rounded" /><div class="skeleton mt-2 h-4 w-1/2 rounded" /></div>
                  </div>
                </div>
              </div>

              <div v-if="totalPages > 1" class="mt-12 flex items-center justify-center gap-4">
                <button class="btn-quiet" :disabled="page <= 1" @click="applyPatch({ page: String(page - 1) })">← {{ t('properties.pagination.prev', 'Anterior') }}</button>
                <span class="text-[11px] font-semibold uppercase tracking-widest text-stone-450">
                  {{ t('properties.pagination.page', 'Página') }} {{ page }} {{ t('properties.pagination.of', 'de') }} {{ totalPages }}
                </span>
                <button class="btn-quiet" :disabled="page >= totalPages" @click="applyPatch({ page: String(page + 1) })">{{ t('properties.pagination.next', 'Siguiente') }} →</button>
              </div>
            </template>

            <!-- Mapa: las mismas propiedades filtradas, sobre el mapa de /mapa -->
            <div v-else class="mt-5 h-[70vh] min-h-[420px] overflow-hidden rounded-2xl border border-line" data-testid="catalog-map">
              <ClientOnly>
                <MapExplorer :items="mapItems" :fit-to-items="!hasArea && !nearby" search-area nearby :nearby-circle="nearby" @marker-click="onMarkerClick" @search-area="onSearchArea" @search-nearby="onSearchNearby" />
                <template #fallback>
                  <div class="flex h-full items-center justify-center bg-stone-100 text-stone-400">{{ t('mapa.loading', 'Cargando mapa…') }}</div>
                </template>
              </ClientOnly>
            </div>
          </section>
        </div>
      </div>

      <!-- «Más filtros»: el modal de siempre, con los que el panel no enseña -->
      <FiltersModal :open="modalOpen" :model-value="modalSeed" :q="q" @close="modalOpen = false" @apply="onApplyFilters" />

      <!-- Tablet y móvil: el mismo panel, en un cajón -->
      <Teleport to="body">
        <div v-if="drawer" class="fixed inset-0 z-[1000] lg:hidden" role="dialog" aria-modal="true" :aria-label="t('catalog.filters', 'Filtros')" data-testid="catalog-drawer">
          <div class="absolute inset-0 bg-black/40" @click="drawer = false" />
          <div class="absolute inset-y-0 left-0 w-[min(92vw,380px)] overflow-y-auto bg-[#f7f4ee] p-3" style="padding-bottom: max(12px, env(safe-area-inset-bottom))">
            <div class="mb-1 flex justify-end">
              <button type="button" class="rounded-full p-2 text-stone-500 hover:text-ink" :aria-label="t('catalog.close', 'Cerrar')" @click="drawer = false">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <CatalogFilters :query="route.query" :facets="facets" :total="total" :items="data?.rows || []" @patch="applyPatch" @clear="clearAll" @open-map="openMapFromDrawer" @show-results="showResults" @more="openMoreFromDrawer" />
          </div>
        </div>
      </Teleport>
    </div>
  </SitePageLayout>
</template>

<script setup lang="ts">
import { nearbyFromQuery, nearbyQuery, withoutNearby } from '~/utils/publicSearch'
import { withValidCoords } from '~/utils/maps/coords'
import { catalogChips, type CatalogChip } from '~/utils/catalogChips'

/**
 * Catálogo público (#109): barra de búsqueda con orden y Galería / Mapa,
 * panel de filtros a la izquierda (components/catalog/CatalogFilters.vue),
 * total real con chips de los filtros activos y la rejilla de tres columnas.
 * Todo vive en la URL: cada filtro cambia la consulta y el servidor filtra el
 * catálogo real de la agencia (server/api/public/properties.get.ts).
 */
const { t } = useI18n()
const { tenant, load: loadTenant } = useTenant()
await loadTenant()
// Página «Propiedades» del Constructor Web: el buscador y el listado son su
// zona dinámica; con una versión publicada, las secciones que se le añadan
// van encima o debajo.
const { page: sitePage, homeData: sitePageData } = await useSitePage('propiedades')
useHead(
  seoHead({
    title: sitePage.value?.seo?.title || `${t('properties.head.title', 'Buscar propiedades')} — ${tenant.value?.companyName || tenant.value?.name}`,
    description: sitePage.value?.seo?.description || `Las propiedades de ${tenant.value?.companyName || tenant.value?.name}: busca por ubicación, precio, superficie, habitaciones y características.`,
  }),
)
const toast = useToast()
const { save: saveSearch, isSaved } = useSavedSearches()
const route = useRoute()
const router = useRouter()
const { format: formatPrice } = useCurrency()
const typeLabel = usePropertyTypeLabel()

const q = ref(String(route.query.q || ''))
const sort = ref(String(route.query.sort || ''))
watch(
  () => route.query.q,
  (v) => (q.value = String(v || '')),
)

// "Avísame" — alerta por email del servidor para nuevas propiedades que encajen
// (distinto de useSavedSearches(), marcadores locales sin aviso).
const savingSearch = ref(false)
const savedSearchEmail = ref('')
const savingSearchPending = ref(false)
const savedSearchDone = ref(false)
async function subscribeSearchAlert() {
  if (!savedSearchEmail.value) return
  savingSearchPending.value = true
  try {
    await $fetch('/api/public/saved-searches', { method: 'POST', body: { email: savedSearchEmail.value, filters: route.query } })
    savedSearchDone.value = true
  } catch {
    toast.error('No se pudo guardar la búsqueda')
  } finally {
    savingSearchPending.value = false
  }
}

const page = computed(() => Math.max(1, parseInt(String(route.query.page || '1'), 10) || 1))
// La vista va en la URL (`vista=mapa`) y no viaja a la API como filtro.
const isMap = computed(() => route.query.vista === 'mapa')
const apiQuery = computed(() => {
  const { vista: _vista, ...rest } = route.query
  return rest
})

const { data, pending } = await useFetch('/api/public/properties', {
  query: computed(() => ({ ...apiQuery.value, page: page.value, perPage: 12 })),
})
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.ceil(total.value / (data.value?.perPage || 12)))

// Lo que hay publicado, para los selectores del panel (no encoge al filtrar).
const { data: facetData } = await useFetch('/api/public/properties', { key: 'catalog-facets', query: { countOnly: '1', facets: 'filters' } })
const facets = computed(() => (facetData.value as any)?.facets ?? null)

// Mapa: hasta 300 propiedades con los mismos filtros, sólo cuando se mira.
const { data: mapData, execute: loadMap } = useLazyFetch('/api/public/properties', {
  key: 'catalog-map',
  query: computed(() => ({ ...apiQuery.value, view: 'map', perPage: 300 })),
  immediate: false,
  watch: false,
})
watch(
  [isMap, apiQuery],
  ([v]) => {
    if (v) loadMap()
  },
  { immediate: true },
)
const mapItems = computed(() => withValidCoords((mapData.value?.rows as any[]) || []))

const chips = computed(() => catalogChips(route.query as Record<string, unknown>, t, (n) => formatPrice(n), typeLabel))
const searchIsSaved = computed(() => isSaved(route.query as Record<string, any>))
function onSaveSearch() {
  if (searchIsSaved.value) return
  saveSearch(chips.value.map((c) => c.label).join(' · ') || t('search.allProperties', 'Todas las propiedades'), route.query as Record<string, any>)
  toast.success(t('search.saved'))
}

const modalOpen = ref(false)
// Lo que ya hay en la URL, para abrir el modal con ello.
const modalSeed = computed(() => {
  const s: Record<string, any> = {}
  for (const k of ['minPrice', 'maxPrice', 'minArea', 'maxArea', 'bedrooms', 'bathrooms', 'minYear']) if (route.query[k]) s[k] = Number(route.query[k])
  for (const k of ['municipality', 'neighborhood', 'postalCode', 'type', 'status', 'orientation', 'energy']) if (route.query[k]) s[k] = String(route.query[k])
  for (const k of ['elevator', 'pool', 'garage', 'terrace', 'garden', 'pets', 'accessible']) if (route.query[k] === '1') s[k] = true
  const near = nearbyFromQuery(route.query)
  if (near) Object.assign(s, near)
  return s
})
// El modal devuelve todos sus filtros: sustituyen a los de la URL; búsqueda, orden, operación y vista se quedan.
function onApplyFilters(qy: Record<string, string>) {
  modalOpen.value = false
  const keep: Record<string, any> = {}
  for (const k of ['q', 'sort', 'operacion', 'vista']) if (route.query[k]) keep[k] = route.query[k]
  router.push({ query: { ...keep, ...qy } })
}
function openMoreFromDrawer() {
  drawer.value = false
  modalOpen.value = true
}

const collapsed = ref(false)
const drawer = ref(false)
const resultsEl = ref<HTMLElement | null>(null)

function applyPatch(patch: Record<string, any>) {
  const merged: Record<string, any> = { ...route.query, ...patch }
  const query: Record<string, any> = {}
  for (const k of Object.keys(merged)) {
    if (merged[k] != null && merged[k] !== '') query[k] = merged[k]
  }
  router.push({ query })
}
function removeChip(c: CatalogChip) {
  const patch: Record<string, any> = { page: undefined }
  for (const k of c.clear) patch[k] = undefined
  if (c.clear.includes('q')) q.value = ''
  applyPatch(patch)
}
function setView(v: 'galeria' | 'mapa') {
  applyPatch({ vista: v === 'mapa' ? 'mapa' : undefined })
}
function openMapFromDrawer() {
  drawer.value = false
  setView('mapa')
}
function showResults() {
  drawer.value = false
  resultsEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  applyPatch({ q: q.value || undefined, page: undefined })
}

function clearAll() {
  q.value = ''
  sort.value = ''
  router.push({ query: isMap.value ? { vista: 'mapa' } : {} })
}

// Vista Mapa: zona visible y radio, igual que /mapa (no se combinan).
const AREA_KEYS = ['north', 'south', 'east', 'west'] as const
const hasArea = computed(() => AREA_KEYS.every((k) => typeof route.query[k] === 'string' && route.query[k]))
const nearby = computed(() => nearbyFromQuery(route.query))
function withoutArea(query: Record<string, any>) {
  return Object.fromEntries(Object.entries(query).filter(([k]) => !(AREA_KEYS as readonly string[]).includes(k)))
}
function onSearchArea(b: { north: number; south: number; east: number; west: number }) {
  router.push({ query: { ...withoutNearby(route.query), north: String(b.north), south: String(b.south), east: String(b.east), west: String(b.west) } })
}
function onSearchNearby(p: { lat: number; lng: number; radiusKm: number }) {
  router.push({ query: { ...withoutArea(withoutNearby(route.query)), ...nearbyQuery(p.lat, p.lng, p.radiusKm) } })
}
function onMarkerClick(id: number) {
  const p = mapItems.value.find((x: any) => x.id === id)
  if (p) router.push(`/propiedades/${p.slug || p.id}`)
}
</script>

<style scoped>
.cat-page {
  background: #fbfaf7;
}
.cat-btn {
  display: inline-flex;
  height: 46px;
  align-items: center;
  gap: 8px;
  border: 1px solid #e3ded6;
  border-radius: 12px;
  background: #fff;
  padding: 0 16px;
  font-size: 14px;
  font-weight: 500;
  color: #1c1b19;
}
.cat-count {
  display: inline-flex;
  height: 20px;
  min-width: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #16150f;
  padding: 0 6px;
  font-size: 11px;
  color: #fff;
}
.cat-sort {
  position: relative;
  display: inline-flex;
  height: 46px;
  align-items: center;
  gap: 8px;
  border: 1px solid #e3ded6;
  border-radius: 12px;
  background: #fff;
  padding: 0 12px 0 16px;
  color: #1c1b19;
}
.cat-sort select {
  appearance: auto;
  border: 0;
  background: transparent;
  padding-right: 6px;
  font-size: 14px;
  color: #1c1b19;
  outline: none;
}
.cat-view {
  display: inline-flex;
  height: 46px;
  align-items: center;
  gap: 8px;
  border: 1px solid #e3ded6;
  border-radius: 12px;
  background: #fff;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 500;
  color: #1c1b19;
}
.cat-view-on {
  border-color: #16150f;
  background: #16150f;
  color: #fff;
}
.cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #e3ded6;
  border-radius: 9999px;
  background: #fff;
  padding: 6px 12px;
  font-size: 12.5px;
  color: #1c1b19;
}
.cat-chip:hover {
  border-color: #1c1b19;
}
.cat-btn:focus-visible,
.cat-view:focus-visible,
.cat-chip:focus-visible,
.cat-sort:focus-within {
  outline: 2px solid #16150f;
  outline-offset: 2px;
}
.results-fade {
  transition: opacity 0.25s var(--ease-out);
}
.results-fade.is-loading {
  opacity: 0.45;
  pointer-events: none;
}
</style>
