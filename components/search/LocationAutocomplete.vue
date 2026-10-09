<template>
  <div ref="root" class="loc-ac" :class="`loc-ac-${variant}`" data-testid="location-autocomplete">
    <!-- Ubicaciones elegidas: cada una con su ×; se buscan todas a la vez (unión) -->
    <ul v-if="modelValue.length || mapArea" class="loc-chips" :aria-label="t('location.selected', 'Ubicaciones elegidas')">
      <li v-for="l in modelValue" :key="locationKey(l)" class="loc-chip" :data-location="l.value">
        <span class="truncate">{{ l.value }}</span>
        <button type="button" class="loc-chip-x" :aria-label="`${t('catalog.removeFilter', 'Quitar')} ${l.value}`" @click="remove(l)">
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
      <svg class="loc-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.3a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.7" r="2.5" /></svg>
      <input
        ref="input"
        v-model="text"
        type="text"
        role="combobox"
        class="loc-input"
        autocomplete="off"
        spellcheck="false"
        :placeholder="modelValue.length ? t('location.addAnother', 'Añadir otra zona…') : placeholder || t('location.placeholder', 'Municipio, barrio, zona o código postal')"
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
    </div>

    <div v-if="open" :id="listId" class="loc-pop" role="listbox" :aria-label="t('hero.location', 'Ubicación')" data-testid="location-suggestions">
      <p v-if="loading && !items.length" class="loc-state" data-testid="location-loading">{{ t('location.loading', 'Buscando…') }}</p>
      <p v-else-if="error" class="loc-state loc-state-error">{{ t('location.error', 'No se pudieron cargar las sugerencias. Inténtalo de nuevo.') }}</p>
      <p v-else-if="!items.length && text.trim()" class="loc-state" data-testid="location-empty">{{ t('location.empty', 'Ninguna zona con propiedades coincide con «{q}».').replace('{q}', text.trim()) }}</p>
      <template v-for="g in grouped" :key="g.kind">
        <p class="loc-group">{{ groupLabel(g.kind) }}</p>
        <div
          v-for="it in g.items"
          :id="`${listId}-${it.index}`"
          :key="`${it.kind}:${it.value}`"
          role="option"
          class="loc-opt"
          :class="{ 'loc-opt-active': it.index === active, 'loc-opt-selected': isSelected(it) }"
          :aria-selected="isSelected(it)"
          :data-testid="`location-option-${it.kind}`"
          :data-value="it.value"
          @mousedown.prevent
          @mouseenter="active = it.index"
          @click="pick(it)"
        >
          <span class="min-w-0">
            <span class="loc-opt-name">{{ it.value }}</span>
            <span class="loc-opt-ctx">{{ kindLabel(it.kind) }}<template v-if="it.context"> · {{ it.context }}</template></span>
          </span>
          <span class="loc-opt-count">{{ it.count }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LOCATION_GROUP_LABELS, LOCATION_KIND_LABELS, MAX_LOCATIONS, locationKey, type LocationKind, type LocationSelection } from '~/utils/searchState'

/**
 * Campo «Ubicación» del buscador (Hero y panel de Propiedades): sugerencias
 * reales mientras se escribe (/api/public/location-suggest — municipios,
 * barrios y zonas, códigos postales, provincias y calles con propiedades
 * publicadas de esta agencia), sin tildes ni mayúsculas, con debounce y sin
 * pintar respuestas viejas. Varias ubicaciones a la vez, como chips; la
 * búsqueda las une. Se guarda el tipo y el nombre real de cada una, nunca un
 * texto suelto. Teclado: ↑ ↓ para moverse, Enter para elegir, Escape para
 * cerrar, Retroceso en el campo vacío quita la última.
 */
const props = withDefaults(defineProps<{ modelValue: LocationSelection[]; variant?: 'hero' | 'panel'; placeholder?: string; mapArea?: boolean }>(), {
  variant: 'panel',
  placeholder: '',
  mapArea: false,
})
const emit = defineEmits<{ 'update:modelValue': [LocationSelection[]]; 'clear-map-area': []; picked: [LocationSelection] }>()

const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const listId = `loc-${useId()}`
const text = ref('')
const open = ref(false)
const loading = ref(false)
const error = ref(false)
const active = ref(-1)
interface Item {
  kind: LocationKind
  value: string
  context: string | null
  count: number
}
const items = ref<Item[]>([])

const KIND_ORDER: LocationKind[] = ['municipality', 'neighborhood', 'postalCode', 'province', 'street']
const grouped = computed(() => {
  let index = 0
  return KIND_ORDER.map((kind) => ({ kind, items: items.value.filter((i) => i.kind === kind).map((i) => ({ ...i, index: index++ })) })).filter((g) => g.items.length)
})
const flat = computed(() => grouped.value.flatMap((g) => g.items))

const groupLabel = (k: LocationKind) => t(LOCATION_GROUP_LABELS[k][0], LOCATION_GROUP_LABELS[k][1])
const kindLabel = (k: LocationKind) => t(LOCATION_KIND_LABELS[k][0], LOCATION_KIND_LABELS[k][1])
const isSelected = (it: Item) => props.modelValue.some((l) => locationKey(l) === locationKey(it))

// Sólo cuenta la última petición: una respuesta lenta de «Ov» no pisa la de «Ovie».
// Enter con la respuesta aún en camino elige la primera de ESA respuesta, nunca
// una de la lista anterior.
let pickFirstWhenReady = false
let seq = 0
let controller: AbortController | null = null
let timer: ReturnType<typeof setTimeout> | null = null
async function fetchSuggestions(q: string) {
  const mine = ++seq
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = false
  try {
    const res = await $fetch<{ items: Item[] }>('/api/public/location-suggest', { query: { q }, signal: controller.signal })
    if (mine !== seq) return
    items.value = res.items
    active.value = res.items.length && q ? 0 : -1
    if (pickFirstWhenReady) {
      pickFirstWhenReady = false
      if (flat.value[0] && q) pick(flat.value[0])
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
function pick(it: Item) {
  pickFirstWhenReady = false
  if (!isSelected(it) && props.modelValue.length < MAX_LOCATIONS) {
    const sel = { kind: it.kind, value: it.value }
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
    const it = flat.value[active.value] ?? (text.value.trim() ? flat.value[0] : undefined)
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
  gap: 4px;
  border-radius: 999px;
  border: 1px solid #e7e2d9;
  background: #fff;
  padding: 4px 6px 4px 11px;
  font-size: 12.5px;
  font-weight: 600;
  color: #1c1b19;
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
  background: #f1eee8;
  color: #1c1b19;
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
  border: 1px solid #e7e2d9;
  background: #fff;
  padding: 10px 12px 10px 34px;
  font-size: 14px;
  color: #1c1b19;
}
.loc-input:focus {
  outline: none;
  border-color: #1c1b19;
}
.loc-input:disabled {
  background: #f7f4ee;
}
.loc-pop {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  /* Por encima del mini mapa del panel (Leaflet pinta sus capas con z-index 400–1000). */
  z-index: 1100;
  max-height: min(60vh, 360px);
  overflow-y: auto;
  border-radius: 14px;
  border: 1px solid #ece8e1;
  background: #fff;
  padding: 6px;
  box-shadow: 0 18px 40px -16px rgba(28, 27, 25, 0.28);
}
.loc-ac-hero .loc-pop {
  min-width: min(92vw, 360px);
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
  color: #a8a29e;
}
.loc-opt {
  display: flex;
  cursor: pointer;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 10px;
  padding: 8px 10px;
}
.loc-opt-active {
  background: #f5f2ec;
}
.loc-opt-selected .loc-opt-name::after {
  content: ' ✓';
  color: #3f6fc2;
}
.loc-opt-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #1c1b19;
}
.loc-opt-ctx {
  display: block;
  font-size: 12px;
  color: #78716c;
}
.loc-opt-count {
  flex-shrink: 0;
  border-radius: 999px;
  background: #f1eee8;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #57534e;
}
</style>
