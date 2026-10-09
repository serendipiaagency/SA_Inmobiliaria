<template>
  <div class="cf-panel" data-testid="catalog-filters">
    <div class="cf-head">
      <h2 class="cf-title">{{ t('catalog.filters', 'Filtros') }}</h2>
      <div class="flex items-center gap-1">
        <button type="button" class="cf-clear" data-testid="catalog-clear-all" @click="emit('clear')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          {{ t('catalog.clearAll', 'Limpiar todo') }}
        </button>
        <button v-if="collapsible" type="button" class="cf-collapse" :aria-label="t('catalog.hideFilters', 'Ocultar filtros')" :title="t('catalog.hideFilters', 'Ocultar filtros')" data-testid="catalog-collapse" @click="emit('collapse')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
      </div>
    </div>

    <div class="cf-groups">
      <section v-for="g in groups" :key="g.key" class="cf-group" :data-group="g.key">
        <button type="button" class="cf-group-head" :aria-expanded="isOpen(g.key)" :aria-controls="`cf-${uid}-${g.key}`" @click="toggle(g.key)">
          <!-- SVG fijo de este componente, nunca datos -->
          <span class="cf-icon" :style="{ color: g.fg, backgroundColor: g.bg }" v-html="g.icon" />
          <span class="cf-group-name">{{ g.label }}</span>
          <span v-if="activeIn(g.key)" class="cf-dot" :aria-label="t('catalog.active', 'con filtro')" />
          <svg class="cf-chevron" :class="{ 'cf-chevron-open': isOpen(g.key) }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>

        <div v-show="isOpen(g.key)" :id="`cf-${uid}-${g.key}`" class="cf-body">
          <!-- Ubicación -->
          <template v-if="g.key === 'location'">
            <div class="cf-seg" role="group" :aria-label="t('catalog.locationMode', 'Buscar por')">
              <button v-for="m in locModes" :key="m.key" type="button" class="cf-seg-btn" :class="{ 'cf-seg-on': locMode === m.key }" :aria-pressed="locMode === m.key" @click="setLocMode(m.key)">{{ m.label }}</button>
            </div>
            <label class="cf-select-wrap">
              <span class="sr-only">{{ locModes.find((m) => m.key === locMode)?.label }}</span>
              <svg class="cf-select-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.3a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.7" r="2.5" /></svg>
              <select class="cf-select" :value="locValue" data-testid="catalog-location" @change="onLocation(($event.target as HTMLSelectElement).value)">
                <option value="">{{ t('catalog.anyLocation', 'Cualquier ubicación') }}</option>
                <option v-for="o in locOptions" :key="o" :value="o">{{ o }}</option>
              </select>
            </label>
            <div class="cf-map">
              <ClientOnly>
                <CatalogMiniMap :items="items" :circle="circle" />
              </ClientOnly>
              <button type="button" class="cf-map-btn" data-testid="catalog-map-search" @click="emit('open-map')">
                {{ t('catalog.searchOnMap', 'Buscar en el mapa') }}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
              </button>
            </div>
          </template>

          <!-- Precio / Superficie -->
          <div v-else-if="g.key === 'price' || g.key === 'area'" class="cf-range">
            <label>
              <span class="cf-mini">{{ t('catalog.min', 'Mínimo') }}</span>
              <input v-model="drafts[g.key === 'price' ? 'minPrice' : 'minArea']" class="cf-input" type="number" inputmode="numeric" min="0" :placeholder="g.key === 'price' ? '0 €' : '0 m²'" :data-testid="`catalog-${g.key}-min`" @change="onNumber(g.key === 'price' ? 'minPrice' : 'minArea', ($event.target as HTMLInputElement).value)" >
            </label>
            <label>
              <span class="cf-mini">{{ t('catalog.max', 'Máximo') }}</span>
              <input v-model="drafts[g.key === 'price' ? 'maxPrice' : 'maxArea']" class="cf-input" type="number" inputmode="numeric" min="0" :placeholder="t('catalog.noLimit', 'Sin límite')" :data-testid="`catalog-${g.key}-max`" @change="onNumber(g.key === 'price' ? 'maxPrice' : 'maxArea', ($event.target as HTMLInputElement).value)" >
            </label>
          </div>

          <!-- Habitaciones / Baños -->
          <div v-else-if="g.key === 'bedrooms' || g.key === 'bathrooms'" class="cf-pills" role="group" :aria-label="g.label">
            <button
              v-for="n in [0, 1, 2, 3, 4]"
              :key="n"
              type="button"
              class="cf-pill"
              :class="{ 'cf-pill-on': Number(query[g.key] || 0) === n }"
              :aria-pressed="Number(query[g.key] || 0) === n"
              :data-testid="`catalog-${g.key}-${n}`"
              @click="emit('patch', { [g.key]: n ? String(n) : undefined, page: undefined })"
            >
              {{ n ? `${n}+` : t('catalog.any', 'Todas') }}
            </button>
          </div>

          <!-- Tipo -->
          <div v-else-if="g.key === 'type'" class="cf-pills">
            <button type="button" class="cf-pill" :class="{ 'cf-pill-on': !query.type }" @click="emit('patch', { type: undefined, page: undefined })">{{ t('catalog.any', 'Todas') }}</button>
            <button v-for="tp in facets?.types || []" :key="tp" type="button" class="cf-pill" :class="{ 'cf-pill-on': query.type === tp }" :aria-pressed="query.type === tp" :data-testid="`public-filter-type-${tp}`" @click="emit('patch', { type: query.type === tp ? undefined : tp, page: undefined })">{{ typeLabel(tp) }}</button>
          </div>

          <!-- Estado -->
          <div v-else-if="g.key === 'status'" class="cf-pills">
            <button type="button" class="cf-pill" :class="{ 'cf-pill-on': !query.status }" @click="emit('patch', { status: undefined, page: undefined })">{{ t('catalog.any', 'Todas') }}</button>
            <button v-for="st in statusOptions" :key="st" type="button" class="cf-pill" :class="{ 'cf-pill-on': query.status === st }" :aria-pressed="query.status === st" @click="emit('patch', { status: query.status === st ? undefined : st, page: undefined })">{{ statusLabel(st) }}</button>
          </div>

          <!-- Características -->
          <div v-else-if="g.key === 'features'" class="cf-checks">
            <label v-for="f in featureOptions" :key="f.key" class="cf-check">
              <input type="checkbox" :checked="query[f.key] === '1'" :data-testid="`catalog-feature-${f.key}`" @change="emit('patch', { [f.key]: ($event.target as HTMLInputElement).checked ? '1' : undefined, page: undefined })" >
              {{ f.label }}
            </label>
          </div>
        </div>
      </section>
    </div>

    <button type="button" class="cf-more" data-testid="catalog-more-filters" @click="emit('more')">
      {{ t('catalog.moreFilters', 'Más filtros: orientación, eficiencia, año, radio…') }}
    </button>

    <button type="button" class="cf-results" data-testid="catalog-show-results" @click="emit('show-results')">
      {{ resultsLabel }}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { nearbyFromQuery } from '~/utils/publicSearch'

/**
 * Panel de filtros del catálogo público (#109, pages/propiedades/index.vue):
 * Ubicación (municipio, zona o código postal, con un mapa real), Precio,
 * Superficie, Habitaciones, Baños, Tipo, Estado y Características. Cada
 * cambio se aplica a la URL al momento (`patch`), y el servidor filtra sobre
 * el catálogo real (server/api/public/properties.get.ts); las opciones de
 * ubicación, tipo y estado son las que la inmobiliaria tiene publicadas
 * (`facets=filters`). El botón de abajo dice cuántas propiedades hay de
 * verdad con estos filtros.
 */
const props = withDefaults(
  defineProps<{
    query: Record<string, any>
    facets?: { types?: string[]; municipalities?: string[]; neighborhoods?: string[]; postalCodes?: string[]; statuses?: string[] } | null
    total: number
    items?: { lat?: number | null; lng?: number | null }[]
    collapsible?: boolean
  }>(),
  { facets: null, items: () => [], collapsible: false },
)
const emit = defineEmits<{ patch: [Record<string, any>]; clear: []; 'open-map': []; 'show-results': []; collapse: []; more: [] }>()

const { t, intlLocale } = useI18n()
const typeLabel = usePropertyTypeLabel()
const uid = useId()

const ICONS: Record<string, string> = {
  location: '<path d="M12 21s-7-6.2-7-11.3a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" fill="currentColor"/><circle cx="12" cy="9.7" r="2.6" fill="#fff"/>',
  price: '<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M15.5 8.5A4.5 4.5 0 1 0 15.5 15.5M7 11h6M7 13.5h6" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  area: '<rect x="2.5" y="4" width="19" height="16" rx="3" fill="currentColor"/><text x="12" y="15.6" text-anchor="middle" font-size="8.5" font-weight="700" font-family="system-ui,sans-serif" fill="#fff">m²</text>',
  bedrooms: '<path d="M2 18V6.5M2 12.5h20V18M22 18v-3.5A2.5 2.5 0 0 0 19.5 12H10V9.5A1.5 1.5 0 0 0 8.5 8H4.5A2.5 2.5 0 0 0 2 10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12.5h20v4H2z" fill="currentColor"/>',
  bathrooms: '<path d="M3 12h18v2.5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" fill="currentColor"/><path d="M6 12V6a2 2 0 0 1 3.6-1.2M7 20l-1 1.5M17 20l1 1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  type: '<path d="M3 11 12 3.5 21 11v9a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z" fill="currentColor"/>',
  status: '<path d="M14.7 6.3a4 4 0 0 0 5 5L12 19a2.8 2.8 0 1 1-4-4l7.7-7.7z" fill="currentColor"/><path d="M14.7 6.3 17 4l3 3-2.3 2.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  features: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.4" fill="currentColor"/><circle cx="10" cy="17" r="2.4" fill="currentColor"/>',
}
const svg = (k: string) => `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[k]}</svg>`

// Colores de la referencia: azul para casi todo, cálidos para precio y superficie.
const BLUE = { fg: '#3f6fc2', bg: '#e6eefb' }
const groups = computed(() => [
  { key: 'location', label: t('catalog.location', 'Ubicación'), icon: svg('location'), ...BLUE },
  { key: 'price', label: t('catalog.price', 'Precio'), icon: svg('price'), fg: '#c77a2c', bg: '#fbefe1' },
  { key: 'area', label: t('catalog.area', 'Superficie'), icon: svg('area'), fg: '#9c6a3c', bg: '#f5ebe0' },
  { key: 'bedrooms', label: t('catalog.bedrooms', 'Habitaciones'), icon: svg('bedrooms'), ...BLUE },
  { key: 'bathrooms', label: t('catalog.bathrooms', 'Baños'), icon: svg('bathrooms'), ...BLUE },
  { key: 'type', label: t('catalog.type', 'Tipo de propiedad'), icon: svg('type'), ...BLUE },
  { key: 'status', label: t('catalog.status', 'Estado'), icon: svg('status'), ...BLUE },
  { key: 'features', label: t('catalog.features', 'Características'), icon: svg('features'), fg: '#5873a6', bg: '#e8edf6' },
])

const GROUP_KEYS: Record<string, string[]> = {
  location: ['municipality', 'neighborhood', 'postalCode', 'lat'],
  price: ['minPrice', 'maxPrice'],
  area: ['minArea', 'maxArea'],
  bedrooms: ['bedrooms'],
  bathrooms: ['bathrooms'],
  type: ['type'],
  status: ['status'],
  features: ['terrace', 'pool', 'garage', 'garden', 'elevator', 'pets', 'accessible'],
}
const activeIn = (k: string) => GROUP_KEYS[k].some((q) => props.query[q] != null && props.query[q] !== '')

// Abiertos al montar: Ubicación (como la referencia) y los que ya traen un
// filtro puesto (p. ej. al abrir el cajón del móvil con filtros en la URL).
const open = ref<Set<string>>(new Set(['location', ...Object.keys(GROUP_KEYS).filter(activeIn)]))
const isOpen = (k: string) => open.value.has(k)
function toggle(k: string) {
  const next = new Set(open.value)
  if (next.has(k)) next.delete(k)
  else next.add(k)
  open.value = next
}

// --- Ubicación ---
type LocMode = 'municipality' | 'neighborhood' | 'postalCode'
const locModes = computed<{ key: LocMode; label: string }[]>(() => [
  { key: 'municipality', label: t('catalog.municipality', 'Municipio') },
  { key: 'neighborhood', label: t('catalog.neighborhood', 'Barrio o zona') },
  { key: 'postalCode', label: t('catalog.postalCode', 'Código postal') },
])
const locMode = ref<LocMode>(props.query.postalCode ? 'postalCode' : props.query.neighborhood ? 'neighborhood' : 'municipality')
watch(
  () => [props.query.municipality, props.query.neighborhood, props.query.postalCode],
  () => {
    if (props.query.postalCode) locMode.value = 'postalCode'
    else if (props.query.neighborhood) locMode.value = 'neighborhood'
    else if (props.query.municipality) locMode.value = 'municipality'
  },
)
const locOptions = computed(() => {
  const f = props.facets || {}
  const list = locMode.value === 'postalCode' ? f.postalCodes : locMode.value === 'neighborhood' ? f.neighborhoods : f.municipalities
  const current = props.query[locMode.value]
  return [...new Set([...(list || []), ...(current ? [String(current)] : [])])]
})
const locValue = computed(() => String(props.query[locMode.value] || ''))
function setLocMode(m: LocMode) {
  locMode.value = m
}
function onLocation(v: string) {
  emit('patch', { municipality: undefined, neighborhood: undefined, postalCode: undefined, [locMode.value]: v || undefined, page: undefined })
}
const circle = computed(() => nearbyFromQuery(props.query))

// --- Números ---
// Lo que se escribe en mínimo/máximo vive aquí hasta confirmarlo. Antes el
// campo iba ligado a la URL con `:value` y Vue lo reescribe en cada repintado:
// si llegaban los resultados del mínimo mientras se tecleaba el máximo, lo
// tecleado se borraba y ese filtro se perdía. Sólo se copia de la URL el
// valor que cambia en ella (quitar un chip, «Limpiar todo»…).
const RANGE_KEYS = ['minPrice', 'maxPrice', 'minArea', 'maxArea'] as const
const drafts = reactive<Record<string, string>>(Object.fromEntries(RANGE_KEYS.map((k) => [k, String(props.query[k] || '')])))
watch(
  () => RANGE_KEYS.map((k) => String(props.query[k] || '')),
  (now, before) => {
    RANGE_KEYS.forEach((k, i) => {
      if (now[i] !== before?.[i]) drafts[k] = now[i]
    })
  },
)
function onNumber(key: string, raw: string) {
  const n = Math.round(Number(raw))
  emit('patch', { [key]: Number.isFinite(n) && n > 0 ? String(n) : undefined, page: undefined })
}

// --- Estado y características ---
const STATUS_FALLBACK: Record<string, string> = { new: 'Obra nueva', under_construction: 'En construcción', ready: 'Listo para entrar' }
const STATUS_KEYS: Record<string, string> = { new: 'filters.status.new', under_construction: 'filters.status.underConstruction', ready: 'filters.status.ready' }
const statusOptions = computed(() => (props.facets?.statuses?.length ? props.facets.statuses : ['new', 'under_construction', 'ready']).filter((s) => STATUS_FALLBACK[s]))
const statusLabel = (s: string) => t(STATUS_KEYS[s], STATUS_FALLBACK[s])
const featureOptions = computed(() => [
  { key: 'terrace', label: t('filters.feature.terrace', 'Terraza') },
  { key: 'pool', label: t('filters.feature.pool', 'Piscina') },
  { key: 'garage', label: t('filters.feature.garage', 'Garaje') },
  { key: 'garden', label: t('filters.feature.garden', 'Jardín') },
  { key: 'elevator', label: t('filters.feature.elevator', 'Ascensor') },
  { key: 'pets', label: t('filters.feature.pets', 'Admite mascotas') },
  { key: 'accessible', label: t('filters.feature.accessible', 'Accesible') },
])

const resultsLabel = computed(() => (props.total === 1 ? t('catalog.showOne', 'Ver 1 resultado') : `${t('catalog.show', 'Ver')} ${props.total.toLocaleString(intlLocale.value)} ${t('catalog.results', 'resultados')}`))
</script>

<style scoped>
.cf-panel {
  border-radius: 16px;
  background: #f7f4ee;
  padding: 18px 14px 16px;
}
.cf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 14px;
}
.cf-title {
  font-size: 20px;
  font-weight: 700;
  color: #1c1b19;
}
.cf-clear {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #57534e;
}
.cf-clear:hover,
.cf-collapse:hover {
  color: #1c1b19;
}
.cf-collapse {
  display: inline-flex;
  height: 26px;
  width: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: #8a857d;
}
.cf-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cf-group {
  border: 1px solid #ece7df;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(28, 27, 25, 0.04);
}
.cf-group-head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  text-align: left;
}
.cf-icon {
  display: flex;
  height: 30px;
  width: 30px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}
.cf-group-name {
  flex: 1;
  font-size: 14px;
  font-weight: 700;
  color: #1c1b19;
}
.cf-dot {
  height: 7px;
  width: 7px;
  border-radius: 9999px;
  background: #3f6fc2;
}
.cf-chevron {
  color: #57534e;
  transition: transform 0.2s ease;
}
.cf-chevron-open {
  transform: rotate(-90deg);
}
.cf-body {
  padding: 2px 14px 14px;
}
.cf-seg {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.cf-seg-btn {
  border: 1px solid #e3ded6;
  border-radius: 8px;
  padding: 7px 2px;
  font-size: 11.5px;
  white-space: nowrap;
  color: #44403c;
  background: #fff;
}
.cf-seg-on {
  border-color: #1c1b19;
  background: #1c1b19;
  color: #fff;
}
.cf-select-wrap {
  position: relative;
  margin-top: 10px;
  display: block;
}
.cf-select-icon {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: #1c1b19;
  pointer-events: none;
}
.cf-select {
  width: 100%;
  appearance: auto;
  border: 1px solid #e3ded6;
  border-radius: 9px;
  background: #fff;
  padding: 9px 10px 9px 32px;
  font-size: 13px;
  color: #1c1b19;
}
.cf-map {
  position: relative;
  margin-top: 10px;
  height: 118px;
  border-radius: 10px;
  background: #eef0ec;
}
.cf-map-btn {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  background: #fff;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #1c1b19;
  box-shadow: 0 2px 8px rgba(28, 27, 25, 0.15);
}
.cf-range {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.cf-mini {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  color: #78716c;
}
.cf-input {
  width: 100%;
  border: 1px solid #e3ded6;
  border-radius: 9px;
  padding: 8px 10px;
  font-size: 13px;
}
.cf-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cf-pill {
  border: 1px solid #e3ded6;
  border-radius: 9999px;
  padding: 6px 12px;
  font-size: 12px;
  color: #44403c;
  background: #fff;
}
.cf-pill-on {
  border-color: #1c1b19;
  background: #1c1b19;
  color: #fff;
}
.cf-checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.cf-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #44403c;
}
.cf-check input {
  height: 15px;
  width: 15px;
  accent-color: #1c1b19;
}
.cf-more {
  margin-top: 12px;
  width: 100%;
  padding: 4px;
  text-align: center;
  font-size: 12.5px;
  color: #57534e;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.cf-more:hover {
  color: #1c1b19;
}
.cf-results {
  margin-top: 12px;
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 12px;
  background: #16150f;
  padding: 14px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}
.cf-results:hover {
  background: #000;
}
.cf-group-head:focus-visible,
.cf-seg-btn:focus-visible,
.cf-pill:focus-visible,
.cf-results:focus-visible,
.cf-map-btn:focus-visible,
.cf-clear:focus-visible {
  outline: 2px solid #1c1b19;
  outline-offset: 2px;
}
</style>
