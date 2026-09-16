<template>
  <div>
    <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ config.title }}</h1>
        <p class="mt-1 text-sm text-stone-500">{{ data?.total ?? 0 }} propiedad{{ data?.total === 1 ? '' : 'es' }}</p>
      </div>
      <NuxtLink :to="`/admin/${config.resource}/new`" class="btn-primary">+ Nueva propiedad</NuxtLink>
    </div>

    <!-- Search + quick filters + view toggle -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <div class="relative">
        <input v-model="q" class="input !w-64 !pl-8" :placeholder="config.searchPlaceholder" @keyup.enter="applyAndReset" >
        <svg class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-350" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path stroke-linecap="round" d="m21 21-4.3-4.3" /></svg>
        <button v-if="q" type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-stone-350 hover:text-ink" title="Limpiar búsqueda" @click="q = ''; applyAndReset()">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="m18 6-12 12M6 6l12 12" /></svg>
        </button>
      </div>

      <select v-model="status" class="input !w-40" @change="applyAndReset">
        <option value="">Todos los estados</option>
        <option v-for="s in config.statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
      <select v-if="config.hasTransactionFilter" v-model="transactionType" class="input !w-40" @change="applyAndReset">
        <option value="">Venta y alquiler</option>
        <option value="sale">Venta</option>
        <option value="rent">Alquiler</option>
      </select>
      <select v-model="propertyType" class="input !w-40" @change="applyAndReset">
        <option value="">Todos los tipos</option>
        <option v-for="t in PROPERTY_LIST_TYPES" :key="t" :value="t">{{ t }}</option>
      </select>
      <select v-model="sort" class="input !w-44">
        <option v-for="s in config.sortOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>

      <button type="button" class="btn-quiet" :class="filtersOpen ? '!border-ink !text-ink' : ''" @click="filtersOpen = !filtersOpen">
        Filtros <span v-if="advancedCount" class="ml-1 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">{{ advancedCount }}</span>
      </button>

      <div class="ml-auto flex rounded-lg border border-line bg-white p-0.5">
        <button type="button" class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="view === 'list' ? 'bg-ink text-white' : 'text-stone-500'" @click="setView('list')">Lista</button>
        <button type="button" class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="view === 'grid' ? 'bg-ink text-white' : 'text-stone-500'" @click="setView('grid')">Grid</button>
      </div>
    </div>

    <!-- Advanced filters panel -->
    <div v-if="filtersOpen" class="card mb-3 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label class="block">
        <span class="label">Precio mínimo</span>
        <input v-model.number="priceMin" type="number" class="input" placeholder="0" >
      </label>
      <label class="block">
        <span class="label">Precio máximo</span>
        <input v-model.number="priceMax" type="number" class="input" placeholder="Sin límite" >
      </label>
      <label class="block">
        <span class="label">País</span>
        <input v-model="country" class="input" >
      </label>
      <label class="block">
        <span class="label">Localidad</span>
        <input v-model="city" class="input" >
      </label>
      <label class="block">
        <span class="label">Distrito</span>
        <input v-model="district" class="input" >
      </label>
      <label class="block">
        <span class="label">Código postal</span>
        <input v-model="postalCode" class="input" >
      </label>
      <label class="block">
        <span class="label">Habitaciones (mín.)</span>
        <input v-model.number="bedroomsMin" type="number" min="0" class="input" >
      </label>
      <label class="block">
        <span class="label">Baños (mín.)</span>
        <input v-model.number="bathroomsMin" type="number" min="0" class="input" >
      </label>
      <label class="block">
        <span class="label">Superficie mín. (m²)</span>
        <input v-model.number="areaMin" type="number" class="input" >
      </label>
      <label class="block">
        <span class="label">Superficie máx. (m²)</span>
        <input v-model.number="areaMax" type="number" class="input" >
      </label>
      <div class="col-span-full flex items-center gap-3">
        <button type="button" class="btn-primary !px-4 !py-2" @click="applyAndReset">Aplicar filtros</button>
        <button type="button" class="text-[13px] font-medium text-stone-500 hover:text-ink" @click="clearAll">Limpiar filtros</button>
      </div>
    </div>

    <!-- Active filter chips -->
    <div v-if="chips.length" class="mb-4 flex flex-wrap items-center gap-2">
      <button v-for="chip in chips" :key="chip.key" type="button" class="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-[12px] font-medium text-stone-600 hover:border-ink" @click="chip.clear">
        {{ chip.label }} <span class="text-stone-400">×</span>
      </button>
      <button type="button" class="text-[12px] font-medium text-stone-400 hover:text-ink hover:underline" @click="clearAll">Limpiar todo</button>
    </div>

    <div v-if="pending" class="py-20 text-center text-sm text-stone-400">Cargando…</div>
    <div v-else-if="!data?.rows?.length" class="card px-4 py-16 text-center">
      <p class="text-sm font-medium text-stone-500">No se han encontrado propiedades</p>
      <p class="mt-1 text-xs text-stone-400">{{ hasActiveFilters ? 'Prueba a ajustar la búsqueda o los filtros.' : 'Crea la primera con "+ Nueva propiedad".' }}</p>
    </div>

    <!-- Grid view -->
    <div v-else-if="view === 'grid'" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <component
        :is="cardComponent"
        v-for="p in data.rows"
        :key="p.id"
        :property="p"
        v-on="cardListeners"
      />
    </div>

    <!-- List view -->
    <div v-else class="card overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-stone-50 text-xs uppercase text-stone-500">
          <tr>
            <th class="px-4 py-3">Propiedad</th>
            <th class="px-4 py-3">Ubicación</th>
            <th class="px-4 py-3">Precio</th>
            <th class="px-4 py-3">Detalles</th>
            <th class="px-4 py-3">Estado</th>
            <th class="px-4 py-3">Actualizado</th>
            <th class="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in data.rows" :key="p.id" class="border-t border-line hover:bg-stone-50">
            <td class="px-4 py-3">
              <NuxtLink :to="`/admin/${config.resource}/${p.id}`" class="flex items-center gap-2.5">
                <img v-if="config.rowImage(p)" :src="mediaUrl(config.rowImage(p)!)" class="h-9 w-9 shrink-0 rounded object-cover" >
                <span v-else class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-stone-100 text-sm">🏠</span>
                <span class="min-w-0">
                  <span class="block truncate font-medium text-ink">{{ config.rowTitle(p) }}</span>
                  <span class="block text-[11px] text-stone-400">Ref. #{{ p.id }}</span>
                </span>
              </NuxtLink>
            </td>
            <td class="px-4 py-3 text-stone-500">{{ config.rowLocation(p) }}</td>
            <td class="px-4 py-3 text-stone-700">{{ formatPrice(p.price) }}</td>
            <td class="px-4 py-3 text-stone-500">
              <span v-if="p.bedrooms != null">{{ p.bedrooms }} hab · </span><span v-if="p.bathrooms != null">{{ p.bathrooms }} baños · </span><span v-if="p.area != null">{{ p.area }} m²</span>
            </td>
            <td class="px-4 py-3">
              <span
                v-for="(chip, i) in config.rowChips(p)"
                :key="chip.label"
                class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                :class="[LIST_CHIP_CLASSES[chip.tone], i > 0 ? 'ml-1' : '']"
              >
                {{ chip.label }}
              </span>
            </td>
            <td class="px-4 py-3 text-stone-450">{{ p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('es-ES') : '—' }}</td>
            <td class="whitespace-nowrap px-4 py-3 text-right text-xs">
              <NuxtLink :to="`/admin/${config.resource}/${p.id}`" class="mr-2 font-medium text-stone-600 hover:underline">Editar</NuxtLink>
              <a v-if="config.previewHref" :href="config.previewHref(p)" target="_blank" rel="noopener" class="mr-2 font-medium text-stone-600 hover:underline">Preview</a>
              <button type="button" class="mr-2 font-medium text-stone-600 hover:underline" @click="applyToggle(p.id)">{{ config.toggle.label(p) }}</button>
              <button type="button" class="mr-2 font-medium text-stone-600 hover:underline" @click="duplicate(p.id)">Duplicar</button>
              <button type="button" class="font-medium text-red-600 hover:underline" @click="remove(p.id)">Eliminar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="mt-4 flex items-center justify-end gap-3 text-sm">
      <button class="btn-secondary !py-1.5" :disabled="page <= 1" @click="page--">← Anterior</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button class="btn-secondary !py-1.5" :disabled="page >= totalPages" @click="page++">Siguiente →</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LIST_CHIP_CLASSES, PROPERTY_LIST_CONFIG, PROPERTY_LIST_TYPES } from '~/composables/usePropertyListConfig'
import DeveloperPropertyCard from '~/components/admin/DeveloperPropertyCard.vue'
import AgentPropertyCard from '~/components/admin/AgentPropertyCard.vue'

/**
 * El listado de propiedades, uno solo para los dos catálogos. Qué cambia
 * entre ellos está declarado en `PROPERTY_LIST_CONFIG`
 * (composables/usePropertyListConfig.ts) — aquí no hay ni una condición sobre
 * `resource`, del mismo modo que `PropertyBuilder.vue` no la tiene.
 */
const props = defineProps<{ resource: 'properties' | 'developer-properties' }>()

const config = computed(() => PROPERTY_LIST_CONFIG[props.resource])

const { confirm } = useConfirm()
const toast = useToast()

const q = ref('')
const status = ref('')
const transactionType = ref('')
const propertyType = ref('')
const sort = ref('newest')
const page = ref(1)

const priceMin = ref<number | null>(null)
const priceMax = ref<number | null>(null)
const country = ref('')
const city = ref('')
const district = ref('')
const postalCode = ref('')
const bedroomsMin = ref<number | null>(null)
const bathroomsMin = ref<number | null>(null)
const areaMin = ref<number | null>(null)
const areaMax = ref<number | null>(null)
const filtersOpen = ref(false)

const cardComponent = computed(() => (config.value.card === 'developer' ? DeveloperPropertyCard : AgentPropertyCard))
/**
 * Cada tarjeta nombra su acción principal a su manera (`publish` en obra
 * nueva, `toggle-sold` en 2ª mano). Se enlaza por nombre en vez de escuchar
 * los dos: un listener para un evento que el componente no declara acabaría
 * como atributo suelto en el DOM.
 */
const cardListeners = computed(() => ({
  [config.value.cardToggleEvent]: applyToggle,
  duplicate,
  delete: remove,
}))

// Grid (cards) is the default — it's the more visual view and the one that
// actually works well on mobile; List remains available and, once chosen,
// persists via localStorage like any other saved preference.
const view = ref<'list' | 'grid'>('grid')
onMounted(() => {
  const saved = localStorage.getItem(config.value.viewStorageKey)
  if (saved === 'grid' || saved === 'list') view.value = saved
})
function setView(v: 'list' | 'grid') {
  view.value = v
  try {
    localStorage.setItem(config.value.viewStorageKey, v)
  } catch {
    // Private browsing / storage quota — the view preference just won't persist.
  }
}

const advancedCount = computed(() =>
  [priceMin.value, priceMax.value, country.value, city.value, district.value, postalCode.value, bedroomsMin.value, bathroomsMin.value, areaMin.value, areaMax.value].filter(
    (v) => v !== null && v !== '',
  ).length,
)
const hasActiveFilters = computed(
  () => !!q.value || !!status.value || (config.value.hasTransactionFilter && !!transactionType.value) || !!propertyType.value || advancedCount.value > 0,
)

function applyAndReset() {
  page.value = 1
}
function clearAll() {
  q.value = ''
  status.value = ''
  transactionType.value = ''
  propertyType.value = ''
  priceMin.value = null
  priceMax.value = null
  country.value = ''
  city.value = ''
  district.value = ''
  postalCode.value = ''
  bedroomsMin.value = null
  bathroomsMin.value = null
  areaMin.value = null
  areaMax.value = null
  page.value = 1
}

const chips = computed(() => {
  const list: { key: string; label: string; clear: () => void }[] = []
  if (q.value) list.push({ key: 'q', label: `"${q.value}"`, clear: () => (q.value = '') })
  if (status.value) {
    const label = config.value.statusOptions.find((s) => s.value === status.value)?.label || status.value
    list.push({ key: 'status', label, clear: () => (status.value = '') })
  }
  if (config.value.hasTransactionFilter && transactionType.value) {
    list.push({ key: 'transactionType', label: transactionType.value === 'rent' ? 'Alquiler' : 'Venta', clear: () => (transactionType.value = '') })
  }
  if (propertyType.value) list.push({ key: 'type', label: propertyType.value, clear: () => (propertyType.value = '') })
  if (priceMin.value != null || priceMax.value != null) {
    const label = `€${priceMin.value ?? 0} – ${priceMax.value != null ? `€${priceMax.value}` : '∞'}`
    list.push({ key: 'price', label, clear: () => ((priceMin.value = null), (priceMax.value = null)) })
  }
  if (country.value) list.push({ key: 'country', label: country.value, clear: () => (country.value = '') })
  if (city.value) list.push({ key: 'city', label: city.value, clear: () => (city.value = '') })
  if (district.value) list.push({ key: 'district', label: district.value, clear: () => (district.value = '') })
  if (postalCode.value) list.push({ key: 'postalCode', label: postalCode.value, clear: () => (postalCode.value = '') })
  if (bedroomsMin.value != null) list.push({ key: 'bedroomsMin', label: `${bedroomsMin.value}+ hab.`, clear: () => (bedroomsMin.value = null) })
  if (bathroomsMin.value != null) list.push({ key: 'bathroomsMin', label: `${bathroomsMin.value}+ baños`, clear: () => (bathroomsMin.value = null) })
  if (areaMin.value != null || areaMax.value != null) {
    const label = `${areaMin.value ?? 0} – ${areaMax.value ?? '∞'} m²`
    list.push({ key: 'area', label, clear: () => ((areaMin.value = null), (areaMax.value = null)) })
  }
  return list
})

const { data, pending, refresh } = await useFetch<any>(() => `/api/admin/${props.resource}`, {
  query: computed(() => ({
    page: page.value,
    q: q.value,
    status: status.value,
    // Sólo se envía en el catálogo que lo tiene: el otro endpoint no conoce
    // el parámetro y no hay razón para mandárselo vacío.
    ...(config.value.hasTransactionFilter ? { transactionType: transactionType.value } : {}),
    propertyType: propertyType.value,
    sort: sort.value,
    priceMin: priceMin.value ?? undefined,
    priceMax: priceMax.value ?? undefined,
    country: country.value || undefined,
    city: city.value || undefined,
    district: district.value || undefined,
    postalCode: postalCode.value || undefined,
    bedroomsMin: bedroomsMin.value ?? undefined,
    bathroomsMin: bathroomsMin.value ?? undefined,
    areaMin: areaMin.value ?? undefined,
    areaMax: areaMax.value ?? undefined,
  })),
})
const totalPages = computed(() => Math.ceil((data.value?.total || 0) / (data.value?.perPage || 20)))
watch([status, transactionType, propertyType, sort, priceMin, priceMax, country, city, district, postalCode, bedroomsMin, bathroomsMin, areaMin, areaMax], () => (page.value = 1))

function formatPrice(v: number | null | undefined) {
  return typeof v === 'number' ? new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(v) + ' €' : '—'
}

function rowById(id: number) {
  return data.value?.rows?.find((r: any) => r.id === id)
}

async function applyToggle(id: number) {
  const row = rowById(id)
  if (!row) return
  const { toggle } = config.value
  try {
    await $fetch<{ ok: true }>(`/api/admin/${props.resource}/${id}`, { method: 'PUT', body: toggle.body(row) })
    toast.success(toggle.successMessage(row))
    await refresh()
  } catch {
    toast.error(toggle.errorMessage)
  }
}

async function duplicate(id: number) {
  try {
    await $fetch<{ ok: true; id: number }>(`/api/admin/${props.resource}/${id}/duplicate`, { method: 'POST' })
    toast.success('Propiedad duplicada')
    await refresh()
  } catch {
    toast.error('No se pudo duplicar la propiedad')
  }
}

async function remove(id: number) {
  const ok = await confirm('Esta propiedad se eliminará permanentemente.', { title: '¿Eliminar propiedad?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    await $fetch<{ ok: true }>(`/api/admin/${props.resource}/${id}`, { method: 'DELETE' })
    toast.success('Propiedad eliminada')
    await refresh()
  } catch {
    toast.error('No se pudo eliminar la propiedad')
  }
}
</script>
