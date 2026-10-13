<template>
  <div ref="root" class="loc-ac" :class="`loc-ac-${variant}`" data-testid="location-autocomplete">
    <!-- Ubicaciones elegidas: cada una con su ×; se buscan todas a la vez (unión) -->
    <ul v-if="modelValue.length || mapArea" class="loc-chips" :aria-label="t('location.selected', 'Ubicaciones elegidas')">
      <li v-for="l in modelValue" :key="locationKey(l)" class="loc-chip" :class="{ 'loc-chip-covered': coveredById(l) }" :data-location="l.value" :data-location-id="l.id || ''" :title="coveredTitle(l)">
        <LocationKindIcon :kind="l.kind" class="loc-chip-icon" />
        <span class="truncate">{{ chipLabel(l) }}</span>
        <span v-if="coveredById(l)" class="loc-chip-note">{{ t('location.within', 'dentro de {parent}').replace('{parent}', nameOf(coveredById(l)!)) }}</span>
        <button type="button" class="loc-chip-x" :aria-label="`${t('catalog.removeFilter', 'Quitar')} ${chipLabel(l)}`" @click="remove(l)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </li>
      <li v-if="mapArea" class="loc-chip loc-chip-map" data-location="map-area">
        <span>{{ t('catalog.mapArea', 'Zona del mapa') }}</span>
        <button type="button" class="loc-chip-x" :aria-label="`${t('catalog.removeFilter', 'Quitar')} ${t('catalog.mapArea', 'Zona del mapa')}`" @click="emit('clear-map-area')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </li>
    </ul>

    <div class="loc-input-wrap">
      <svg class="loc-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 21l-4.3-4.3" /><circle cx="11" cy="11" r="7" /></svg>
      <input
        ref="input"
        v-model="text"
        type="text"
        role="combobox"
        class="loc-input"
        autocomplete="off"
        spellcheck="false"
        :placeholder="modelValue.length ? t('location.addAnother', 'Añadir otra zona…') : placeholder || t('location.placeholder', 'Municipio, barrio, zona, provincia o código postal')"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-activedescendant="active >= 0 ? `${listId}-${active}` : undefined"
        aria-autocomplete="list"
        :disabled="modelValue.length >= MAX_LOCATIONS"
        data-testid="location-input"
        @focus="onFocus"
        @input="onInput"
        @keydown="onKeydown"
      >
      <button v-if="text" type="button" class="loc-input-clear" :aria-label="t('location.clearText', 'Borrar lo escrito')" data-testid="location-clear-text" @mousedown.prevent @click="clearText">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>

    <div v-if="open" :id="listId" class="loc-pop" role="listbox" :aria-label="t('hero.location', 'Ubicación')" data-testid="location-suggestions">
      <p v-if="loading && !items.length" class="loc-state" data-testid="location-loading">{{ t('location.loading', 'Buscando…') }}</p>
      <p v-else-if="error" class="loc-state loc-state-error" data-testid="location-error">{{ t('location.error', 'No se pudieron cargar las sugerencias. Inténtalo de nuevo.') }}</p>
      <p v-else-if="!items.length && text.trim()" class="loc-state" data-testid="location-empty">{{ t('location.empty', 'No encontramos esa ubicación. Prueba con otro nombre o selecciona una zona en el mapa.') }}</p>

      <!-- Sin texto: recientes del visitante (su navegador), lo que la agencia destaca o más tiene, y el mapa -->
      <template v-if="!text.trim() && recent.length">
        <p class="loc-group">{{ t('location.recent', 'Recientes') }}</p>
        <div
          v-for="it in recentRows"
          :id="`${listId}-${it.index}`"
          :key="`r:${locationKey(it)}`"
          role="option"
          class="loc-opt"
          :class="{ 'loc-opt-active': it.index === active, 'loc-opt-selected': isSelected(it) }"
          :aria-selected="isSelected(it)"
          :data-testid="`location-recent-${it.kind}`"
          :data-value="it.value"
          @mousedown.prevent
          @mouseenter="active = it.index"
          @click="pick(it)"
        >
          <LocationKindIcon :kind="it.kind" class="loc-opt-icon" />
          <span class="min-w-0">
            <span class="loc-opt-name">{{ it.value }}</span>
            <span class="loc-opt-ctx">{{ kindLabel(it.kind) }}<template v-if="it.context"> · {{ it.context }}</template></span>
          </span>
        </div>
      </template>

      <template v-for="g in grouped" :key="g.kind">
        <p class="loc-group">{{ !text.trim() && g.kind === grouped[0]?.kind ? t('location.suggestions', 'Sugerencias') + ' · ' + groupLabel(g.kind) : groupLabel(g.kind) }}</p>
        <div
          v-for="it in g.items"
          :id="`${listId}-${it.index}`"
          :key="locationKey(it)"
          role="option"
          class="loc-opt"
          :class="{ 'loc-opt-active': it.index === active, 'loc-opt-selected': isSelected(it) }"
          :aria-selected="isSelected(it)"
          :data-testid="`location-option-${it.kind}`"
          :data-value="it.value"
          :data-location-id="it.id || ''"
          @mousedown.prevent
          @mouseenter="active = it.index"
          @click="pick(it)"
        >
          <LocationKindIcon :kind="it.kind" class="loc-opt-icon" />
          <span class="min-w-0">
            <span class="loc-opt-name">{{ it.value }}</span>
            <span class="loc-opt-ctx">{{ kindLabel(it.kind) }}<template v-if="it.context"> · {{ it.context }}</template></span>
          </span>
          <span v-if="it.count != null" class="loc-opt-count" :title="t('location.countTitle', 'Propiedades publicadas aquí')">{{ it.count }}</span>
        </div>
      </template>

      <!-- Herramientas del mapa: sólo las que existen de verdad -->
      <div v-if="mapActions && !text.trim()" class="loc-actions">
        <button type="button" class="loc-action" data-testid="location-map-select" @mousedown.prevent @click="emit('map-action', 'select')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 20 3 17V4l6 3 6-3 6 3v13l-6-3-6 3z" /><path d="M9 7v13M15 4v13" /></svg>
          {{ t('location.mapSelect', 'Seleccionar en el mapa') }}
        </button>
        <button type="button" class="loc-action" data-testid="location-map-nearby" @mousedown.prevent @click="emit('map-action', 'nearby')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>
          {{ t('location.mapNearby', 'Buscar alrededor de un punto') }}
        </button>
      </div>
      <p v-if="!text.trim() && sourceNote" class="loc-source">{{ sourceNote }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import LocationKindIcon from '~/components/search/LocationKindIcon.vue'
import { LOCATION_DISPLAY_ORDER, LOCATION_GROUP_LABELS, LOCATION_KIND_LABELS, MAX_LOCATIONS, coveredBy, locationKey, type LocationKind, type LocationSelection } from '~/utils/searchState'

/**
 * Campo «Ubicación» del buscador (Hero y panel de Propiedades), el mismo en
 * todas las webs: autocompletado geográfico sobre entidades REALES
 * (/api/public/location-suggest: comunidades, provincias, municipios, barrios y
 * localidades y códigos postales del catálogo de España, con id canónico;
 * las calles y nombres propios del inventario de la agencia; sus zonas),
 * tolerante a tildes, mayúsculas, prefijos, texto parcial y errores
 * razonables, con un ranking determinista. Varias a la vez, como chips (una
 * contenida en otra elegida se avisa); sin escribir, recientes del visitante,
 * lo destacado por la agencia y el acceso al mapa. Con debounce, sin pintar
 * respuestas viejas y con caché por texto. Teclado: ↑ ↓, Enter, Escape y
 * Retroceso en el campo vacío quita la última.
 */
const props = withDefaults(defineProps<{ modelValue: LocationSelection[]; variant?: 'hero' | 'panel'; placeholder?: string; mapArea?: boolean; mapActions?: boolean; maxSuggestions?: number }>(), {
  variant: 'panel',
  placeholder: '',
  mapArea: false,
  mapActions: false,
  maxSuggestions: 14,
})
const emit = defineEmits<{ 'update:modelValue': [LocationSelection[]]; 'clear-map-area': []; picked: [LocationSelection]; 'map-action': ['select' | 'nearby'] }>()

const { t } = useI18n()
const { remember } = useLocationNames()
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const listId = `loc-${useId()}`
const text = ref('')
const open = ref(false)
const loading = ref(false)
const error = ref(false)
const active = ref(-1)
interface Item extends LocationSelection {
  count: number | null
  source?: 'catalog' | 'inventory' | 'zone'
}
const items = ref<Item[]>([])
const sourceNote = ref('')

// --- Recientes del visitante: sólo en su navegador, nunca en el servidor ---
const RECENT_KEY = 'inmo:recent-locations'
const recent = ref<LocationSelection[]>([])
function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const list = raw ? (JSON.parse(raw) as LocationSelection[]) : []
    recent.value = Array.isArray(list) ? list.filter((l) => l && typeof l.value === 'string' && l.kind).slice(0, 5) : []
  } catch {
    recent.value = []
  }
}
function pushRecent(sel: LocationSelection) {
  try {
    const next = [sel, ...recent.value.filter((l) => locationKey(l) !== locationKey(sel))].slice(0, 5)
    recent.value = next
    localStorage.setItem(RECENT_KEY, JSON.stringify(next.map(({ kind, value, id, context }) => ({ kind, value, id, context }))))
  } catch {
    // Sin almacenamiento (modo privado): sin recientes, nada más.
  }
}

// --- Lista plana para el teclado: recientes (sin texto) + grupos ---
const recentRows = computed(() => (text.value.trim() ? [] : recent.value.filter((r) => !isSelected(r)).map((r, index) => ({ ...r, index }))))
const grouped = computed(() => {
  let index = recentRows.value.length
  // Los grupos salen en el orden en que el servidor los manda (por su mejor coincidencia).
  const order: LocationKind[] = []
  for (const i of items.value) if (!order.includes(i.kind)) order.push(i.kind)
  const sorted = order.sort((a, b) => (items.value.findIndex((i) => i.kind === a) - items.value.findIndex((i) => i.kind === b)) || LOCATION_DISPLAY_ORDER.indexOf(a) - LOCATION_DISPLAY_ORDER.indexOf(b))
  return sorted.map((kind) => ({ kind, items: items.value.filter((i) => i.kind === kind).map((i) => ({ ...i, index: index++ })) })).filter((g) => g.items.length)
})
const flat = computed<Array<LocationSelection & { index: number }>>(() => [...recentRows.value, ...grouped.value.flatMap((g) => g.items)])

const groupLabel = (k: LocationKind) => t(LOCATION_GROUP_LABELS[k][0], LOCATION_GROUP_LABELS[k][1])
const kindLabel = (k: LocationKind) => t(LOCATION_KIND_LABELS[k][0], LOCATION_KIND_LABELS[k][1])
const isSelected = (it: LocationSelection) => props.modelValue.some((l) => locationKey(l) === locationKey(it))
const chipLabel = (l: LocationSelection) => (l.kind === 'postalCode' ? `CP ${l.value || l.id?.slice('es:cp:'.length) || ''}` : l.value || l.id || '')
const parentsOf = (id: string) => props.modelValue.find((l) => l.id === id)?.parents ?? []
const coveredById = (l: LocationSelection) => coveredBy(l, props.modelValue, parentsOf)
const nameOf = (id: string) => chipLabel(props.modelValue.find((l) => l.id === id) ?? { kind: 'municipality', value: id })
const coveredTitle = (l: LocationSelection) => {
  const p = coveredById(l)
  return p ? t('location.withinTitle', 'Ya está incluida en {parent}: la búsqueda no cambia').replace('{parent}', nameOf(p)) : undefined
}

// --- Peticiones: sólo cuenta la última; caché por texto; Enter con la respuesta en camino elige la primera de ESA respuesta ---
const cache = new Map<string, { items: Item[]; source: string }>()
let pickFirstWhenReady = false
let seq = 0
let controller: AbortController | null = null
let timer: ReturnType<typeof setTimeout> | null = null
async function fetchSuggestions(q: string) {
  const mine = ++seq
  controller?.abort()
  error.value = false
  const hit = cache.get(q)
  if (hit) {
    items.value = hit.items
    sourceNote.value = hit.source
    loading.value = false
    active.value = hit.items.length && q ? recentRows.value.length : -1
    if (pickFirstWhenReady) {
      pickFirstWhenReady = false
      if (q && flat.value[recentRows.value.length]) pick(flat.value[recentRows.value.length]!)
    }
    return
  }
  controller = new AbortController()
  loading.value = true
  try {
    const res = await $fetch<{ items: Item[]; source?: string }>('/api/public/location-suggest', { query: { q, limit: props.maxSuggestions }, signal: controller.signal })
    if (mine !== seq) return
    const source = res.source ? t('location.source', 'Catálogo geográfico: {source}').replace('{source}', res.source) : ''
    if (cache.size > 120) cache.delete(cache.keys().next().value!)
    cache.set(q, { items: res.items, source })
    items.value = res.items
    sourceNote.value = source
    active.value = res.items.length && q ? recentRows.value.length : -1
    if (pickFirstWhenReady) {
      pickFirstWhenReady = false
      if (q && flat.value[recentRows.value.length]) pick(flat.value[recentRows.value.length]!)
    }
  } catch (e: any) {
    if (mine !== seq || e?.name === 'AbortError') return
    pickFirstWhenReady = false
    error.value = true
    items.value = []
  } finally {
    if (mine === seq) loading.value = false
  }
}
function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => fetchSuggestions(text.value.trim()), 200)
}

function onFocus() {
  open.value = true
  loadRecent()
  if (!items.value.length) fetchSuggestions(text.value.trim())
}
function onInput() {
  open.value = true
  // Lo que se ve es siempre de lo escrito: fuera la lista anterior mientras llega la nueva.
  items.value = []
  active.value = -1
  pickFirstWhenReady = false
  loading.value = true
  schedule()
}
function clearText() {
  text.value = ''
  items.value = []
  open.value = true
  fetchSuggestions('')
  input.value?.focus()
}
function pick(it: LocationSelection) {
  pickFirstWhenReady = false
  if (!isSelected(it) && props.modelValue.length < MAX_LOCATIONS) {
    const sel: LocationSelection = { kind: it.kind, value: it.value, ...(it.id ? { id: it.id } : {}), context: it.context ?? null, ...(it.parents ? { parents: it.parents } : {}) }
    remember([sel])
    pushRecent(sel)
    emit('update:modelValue', [...props.modelValue, sel])
    emit('picked', sel)
  }
  text.value = ''
  open.value = false
  active.value = -1
  items.value = []
}
function remove(l: LocationSelection) {
  emit('update:modelValue', props.modelValue.filter((x) => locationKey(x) !== locationKey(l)))
  nextTick(() => input.value?.focus())
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    open.value = true
    if (flat.value.length) active.value = (active.value + 1) % flat.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (flat.value.length) active.value = active.value <= 0 ? flat.value.length - 1 : active.value - 1
  } else if (e.key === 'Enter') {
    if (open.value && loading.value && text.value.trim()) {
      e.preventDefault()
      pickFirstWhenReady = true
      return
    }
    const it = flat.value[active.value] ?? (text.value.trim() ? flat.value[recentRows.value.length] : undefined)
    if (open.value && it) {
      e.preventDefault()
      pick(it)
    }
  } else if (e.key === 'Escape') {
    if (open.value) {
      e.stopPropagation()
      open.value = false
    }
  } else if (e.key === 'Backspace' && !text.value && props.modelValue.length) {
    remove(props.modelValue[props.modelValue.length - 1]!)
  }
}

function onDocDown(e: Event) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocDown))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocDown)
  if (timer) clearTimeout(timer)
  controller?.abort()
})

defineExpose({ focus: () => input.value?.focus() })
</script>

<style scoped>
.loc-ac {
  position: relative;
  font-family: var(--sb-font-body, inherit);
}
.loc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.loc-chip {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  border: 1px solid var(--sb-line, #e7e2d9);
  background: var(--sb-surface, #fff);
  padding: 4px 6px 4px 9px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--sb-ink, #1c1b19);
}
.loc-chip-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: var(--sb-muted, #a8a29e);
}
.loc-chip-covered {
  border-style: dashed;
  color: var(--sb-muted-ink, #57534e);
}
.loc-chip-note {
  font-size: 11px;
  font-weight: 500;
  color: var(--sb-muted, #a8a29e);
}
.loc-chip-map {
  background: #eef3fb;
  border-color: #d5e1f5;
}
.loc-chip-x {
  display: inline-flex;
  height: 20px;
  width: 20px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #78716c;
}
.loc-chip-x:hover {
  background: var(--sb-paper, #f1eee8);
  color: var(--sb-ink, #1c1b19);
}
.loc-input-wrap {
  position: relative;
}
.loc-input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #a8a29e;
  pointer-events: none;
}
.loc-input {
  width: 100%;
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid var(--sb-line, #e7e2d9);
  background: var(--sb-surface, #fff);
  padding: 10px 34px 10px 34px;
  font-size: 14px;
  color: var(--sb-ink, #1c1b19);
}
.loc-input:focus {
  outline: none;
  border-color: var(--sb-ink, #1c1b19);
}
.loc-input:disabled {
  background: var(--sb-paper, #f7f4ee);
}
.loc-input-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  display: inline-flex;
  height: 24px;
  width: 24px;
  transform: translateY(-50%);
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #78716c;
}
.loc-input-clear:hover {
  background: var(--sb-paper, #f1eee8);
  color: var(--sb-ink, #1c1b19);
}
.loc-pop {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  /* Por encima del mini mapa del panel (Leaflet pinta sus capas con z-index 400–1000). */
  z-index: 1100;
  max-height: min(60vh, 400px);
  overflow-y: auto;
  border-radius: 14px;
  border: 1px solid var(--sb-line, #ece8e1);
  background: var(--sb-surface, #fff);
  padding: 6px;
  box-shadow: 0 18px 40px -16px rgba(28, 27, 25, 0.28);
}
.loc-ac-hero .loc-pop {
  min-width: min(92vw, 380px);
}
.loc-state {
  padding: 12px 10px;
  font-size: 13px;
  color: #78716c;
}
.loc-state-error {
  color: #b91c1c;
}
.loc-group {
  padding: 8px 10px 4px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sb-muted, #a8a29e);
}
.loc-opt {
  display: flex;
  cursor: pointer;
  align-items: center;
  gap: 10px;
  border-radius: 10px;
  padding: 8px 10px;
  text-align: left;
}
.loc-opt:hover,
.loc-opt-active {
  background: var(--sb-paper, #f6f3ee);
}
.loc-opt-selected {
  opacity: 0.55;
}
.loc-opt-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--sb-muted-ink, #57534e);
}
.loc-opt-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--sb-ink, #1c1b19);
}
.loc-opt-ctx {
  display: block;
  font-size: 12px;
  color: #78716c;
}
.loc-opt-count {
  margin-left: auto;
  flex-shrink: 0;
  border-radius: 999px;
  background: var(--sb-paper, #f1eee8);
  padding: 2px 8px;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--sb-muted-ink, #57534e);
}
.loc-actions {
  display: grid;
  gap: 2px;
  border-top: 1px solid var(--sb-line, #ece8e1);
  margin-top: 6px;
  padding-top: 6px;
}
.loc-action {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 10px;
  padding: 9px 10px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--sb-ink, #1c1b19);
  text-align: left;
}
.loc-action:hover {
  background: var(--sb-paper, #f6f3ee);
}
.loc-source {
  padding: 6px 10px 4px;
  font-size: 10.5px;
  color: var(--sb-muted, #a8a29e);
}
</style>
