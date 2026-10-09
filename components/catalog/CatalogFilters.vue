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

    <!-- Comprar | Alquilar: lo primero del panel, una sola a la vez -->
    <div v-if="showOperation" class="cf-op" role="radiogroup" :aria-label="t('catalog.operation', 'Operación')" data-testid="catalog-operation">
      <button
        v-for="op in OPERATIONS"
        :key="op"
        type="button"
        role="radio"
        class="cf-op-btn"
        :class="{ 'cf-op-on': operation === op }"
        :aria-checked="operation === op"
        :data-testid="`catalog-operation-${op}`"
        @click="setOperation(op)"
      >
        {{ op === 'venta' ? t('tab.buy', 'Comprar') : t('tab.rent', 'Alquilar') }}
      </button>
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
          <!-- Ubicación: municipios, barrios, zonas y CP reales, varios a la vez; y el mapa -->
          <template v-if="g.key === 'location'">
            <LocationAutocomplete :model-value="locations" :map-area="hasMapArea" @update:model-value="onLocations" @clear-map-area="emit('patch', { north: undefined, south: undefined, east: undefined, west: undefined, page: undefined })" />
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

          <!-- Precio: el mismo selector de rango que el Hero, con la escala de la operación -->
          <PriceRangeSlider v-else-if="g.key === 'price'" :min="numberQ('minPrice')" :max="numberQ('maxPrice')" :operation="operation" @update="onPrice" />

          <!-- Superficie construida -->
          <div v-else-if="g.key === 'area'" class="cf-range">
            <label v-for="k in (['minArea', 'maxArea'] as const)" :key="k">
              <span class="cf-mini">{{ k === 'minArea' ? t('catalog.min', 'Mínimo') : t('catalog.max', 'Máximo') }}</span>
              <input v-model="drafts[k]" class="cf-input" type="number" inputmode="numeric" min="0" :placeholder="k === 'minArea' ? '0 m²' : t('catalog.noLimit', 'Sin límite')" :data-testid="`catalog-area-${k === 'minArea' ? 'min' : 'max'}`" @change="onNumber(k, ($event.target as HTMLInputElement).value)" >
            </label>
          </div>

          <!-- Habitaciones / Baños: mínimos -->
          <div v-else-if="g.key === 'bedrooms' || g.key === 'bathrooms'" class="cf-pills" role="group" :aria-label="g.label">
            <button
              v-for="n in g.key === 'bedrooms' ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4]"
              :key="n"
              type="button"
              class="cf-pill"
              :class="{ 'cf-pill-on': Number(firstString(query[g.key]) || 0) === n }"
              :aria-pressed="Number(firstString(query[g.key]) || 0) === n"
              :data-testid="`catalog-${g.key}-${n}`"
              @click="emit('patch', { [g.key]: n ? String(n) : undefined, page: undefined })"
            >
              {{ n ? `${n}+` : t('catalog.anyCount', 'Cualquiera') }}
            </button>
          </div>

          <!-- Tipo y subtipo -->
          <TypeTreeFilter v-else-if="g.key === 'type'" :types="typeSel.types" :subtypes="typeSel.subtypes" :available="facets?.types || []" @update="onTypes" />

          <!-- Estado: obra nueva / segunda mano y estado de conservación -->
          <div v-else-if="g.key === 'status'" class="space-y-3">
            <div v-for="row in [NEW_BUILD_KEYS, CONDITION_KEYS]" :key="row[0]" class="cf-pills">
              <button v-for="k in row" :key="k" type="button" class="cf-pill" :class="{ 'cf-pill-on': estado.includes(k) }" :aria-pressed="estado.includes(k)" :data-testid="`catalog-estado-${k}`" @click="toggleEstado(k)">
                {{ t(ESTADO_LABELS[k][0], ESTADO_LABELS[k][1]) }}
              </button>
            </div>
          </div>

          <!-- Situación de la vivienda: sólo lo que la agencia anuncia -->
          <div v-else-if="g.key === 'situation'" class="cf-checks cf-checks-1">
            <label v-for="k in availableSituations" :key="k" class="cf-check">
              <input type="checkbox" :checked="situations.includes(k)" :data-testid="`catalog-situation-${k}`" @change="toggleList('situacion', situations, k)" >
              {{ t(SITUATION_LABELS[k][0], SITUATION_LABELS[k][1]) }}
            </label>
          </div>

          <!-- Alquiler: modalidad y gastos -->
          <div v-else-if="g.key === 'rental'" class="cf-checks cf-checks-1">
            <label v-for="k in RENTAL_TERM_KEYS" :key="k" class="cf-check">
              <input type="checkbox" :checked="rentalTerms.includes(k)" :data-testid="`catalog-rental-${k}`" @change="toggleList('rentalTerm', rentalTerms, k)" >
              {{ t(RENTAL_TERM_LABELS[k][0], RENTAL_TERM_LABELS[k][1]) }}
            </label>
            <label class="cf-check">
              <input type="checkbox" :checked="features.includes('expensesIncluded')" data-testid="catalog-feature-expensesIncluded" @change="toggleFeature('expensesIncluded')" >
              {{ t(FEATURE_LABELS.expensesIncluded![0], FEATURE_LABELS.expensesIncluded![1]) }}
            </label>
          </div>

          <!-- Características, por grupos -->
          <div v-else-if="g.key === 'features'" class="space-y-3">
            <div v-for="fg in FEATURE_GROUPS" :key="fg.key">
              <p class="cf-sub">{{ t(fg.label[0], fg.label[1]) }}</p>
              <div class="cf-checks">
                <label v-for="f in fg.features" :key="f" class="cf-check">
                  <input type="checkbox" :checked="features.includes(f)" :data-testid="`catalog-feature-${f}`" @change="toggleFeature(f)" >
                  {{ t(FEATURE_LABELS[f]![0], FEATURE_LABELS[f]![1]) }}
                </label>
              </div>
              <div v-if="fg.key === 'other'" class="cf-range mt-2">
                <label>
                  <span class="cf-mini">{{ t('compare.spec.orientation', 'Orientación') }}</span>
                  <select class="cf-input" :value="firstString(query.orientation)" data-testid="catalog-orientation" @change="emit('patch', { orientation: ($event.target as HTMLSelectElement).value || undefined, page: undefined })">
                    <option value="">{{ t('catalog.anyCount', 'Cualquiera') }}</option>
                    <option v-for="o in ORIENTATIONS" :key="o.v" :value="o.v">{{ t(o.k, o.l) }}</option>
                  </select>
                </label>
                <label>
                  <span class="cf-mini">{{ t('filters.energyMin', 'Eficiencia energética (mín.)') }}</span>
                  <select class="cf-input" :value="firstString(query.energy)" data-testid="catalog-energy" @change="emit('patch', { energy: ($event.target as HTMLSelectElement).value || undefined, page: undefined })">
                    <option value="">{{ t('catalog.anyCount', 'Cualquiera') }}</option>
                    <option v-for="e in ENERGY_FILTER_LETTERS" :key="e" :value="e">{{ e }}{{ e === 'G' ? '' : '+' }}</option>
                  </select>
                </label>
              </div>
            </div>
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
    <!-- Nueva búsqueda: lo reinicia todo (texto, operación de partida y orden incluidos) -->
    <button v-if="showNewSearch" type="button" class="cf-new" data-testid="catalog-new-search" @click="emit('new-search')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      {{ t('catalog.newSearch', 'Nueva búsqueda') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { nearbyFromQuery } from '~/utils/publicSearch'
import {
  CONDITION_KEYS,
  ESTADO_LABELS,
  FEATURE_GROUPS,
  FEATURE_LABELS,
  LOCATION_KINDS,
  NEW_BUILD_KEYS,
  OPERATIONS,
  RENTAL_TERM_KEYS,
  RENTAL_TERM_LABELS,
  SITUATION_KEYS,
  SITUATION_LABELS,
  bedroomsApply,
  ENERGY_FILTER_LETTERS,
  ORIENTATION_OPTIONS,
  firstString,
  operationSwitchPatch,
  parseAmount,
  parseEstado,
  parseFeatures,
  parseLocations,
  parseRentalTerms,
  parseSituations,
  parseTypes,
  type EstadoKey,
  type LocationSelection,
  type Operation,
} from '~/utils/searchState'
import LocationAutocomplete from '~/components/search/LocationAutocomplete.vue'
import PriceRangeSlider from '~/components/search/PriceRangeSlider.vue'
import TypeTreeFilter from '~/components/search/TypeTreeFilter.vue'

/**
 * Panel de filtros del catálogo público (#109, pages/propiedades/index.vue).
 * Lo primero, Comprar | Alquilar; después los grupos, que se abren y se
 * cierran sin perder lo marcado: Ubicación (sugerencias reales, varias a la
 * vez, y el mapa), Precio (el selector de rango del Hero), Superficie,
 * Habitaciones y Baños (sólo si el tipo elegido los tiene), Tipo y subtipo,
 * Estado, Situación de la vivienda (sólo si alguna propiedad la anuncia),
 * Alquiler (sólo con «Alquilar») y Características por grupos.
 *
 * Todo vive en la URL (utils/searchState.ts): cada cambio se aplica al
 * momento (`patch`) y el servidor filtra el catálogo real
 * (server/utils/properties/publicSearch.ts). «Ver X resultados» dice cuántas
 * hay de verdad. El Constructor decide qué grupos salen, en qué orden y
 * cuáles se abren al cargar; nunca qué se encuentra.
 */
const props = withDefaults(
  defineProps<{
    query: Record<string, any>
    facets?: { types?: string[]; municipalities?: string[]; neighborhoods?: string[]; postalCodes?: string[]; statuses?: string[]; situations?: string[] } | null
    total: number
    items?: { lat?: number | null; lng?: number | null }[]
    collapsible?: boolean
    /** Los grupos que se enseñan y en qué orden (Constructor Web → Propiedades → zona dinámica); sin él, todos en su orden de partida. */
    groupKeys?: string[] | null
    /** Los grupos abiertos al cargar (Constructor); sin él, Ubicación. */
    openKeys?: string[] | null
    /** La operación vigente (la de la URL o la de partida de la web). */
    operation?: Operation
    showOperation?: boolean
    showNewSearch?: boolean
  }>(),
  { facets: null, items: () => [], collapsible: false, groupKeys: null, openKeys: null, operation: 'venta', showOperation: true, showNewSearch: true },
)
const emit = defineEmits<{ patch: [Record<string, any>]; clear: []; 'open-map': []; 'show-results': []; collapse: []; more: []; 'new-search': [] }>()

const { t, intlLocale } = useI18n()
const uid = useId()

const ICONS: Record<string, string> = {
  location: '<path d="M12 21s-7-6.2-7-11.3a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" fill="currentColor"/><circle cx="12" cy="9.7" r="2.6" fill="#fff"/>',
  price: '<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M15.5 8.5A4.5 4.5 0 1 0 15.5 15.5M7 11h6M7 13.5h6" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  area: '<rect x="2.5" y="4" width="19" height="16" rx="3" fill="currentColor"/><text x="12" y="15.6" text-anchor="middle" font-size="8.5" font-weight="700" font-family="system-ui,sans-serif" fill="#fff">m²</text>',
  bedrooms: '<path d="M2 18V6.5M2 12.5h20V18M22 18v-3.5A2.5 2.5 0 0 0 19.5 12H10V9.5A1.5 1.5 0 0 0 8.5 8H4.5A2.5 2.5 0 0 0 2 10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12.5h20v4H2z" fill="currentColor"/>',
  bathrooms: '<path d="M3 12h18v2.5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" fill="currentColor"/><path d="M6 12V6a2 2 0 0 1 3.6-1.2M7 20l-1 1.5M17 20l1 1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  type: '<path d="M3 11 12 3.5 21 11v9a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z" fill="currentColor"/>',
  status: '<path d="M14.7 6.3a4 4 0 0 0 5 5L12 19a2.8 2.8 0 1 1-4-4l7.7-7.7z" fill="currentColor"/><path d="M14.7 6.3 17 4l3 3-2.3 2.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  situation: '<path d="M4 21V8l8-5 8 5v13z" fill="currentColor"/><path d="M9 21v-6h6v6" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="10" r="1.6" fill="#fff"/>',
  rental: '<circle cx="8" cy="12" r="5" fill="currentColor"/><path d="M12.5 12H21M18 12v3M21 12v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="12" r="1.8" fill="#fff"/>',
  features: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.4" fill="currentColor"/><circle cx="10" cy="17" r="2.4" fill="currentColor"/>',
}
const svg = (k: string) => `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[k]}</svg>`

// Colores de la referencia: azul para casi todo, cálidos para precio y superficie.
const BLUE = { fg: '#3f6fc2', bg: '#e6eefb' }
const allGroups = computed(() => [
  { key: 'location', label: t('catalog.location', 'Ubicación'), icon: svg('location'), ...BLUE },
  { key: 'price', label: t('catalog.price', 'Precio'), icon: svg('price'), fg: '#c77a2c', bg: '#fbefe1' },
  { key: 'area', label: t('catalog.area', 'Superficie'), icon: svg('area'), fg: '#9c6a3c', bg: '#f5ebe0' },
  { key: 'bedrooms', label: t('catalog.bedrooms', 'Habitaciones'), icon: svg('bedrooms'), ...BLUE },
  { key: 'bathrooms', label: t('catalog.bathrooms', 'Baños'), icon: svg('bathrooms'), ...BLUE },
  { key: 'type', label: t('catalog.type', 'Tipo de propiedad'), icon: svg('type'), ...BLUE },
  { key: 'status', label: t('catalog.status', 'Estado'), icon: svg('status'), ...BLUE },
  { key: 'situation', label: t('catalog.situation', 'Situación de la vivienda'), icon: svg('situation'), ...BLUE },
  { key: 'rental', label: t('catalog.rental', 'Tipo de alquiler'), icon: svg('rental'), fg: '#3f8f6c', bg: '#e4f3ec' },
  { key: 'features', label: t('catalog.features', 'Características'), icon: svg('features'), fg: '#5873a6', bg: '#e8edf6' },
])

const typeSel = computed(() => parseTypes(props.query))
const availableSituations = computed(() => SITUATION_KEYS.filter((k) => (props.facets?.situations || []).includes(k)))
/** Grupos que no aplican ahora mismo no se enseñan (lo que tengan puesto, sí se ve en su chip). */
function applies(key: string): boolean {
  if (key === 'rental') return props.operation === 'alquiler'
  if (key === 'situation') return availableSituations.value.length > 0
  if (key === 'bedrooms' || key === 'bathrooms') return bedroomsApply(typeSel.value.types, typeSel.value.subtypes)
  return true
}
const groups = computed(() => {
  const byKey = new Map(allGroups.value.map((g) => [g.key, g]))
  const keys = props.groupKeys ?? allGroups.value.map((g) => g.key)
  return keys.map((k) => byKey.get(k)).filter((g): g is (typeof allGroups.value)[number] => !!g && applies(g.key))
})

const GROUP_KEYS: Record<string, string[]> = {
  location: [...LOCATION_KINDS, 'lat', 'north'],
  price: ['minPrice', 'maxPrice'],
  area: ['minArea', 'maxArea'],
  bedrooms: ['bedrooms'],
  bathrooms: ['bathrooms'],
  type: ['type', 'subtype'],
  status: ['estado', 'obra', 'status'],
  situation: ['situacion'],
  rental: ['rentalTerm', 'expensesIncluded'],
  features: [...FEATURE_GROUPS.flatMap((g) => g.features), 'orientation', 'energy'],
}
const activeIn = (k: string) => (GROUP_KEYS[k] || []).some((q) => props.query[q] != null && props.query[q] !== '')

// Abiertos al montar: los del Constructor (o Ubicación) y los que ya traen un
// filtro puesto (p. ej. al abrir el cajón del móvil con filtros en la URL).
// Cerrar un grupo no quita lo que tiene marcado.
const initialOpen = props.openKeys?.length ? props.openKeys : groups.value.some((g) => g.key === 'location') ? ['location'] : groups.value.slice(0, 1).map((g) => g.key)
const open = ref<Set<string>>(new Set([...initialOpen, ...Object.keys(GROUP_KEYS).filter(activeIn)]))
const isOpen = (k: string) => open.value.has(k)
function toggle(k: string) {
  const next = new Set(open.value)
  if (next.has(k)) next.delete(k)
  else next.add(k)
  open.value = next
}

// --- Operación ---
function setOperation(op: Operation) {
  if (op === props.operation) return
  // Fuera sólo lo que no sirve en la otra (precio, alquiler/inversión); lo demás se queda.
  emit('patch', operationSwitchPatch(op))
}

// --- Ubicación ---
const locations = computed(() => parseLocations(props.query))
const hasMapArea = computed(() => ['north', 'south', 'east', 'west'].every((k) => props.query[k] != null && props.query[k] !== ''))
function onLocations(list: LocationSelection[]) {
  const patch: Record<string, any> = { page: undefined }
  for (const kind of LOCATION_KINDS) {
    const values = list.filter((l) => l.kind === kind).map((l) => l.value)
    patch[kind] = values.length ? values : undefined
  }
  emit('patch', patch)
}
const circle = computed(() => nearbyFromQuery(props.query))

// --- Números ---
const numberQ = (k: string) => parseAmount(props.query[k])
function onPrice([min, max]: [number | null, number | null]) {
  emit('patch', { minPrice: min ? String(min) : undefined, maxPrice: max ? String(max) : undefined, page: undefined })
}
// Lo que se escribe en mínimo/máximo vive aquí hasta confirmarlo: si llegan
// resultados mientras se teclea, Vue no lo reescribe ni se pierde.
const RANGE_KEYS = ['minArea', 'maxArea'] as const
const drafts = reactive<Record<string, string>>(Object.fromEntries(RANGE_KEYS.map((k) => [k, firstString(props.query[k])])))
watch(
  () => RANGE_KEYS.map((k) => firstString(props.query[k])),
  (now, before) => {
    RANGE_KEYS.forEach((k, i) => {
      if (now[i] !== before?.[i]) drafts[k] = now[i]!
    })
  },
)
function onNumber(key: string, raw: string) {
  const n = Math.round(Number(raw))
  emit('patch', { [key]: Number.isFinite(n) && n > 0 ? String(n) : undefined, page: undefined })
}

// --- Tipo ---
function onTypes(sel: { types: string[]; subtypes: string[] }) {
  const patch: Record<string, any> = { type: sel.types.length ? sel.types : undefined, subtype: sel.subtypes.length ? sel.subtypes : undefined, page: undefined }
  // Sólo locales, garajes, terrenos…: habitaciones y baños dejan de tener sentido.
  if (!bedroomsApply(sel.types, sel.subtypes)) Object.assign(patch, { bedrooms: undefined, bathrooms: undefined })
  emit('patch', patch)
}

// --- Estado, situación, alquiler y características ---
const estado = computed(() => parseEstado(props.query))
function toggleEstado(k: EstadoKey) {
  const next = estado.value.includes(k) ? estado.value.filter((x) => x !== k) : [...estado.value, k]
  emit('patch', { estado: next.length ? next : undefined, obra: undefined, page: undefined })
}
const situations = computed(() => parseSituations(props.query))
const rentalTerms = computed(() => parseRentalTerms(props.query))
function toggleList(param: string, current: string[], k: string) {
  const next = current.includes(k) ? current.filter((x) => x !== k) : [...current, k]
  emit('patch', { [param]: next.length ? next : undefined, page: undefined })
}
const features = computed(() => parseFeatures(props.query))
function toggleFeature(f: string) {
  const on = !features.value.includes(f)
  emit('patch', { [f]: on ? (f === 'furnished' ? 'yes' : '1') : undefined, page: undefined })
}
const ORIENTATIONS = ORIENTATION_OPTIONS

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
.cf-pill:focus-visible,
.cf-results:focus-visible,
.cf-map-btn:focus-visible,
.cf-clear:focus-visible {
  outline: 2px solid #1c1b19;
  outline-offset: 2px;
}
.cf-op {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin: 0 0 12px;
  border-radius: 12px;
  background: #fff;
  padding: 4px;
  border: 1px solid #ece7df;
}
.cf-op-btn {
  min-height: 42px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #57534e;
}
.cf-op-on {
  background: #1c1b19;
  color: #fff;
}
.cf-sub {
  margin-bottom: 6px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #a8a29e;
}
.cf-checks-1 {
  grid-template-columns: minmax(0, 1fr);
}
.cf-new {
  margin-top: 10px;
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  border: 1px solid #e3ded6;
  background: #fff;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1c1b19;
}
.cf-new:hover {
  border-color: #1c1b19;
}
.cf-op-btn:focus-visible,
.cf-new:focus-visible {
  outline: 2px solid #1c1b19;
  outline-offset: 2px;
}
</style>
