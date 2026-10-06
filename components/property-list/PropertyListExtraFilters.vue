<template>
  <div class="col-span-full grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="property-extra-filters">
    <label class="block">
      <span class="label">Subtipo</span>
      <select :value="modelValue.subtype || ''" class="input" data-testid="filter-subtype" @change="set('subtype', ($event.target as HTMLSelectElement).value)">
        <option value="">Todos</option>
        <option v-for="o in subtypes" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>
    <label class="block">
      <span class="label">Comercial</span>
      <select :value="modelValue.agentId || ''" class="input" data-testid="filter-agent" @change="set('agentId', ($event.target as HTMLSelectElement).value)">
        <option value="">Todos</option>
        <option value="none">Sin comercial</option>
        <option v-for="a in options?.agents || []" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
      </select>
    </label>
    <label class="block">
      <span class="label">Oficina</span>
      <select :value="modelValue.officeId || ''" class="input" data-testid="filter-office" @change="set('officeId', ($event.target as HTMLSelectElement).value)">
        <option value="">Todas</option>
        <option v-for="o in options?.offices || []" :key="o.id" :value="String(o.id)">{{ o.name }}</option>
      </select>
    </label>
    <label class="block">
      <span class="label">Propietario (nombre, email o teléfono)</span>
      <input :value="modelValue.owner || ''" class="input" placeholder="p. ej. García" data-testid="filter-owner" @change="set('owner', ($event.target as HTMLInputElement).value.trim())">
    </label>
    <label class="block">
      <span class="label">Barrio / urbanización</span>
      <input :value="modelValue.neighborhood || ''" class="input" data-testid="filter-neighborhood" @change="set('neighborhood', ($event.target as HTMLInputElement).value.trim())">
    </label>
    <label class="block">
      <span class="label">Municipio</span>
      <input :value="modelValue.municipality || ''" class="input" data-testid="filter-municipality" @change="set('municipality', ($event.target as HTMLInputElement).value.trim())">
    </label>
    <label v-if="catalog === 'developer'" class="block">
      <span class="label">Publicada en el portal</span>
      <select :value="modelValue.portal || ''" class="input" data-testid="filter-portal" @change="set('portal', ($event.target as HTMLSelectElement).value)">
        <option value="">Cualquiera</option>
        <option v-for="p in options?.portals || []" :key="p.key" :value="p.key">{{ p.label }}</option>
      </select>
    </label>
    <!-- 2ª mano (cierre D1p): el filtro se ve desactivado y explica por qué, en vez de existir y dar siempre cero. -->
    <label v-else class="block">
      <span class="label">Publicada en el portal</span>
      <select class="input" disabled aria-describedby="filter-portal-why" data-testid="filter-portal-unavailable">
        <option>No disponible en 2ª mano</option>
      </select>
      <span id="filter-portal-why" class="mt-1 block text-[11px] text-stone-400">La publicación en portales sólo programa Propiedades (web): en 2ª mano no hay nada por lo que filtrar.</span>
    </label>
    <label class="block">
      <span class="label">Etiqueta</span>
      <select :value="modelValue.tags || ''" class="input" data-testid="filter-tag" @change="set('tags', ($event.target as HTMLSelectElement).value)">
        <option value="">Todas</option>
        <option v-for="t in options?.tags || []" :key="t.id" :value="String(t.id)">{{ t.name }}{{ t.uses ? ` (${t.uses})` : '' }}</option>
      </select>
    </label>

    <fieldset class="col-span-full">
      <legend class="label">Características (debe tenerlas todas)</legend>
      <div class="flex flex-wrap gap-x-5 gap-y-1.5" data-testid="filter-features">
        <label v-for="(label, key) in PROPERTY_FEATURE_LABELS" :key="key" class="flex items-center gap-1.5 text-[13px]">
          <input type="checkbox" :checked="features.includes(key)" :data-testid="`filter-feature-${key}`" @change="toggleFeature(key)">
          {{ label }}
        </label>
      </div>
      <p class="mt-1 text-[11px] text-stone-400">«Piscina» y «Jardín» cuentan también la privada y la comunitaria de la ficha.</p>
    </fieldset>

    <!-- «Más características» (cierre D1p): cualquier sí/no de la ficha ampliada, por bloque, con su rótulo de la ficha. -->
    <details class="col-span-full rounded-lg border border-line px-3 py-2" :open="amenities.length > 0" data-testid="filter-amenities">
      <summary class="cursor-pointer text-[13px] font-medium text-ink">
        Más características
        <span v-if="amenities.length" class="ml-1 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">{{ amenities.length }}</span>
        <span class="ml-1 text-[11px] font-normal text-stone-400">(edificio, vivienda, instalaciones, zonas comunes y exterior; debe tenerlas todas)</span>
      </summary>
      <div class="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="g in PROPERTY_AMENITY_FILTER_GROUPS" :key="g.key">
          <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">{{ g.label }}</p>
          <label v-for="f in g.fields" :key="f.key" class="flex items-center gap-1.5 py-0.5 text-[13px]">
            <input type="checkbox" :checked="amenities.includes(f.key)" :data-testid="`filter-amenity-${f.key}`" @change="toggleAmenity(f.key)">
            {{ f.label }}
          </label>
        </div>
      </div>
    </details>

    <!-- Campos personalizados (FASE 0) -->
    <fieldset v-if="options?.customFields?.length" class="col-span-full" data-testid="filter-custom-fields">
      <legend class="label">Campo personalizado</legend>
      <div class="flex flex-wrap items-end gap-2">
        <select v-model="cfId" class="input !w-56" aria-label="Campo personalizado" data-testid="filter-cf-field">
          <option value="">Elige un campo…</option>
          <option v-for="d in options.customFields" :key="d.id" :value="String(d.id)">{{ d.label }}</option>
        </select>
        <template v-if="cfDef">
          <select v-if="cfDef.fieldType === 'select' || cfDef.fieldType === 'multiselect'" v-model="cfValue" class="input !w-48" aria-label="Valor">
            <option value="">Elige…</option>
            <option v-for="o in cfDef.options" :key="o" :value="o">{{ o }}</option>
          </select>
          <select v-else-if="cfDef.fieldType === 'boolean'" v-model="cfValue" class="input !w-32" aria-label="Valor">
            <option value="">Elige…</option>
            <option value="1">Sí</option>
            <option value="0">No</option>
          </select>
          <template v-else-if="cfDef.fieldType === 'number' || cfDef.fieldType === 'date'">
            <input v-model="cfMin" :type="cfDef.fieldType === 'date' ? 'date' : 'number'" class="input !w-36" :placeholder="cfDef.fieldType === 'date' ? '' : 'Desde'" aria-label="Desde">
            <input v-model="cfMax" :type="cfDef.fieldType === 'date' ? 'date' : 'number'" class="input !w-36" :placeholder="cfDef.fieldType === 'date' ? '' : 'Hasta'" aria-label="Hasta">
          </template>
          <input v-else v-model="cfValue" class="input !w-48" placeholder="Contiene…" aria-label="Valor" data-testid="filter-cf-value">
          <button type="button" class="btn-quiet !py-2" :disabled="!canAddCf" data-testid="filter-cf-add" @click="addCf">Añadir filtro</button>
        </template>
      </div>
    </fieldset>

    <!-- Búsqueda por coordenadas (FASE 2): un punto y un radio. La zona visible se elige en el mapa. -->
    <fieldset class="col-span-full" data-testid="filter-coords">
      <legend class="label">Cerca de unas coordenadas</legend>
      <div class="flex flex-wrap items-end gap-2">
        <input v-model="geoLat" type="number" step="any" class="input !w-36" placeholder="Latitud" aria-label="Latitud" data-testid="filter-lat">
        <input v-model="geoLng" type="number" step="any" class="input !w-36" placeholder="Longitud" aria-label="Longitud" data-testid="filter-lng">
        <input v-model="geoRadius" type="number" min="0.1" max="500" step="0.1" class="input !w-28" placeholder="Radio (km)" aria-label="Radio en km" data-testid="filter-radius">
        <button type="button" class="btn-quiet !py-2" :disabled="!canApplyRadius" data-testid="filter-coords-apply" @click="applyRadius">Buscar en este radio</button>
        <span class="text-[11px] text-stone-400">Por ejemplo 40.4168, -3.7038 y 2 km. También puedes pulsar en el mapa.</span>
      </div>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import { PROPERTY_AMENITY_FILTER_GROUPS, PROPERTY_FEATURE_LABELS, RADIUS_KEYS, BBOX_KEYS, subtypeOptions, type PropertyFilterOptions } from '~/utils/propertyListFilters'

/**
 * Los filtros del listado de propiedades del bloque N7b (FASE 27: subtipo,
 * comercial, oficina, propietario, portal y características; FASE 2: barrio,
 * municipio y coordenadas; FASE 0: etiquetas y campos personalizados) y del
 * cierre D1p («Más características» de la ficha ampliada; piscina y jardín
 * privados o comunitarios; el portal, desactivado y explicado en 2ª mano). Edita
 * un mapa `clave → texto` con los mismos nombres que la query del servidor;
 * PropertyList.vue lo lleva a la URL, al CSV, a las vistas guardadas y a las
 * acciones masivas.
 */
const props = defineProps<{ modelValue: Record<string, string>; options: PropertyFilterOptions | null; propertyType?: string | null; catalog: 'developer' | 'agent' }>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, string>] }>()

function emitWith(changes: Record<string, string | null>) {
  const next = { ...props.modelValue }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === '') Reflect.deleteProperty(next, k)
    else next[k] = v
  }
  emit('update:modelValue', next)
}
function set(key: string, value: string) {
  emitWith({ [key]: value })
}

const subtypes = computed(() => subtypeOptions(props.propertyType))

const features = computed(() => (props.modelValue.features || '').split(',').filter(Boolean))
function toggleFeature(key: string) {
  const list = features.value.includes(key) ? features.value.filter((f) => f !== key) : [...features.value, key]
  set('features', list.join(','))
}
const amenities = computed(() => (props.modelValue.amenities || '').split(',').filter(Boolean))
function toggleAmenity(key: string) {
  const list = amenities.value.includes(key) ? amenities.value.filter((f) => f !== key) : [...amenities.value, key]
  set('amenities', list.join(','))
}

const cfId = ref('')
const cfValue = ref('')
const cfMin = ref<string | number>('')
const cfMax = ref<string | number>('')
const cfDef = computed(() => props.options?.customFields.find((d) => String(d.id) === cfId.value) || null)
watch(cfId, () => {
  cfValue.value = ''
  cfMin.value = ''
  cfMax.value = ''
})
const canAddCf = computed(() => !!cfDef.value && (String(cfValue.value).trim() !== '' || String(cfMin.value) !== '' || String(cfMax.value) !== ''))
function addCf() {
  if (!cfDef.value) return
  const id = cfDef.value.id
  emitWith({
    [`cf_${id}`]: String(cfValue.value).trim() || null,
    [`cf_${id}_min`]: String(cfMin.value) || null,
    [`cf_${id}_max`]: String(cfMax.value) || null,
  })
  cfId.value = ''
}

const geoLat = ref<string | number>(props.modelValue.lat || '')
const geoLng = ref<string | number>(props.modelValue.lng || '')
const geoRadius = ref<string | number>(props.modelValue.radiusKm || '5')
watch(
  () => [props.modelValue.lat, props.modelValue.lng, props.modelValue.radiusKm],
  ([lat, lng, r]) => {
    geoLat.value = lat || ''
    geoLng.value = lng || ''
    if (r) geoRadius.value = r
  },
)
const canApplyRadius = computed(() => {
  const lat = Number(geoLat.value)
  const lng = Number(geoLng.value)
  const r = Number(geoRadius.value)
  return String(geoLat.value) !== '' && String(geoLng.value) !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && r > 0 && r <= 500
})
function applyRadius() {
  if (!canApplyRadius.value) return
  // Un radio sustituye a una zona del mapa (son dos formas de acotar lo mismo).
  emitWith({
    ...Object.fromEntries(BBOX_KEYS.map((k) => [k, null])),
    [RADIUS_KEYS[0]]: String(geoLat.value),
    [RADIUS_KEYS[1]]: String(geoLng.value),
    [RADIUS_KEYS[2]]: String(geoRadius.value),
  })
}
</script>
