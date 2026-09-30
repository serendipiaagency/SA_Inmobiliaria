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

      <div class="relative">
        <button type="button" class="btn-quiet" :class="savedViewsOpen ? '!border-ink !text-ink' : ''" @click="savedViewsOpen = !savedViewsOpen; columnsOpen = false">
          Vistas guardadas
        </button>
        <div v-if="savedViewsOpen" class="card absolute left-0 top-full z-10 mt-1 w-80 p-3">
          <p v-if="savedViewsPending" class="py-2 text-center text-xs text-stone-400">Cargando…</p>
          <template v-else>
            <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Filtros guardados</p>
            <p v-if="!savedFilters.length" class="mb-2 text-xs text-stone-400">Ninguno todavía.</p>
            <div v-for="f in savedFilters" :key="f.id" class="mb-1 flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-stone-50">
              <button type="button" class="flex-1 truncate text-left text-[13px] text-ink" @click="applySavedView(f)">{{ f.name }}</button>
              <span class="shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">{{ f.visibility === 'shared' ? 'Compartido' : 'Privado' }}</span>
              <button v-if="f.userId === user?.id" type="button" class="shrink-0 text-stone-350 hover:text-red-600" title="Eliminar" @click="deleteSavedView(f.id)">×</button>
            </div>
            <button type="button" class="mb-3 text-[12px] font-medium text-stone-500 hover:text-ink hover:underline" @click="startSaving('filter')">+ Guardar filtro actual</button>

            <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Vistas guardadas</p>
            <p v-if="!savedViews.length" class="mb-2 text-xs text-stone-400">Ninguna todavía.</p>
            <div v-for="v in savedViews" :key="v.id" class="mb-1 flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-stone-50">
              <button type="button" class="flex-1 truncate text-left text-[13px] text-ink" @click="applySavedView(v)">{{ v.name }}</button>
              <span class="shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">{{ v.visibility === 'shared' ? 'Compartida' : 'Privada' }}</span>
              <button v-if="v.userId === user?.id" type="button" class="shrink-0 text-stone-350 hover:text-red-600" title="Eliminar" @click="deleteSavedView(v.id)">×</button>
            </div>
            <button type="button" class="text-[12px] font-medium text-stone-500 hover:text-ink hover:underline" @click="startSaving('view')">+ Guardar vista actual</button>

            <div v-if="savingKind" class="mt-3 border-t border-line pt-3">
              <label class="block">
                <span class="label">Nombre</span>
                <input v-model="newViewName" class="input" placeholder="p. ej. Villas en Marbella" @keyup.enter="confirmSaving" >
              </label>
              <label class="mt-2 block">
                <span class="label">Visibilidad</span>
                <select v-model="newViewVisibility" class="input">
                  <option value="private">Privada — sólo yo</option>
                  <option value="shared">Compartida — toda la organización</option>
                </select>
              </label>
              <div class="mt-2 flex items-center gap-3">
                <button type="button" class="btn-primary !px-3 !py-1.5 text-xs" :disabled="!newViewName.trim()" @click="confirmSaving">Guardar</button>
                <button type="button" class="text-[12px] text-stone-500 hover:text-ink" @click="cancelSaving">Cancelar</button>
              </div>
            </div>
          </template>
        </div>
      </div>

      <a :href="exportHref" download class="btn-quiet">Exportar CSV</a>

      <div class="relative">
        <button v-if="view === 'list'" type="button" class="btn-quiet" :class="columnsOpen ? '!border-ink !text-ink' : ''" @click="columnsOpen = !columnsOpen; savedViewsOpen = false">
          Columnas
        </button>
        <div v-if="columnsOpen" class="card absolute left-0 top-full z-10 mt-1 w-56 p-3">
          <label v-for="c in LIST_COLUMNS" :key="c.key" class="flex items-center gap-2 py-1 text-[13px]">
            <input type="checkbox" :checked="isColumnVisible(c.key)" @change="toggleColumn(c.key)" >
            {{ c.label }}
          </label>
        </div>
      </div>

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
      <label class="block">
        <span class="label">Exclusividad</span>
        <select v-model="isExclusive" class="input">
          <option value="">Todas</option>
          <option value="1">Exclusivas</option>
          <option value="0">No exclusivas</option>
        </select>
      </label>
      <label class="block">
        <span class="label">Publicación</span>
        <select v-model="published" class="input">
          <option value="">Todas</option>
          <option value="published">Publicadas</option>
          <option value="unpublished">Sin publicar</option>
        </select>
      </label>
      <label class="block">
        <span class="label">Captada desde</span>
        <input v-model="capturedFrom" type="date" class="input" >
      </label>
      <label class="block">
        <span class="label">Captada hasta</span>
        <input v-model="capturedTo" type="date" class="input" >
      </label>
      <label class="block">
        <span class="label">Actualizada desde</span>
        <input v-model="updatedFrom" type="date" class="input" >
      </label>
      <label class="block">
        <span class="label">Actualizada hasta</span>
        <input v-model="updatedTo" type="date" class="input" >
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
            <th v-if="isColumnVisible('location')" class="px-4 py-3">Ubicación</th>
            <th v-if="isColumnVisible('price')" class="px-4 py-3">Precio</th>
            <th v-if="isColumnVisible('details')" class="px-4 py-3">Detalles</th>
            <th v-if="isColumnVisible('status')" class="px-4 py-3">Estado</th>
            <th v-if="isColumnVisible('updatedAt')" class="px-4 py-3">Actualizado</th>
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
            <td v-if="isColumnVisible('location')" class="px-4 py-3 text-stone-500">{{ config.rowLocation(p) }}</td>
            <td v-if="isColumnVisible('price')" class="px-4 py-3 text-stone-700">{{ formatPrice(p.price) }}</td>
            <td v-if="isColumnVisible('details')" class="px-4 py-3 text-stone-500">
              <span v-if="p.bedrooms != null">{{ p.bedrooms }} hab · </span><span v-if="p.bathrooms != null">{{ p.bathrooms }} baños · </span><span v-if="p.area != null">{{ p.area }} m²</span>
            </td>
            <td v-if="isColumnVisible('status')" class="px-4 py-3">
              <span
                v-for="(chip, i) in config.rowChips(p)"
                :key="chip.label"
                class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                :class="[LIST_CHIP_CLASSES[chip.tone], i > 0 ? 'ml-1' : '']"
              >
                {{ chip.label }}
              </span>
            </td>
            <td v-if="isColumnVisible('updatedAt')" class="px-4 py-3 text-stone-450">{{ p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('es-ES') : '—' }}</td>
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
import { usePropertySavedViews, type PropertySavedView } from '~/composables/usePropertySavedViews'
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
const { user } = useAuth()

/**
 * Estado en la URL (FASE 27 §72): un filtro aplicado sobrevive a recargar,
 * volver atrás o compartir el enlace — antes se perdía en cuanto se salía
 * de la página. Se lee una vez al montar (los `ref` abajo) y se vuelve a
 * escribir en cada cambio (el `watch` al final del setup).
 */
const route = useRoute()
const router = useRouter()
function qs(key: string): string {
  const v = route.query[key]
  return typeof v === 'string' ? v : ''
}
function qsNum(key: string): number | null {
  const v = qs(key)
  return v ? Number(v) : null
}

const q = ref(qs('q'))
const status = ref(qs('status'))
const transactionType = ref(qs('transactionType'))
const propertyType = ref(qs('propertyType'))
const sort = ref(qs('sort') || 'newest')
const page = ref(qsNum('page') || 1)

const priceMin = ref<number | null>(qsNum('priceMin'))
const priceMax = ref<number | null>(qsNum('priceMax'))
const country = ref(qs('country'))
const city = ref(qs('city'))
const district = ref(qs('district'))
const postalCode = ref(qs('postalCode'))
const bedroomsMin = ref<number | null>(qsNum('bedroomsMin'))
const bathroomsMin = ref<number | null>(qsNum('bathroomsMin'))
const areaMin = ref<number | null>(qsNum('areaMin'))
const areaMax = ref<number | null>(qsNum('areaMax'))
/** Exclusividad de mandato y estado de publicación — filtros nuevos en FASE 27, sin cobertura en ningún listado antes. */
const isExclusive = ref(qs('isExclusive'))
const published = ref(qs('published'))
const capturedFrom = ref(qs('capturedFrom'))
const capturedTo = ref(qs('capturedTo'))
const updatedFrom = ref(qs('updatedFrom'))
const updatedTo = ref(qs('updatedTo'))
// Si se llega con filtros avanzados ya puestos (enlace compartido, recarga), el panel se abre solo — de lo contrario estarían activos pero invisibles.
const filtersOpen = ref(
  !!(
    priceMin.value != null ||
    priceMax.value != null ||
    country.value ||
    city.value ||
    district.value ||
    postalCode.value ||
    bedroomsMin.value != null ||
    bathroomsMin.value != null ||
    areaMin.value != null ||
    areaMax.value != null ||
    isExclusive.value ||
    published.value ||
    capturedFrom.value ||
    capturedTo.value ||
    updatedFrom.value ||
    updatedTo.value
  ),
)

/**
 * Columnas configurables de la vista de lista (FASE 27 §77-78). "Propiedad"
 * y "Acciones" no se apagan: son la identidad de la fila y la forma de
 * actuar sobre ella, no un dato de más. No amplían qué campos devuelve la
 * consulta —sólo deciden cuáles de los ya autorizados se pintan— así que no
 * hay nada que una columna pueda "filtrar" que el usuario no viera ya.
 */
const LIST_COLUMNS = [
  { key: 'location', label: 'Ubicación' },
  { key: 'price', label: 'Precio' },
  { key: 'details', label: 'Detalles' },
  { key: 'status', label: 'Estado' },
  { key: 'updatedAt', label: 'Actualizado' },
] as const
type ListColumnKey = (typeof LIST_COLUMNS)[number]['key']
const visibleColumns = ref<ListColumnKey[]>(LIST_COLUMNS.map((c) => c.key))
function isColumnVisible(key: ListColumnKey) {
  return visibleColumns.value.includes(key)
}
function toggleColumn(key: ListColumnKey) {
  visibleColumns.value = isColumnVisible(key) ? visibleColumns.value.filter((k) => k !== key) : [...visibleColumns.value, key]
}
const columnsOpen = ref(false)

/**
 * Filtros y vistas guardadas (FASE 27 incremento 2, §73-76). Guardan la
 * MISMA forma que ya vive en la URL (`currentSavableQuery()` arriba) — un
 * Filtro guarda sólo eso; una Vista añade además qué columnas se ven. Los
 * permisos de lectura/escritura de una fila compartida los aplica el
 * servidor (server/utils/properties/savedViews.ts); aquí sólo se enseña u
 * oculta el botón "Eliminar" según si `userId` coincide con la sesión —
 * quitarlo no sería seguridad real, es sólo no ofrecer un botón que el
 * servidor rechazaría igualmente con 403.
 */
const { filters: savedFilters, savedViews, pending: savedViewsPending, save: saveView, remove: removeView } = usePropertySavedViews(props.resource)
const savedViewsOpen = ref(false)
const savingKind = ref<'filter' | 'view' | null>(null)
const newViewName = ref('')
const newViewVisibility = ref<'private' | 'shared'>('private')

function startSaving(kind: 'filter' | 'view') {
  savingKind.value = kind
  newViewName.value = ''
  newViewVisibility.value = 'private'
}
function cancelSaving() {
  savingKind.value = null
}
async function confirmSaving() {
  if (!newViewName.value.trim() || !savingKind.value) return
  try {
    await saveView({
      kind: savingKind.value,
      name: newViewName.value.trim(),
      visibility: newViewVisibility.value,
      query: currentSavableQuery(),
      columns: savingKind.value === 'view' ? visibleColumns.value : null,
    })
    toast.success(savingKind.value === 'view' ? 'Vista guardada' : 'Filtro guardado')
    savingKind.value = null
  } catch {
    toast.error('No se pudo guardar')
  }
}
function applySavedView(item: PropertySavedView) {
  try {
    applySavableQuery(JSON.parse(item.queryJson))
  } catch {
    toast.error('Este filtro guardado está dañado y no se pudo aplicar')
    return
  }
  if (item.kind === 'view' && item.columnsJson) {
    try {
      const cols = JSON.parse(item.columnsJson)
      if (Array.isArray(cols)) visibleColumns.value = cols.filter((c): c is ListColumnKey => LIST_COLUMNS.some((lc) => lc.key === c))
    } catch {
      // Preferencia de columnas dañada: se aplica el filtro igual, sólo se ignoran las columnas.
    }
  }
  savedViewsOpen.value = false
}
async function deleteSavedView(id: number) {
  const ok = await confirm('Se eliminará para todo el mundo si era compartido.', { title: '¿Eliminar filtro/vista guardada?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    await removeView(id)
    toast.success('Eliminado')
  } catch {
    toast.error('No se pudo eliminar')
  }
}

const exportHref = computed(() => {
  const params = new URLSearchParams({ ...currentSavableQuery(), format: 'csv' })
  return `/api/admin/${props.resource}?${params.toString()}`
})

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
  [
    priceMin.value,
    priceMax.value,
    country.value,
    city.value,
    district.value,
    postalCode.value,
    bedroomsMin.value,
    bathroomsMin.value,
    areaMin.value,
    areaMax.value,
    isExclusive.value,
    published.value,
    capturedFrom.value,
    capturedTo.value,
    updatedFrom.value,
    updatedTo.value,
  ].filter((v) => v !== null && v !== '').length,
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
  isExclusive.value = ''
  published.value = ''
  capturedFrom.value = ''
  capturedTo.value = ''
  updatedFrom.value = ''
  updatedTo.value = ''
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
  if (isExclusive.value) list.push({ key: 'isExclusive', label: isExclusive.value === '1' ? 'Exclusiva' : 'No exclusiva', clear: () => (isExclusive.value = '') })
  if (published.value) list.push({ key: 'published', label: published.value === 'published' ? 'Publicada' : 'Sin publicar', clear: () => (published.value = '') })
  if (capturedFrom.value || capturedTo.value) {
    list.push({ key: 'captured', label: `Captada ${capturedFrom.value || '…'} – ${capturedTo.value || '…'}`, clear: () => ((capturedFrom.value = ''), (capturedTo.value = '')) })
  }
  if (updatedFrom.value || updatedTo.value) {
    list.push({ key: 'updated', label: `Actualizada ${updatedFrom.value || '…'} – ${updatedTo.value || '…'}`, clear: () => ((updatedFrom.value = ''), (updatedTo.value = '')) })
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
    isExclusive: isExclusive.value || undefined,
    published: published.value || undefined,
    capturedFrom: capturedFrom.value || undefined,
    capturedTo: capturedTo.value || undefined,
    updatedFrom: updatedFrom.value || undefined,
    updatedTo: updatedTo.value || undefined,
  })),
})
const totalPages = computed(() => Math.ceil((data.value?.total || 0) / (data.value?.perPage || 20)))
const FILTER_REFS = [
  status,
  transactionType,
  propertyType,
  sort,
  priceMin,
  priceMax,
  country,
  city,
  district,
  postalCode,
  bedroomsMin,
  bathroomsMin,
  areaMin,
  areaMax,
  isExclusive,
  published,
  capturedFrom,
  capturedTo,
  updatedFrom,
  updatedTo,
]
watch(FILTER_REFS, () => (page.value = 1))

/**
 * La forma "limpia" del filtro actual — sólo lo que se apartó de los
 * valores por defecto, sin `page`. La misma función alimenta la URL (abajo)
 * y el Filtro/Vista que se guarda (FASE 27 incremento 2, más abajo): son el
 * mismo estado, guardarlo dos veces distinto habría sido el motor paralelo
 * que §51 pide evitar.
 */
function currentSavableQuery(): Record<string, string> {
  const out: Record<string, string> = {}
  if (q.value) out.q = q.value
  if (status.value) out.status = status.value
  if (config.value.hasTransactionFilter && transactionType.value) out.transactionType = transactionType.value
  if (propertyType.value) out.propertyType = propertyType.value
  if (sort.value && sort.value !== 'newest') out.sort = sort.value
  if (priceMin.value != null) out.priceMin = String(priceMin.value)
  if (priceMax.value != null) out.priceMax = String(priceMax.value)
  if (country.value) out.country = country.value
  if (city.value) out.city = city.value
  if (district.value) out.district = district.value
  if (postalCode.value) out.postalCode = postalCode.value
  if (bedroomsMin.value != null) out.bedroomsMin = String(bedroomsMin.value)
  if (bathroomsMin.value != null) out.bathroomsMin = String(bathroomsMin.value)
  if (areaMin.value != null) out.areaMin = String(areaMin.value)
  if (areaMax.value != null) out.areaMax = String(areaMax.value)
  if (isExclusive.value) out.isExclusive = isExclusive.value
  if (published.value) out.published = published.value
  if (capturedFrom.value) out.capturedFrom = capturedFrom.value
  if (capturedTo.value) out.capturedTo = capturedTo.value
  if (updatedFrom.value) out.updatedFrom = updatedFrom.value
  if (updatedTo.value) out.updatedTo = updatedTo.value
  return out
}

/** Aplica un filtro/vista guardada: primero limpia (para no arrastrar un valor de la sesión anterior que la vista no menciona), luego pone sólo lo que trae. */
function applySavableQuery(parsed: Record<string, unknown>) {
  clearAll()
  if (parsed.q) q.value = String(parsed.q)
  if (parsed.status) status.value = String(parsed.status)
  if (parsed.transactionType) transactionType.value = String(parsed.transactionType)
  if (parsed.propertyType) propertyType.value = String(parsed.propertyType)
  if (parsed.sort) sort.value = String(parsed.sort)
  if (parsed.priceMin != null) priceMin.value = Number(parsed.priceMin)
  if (parsed.priceMax != null) priceMax.value = Number(parsed.priceMax)
  if (parsed.country) country.value = String(parsed.country)
  if (parsed.city) city.value = String(parsed.city)
  if (parsed.district) district.value = String(parsed.district)
  if (parsed.postalCode) postalCode.value = String(parsed.postalCode)
  if (parsed.bedroomsMin != null) bedroomsMin.value = Number(parsed.bedroomsMin)
  if (parsed.bathroomsMin != null) bathroomsMin.value = Number(parsed.bathroomsMin)
  if (parsed.areaMin != null) areaMin.value = Number(parsed.areaMin)
  if (parsed.areaMax != null) areaMax.value = Number(parsed.areaMax)
  if (parsed.isExclusive) isExclusive.value = String(parsed.isExclusive)
  if (parsed.published) published.value = String(parsed.published)
  if (parsed.capturedFrom) capturedFrom.value = String(parsed.capturedFrom)
  if (parsed.capturedTo) capturedTo.value = String(parsed.capturedTo)
  if (parsed.updatedFrom) updatedFrom.value = String(parsed.updatedFrom)
  if (parsed.updatedTo) updatedTo.value = String(parsed.updatedTo)
  filtersOpen.value = advancedCount.value > 0
}

/** Refleja el estado en la URL (FASE 27 §72) — `replace`, no `push`: cambiar un filtro no debe llenar el historial de "atrás" con un paso por cada tecla. */
watch(
  [q, page, ...FILTER_REFS],
  () => {
    const query: Record<string, string> = { ...currentSavableQuery() }
    if (page.value > 1) query.page = String(page.value)
    router.replace({ query })
  },
  { flush: 'post' },
)

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
