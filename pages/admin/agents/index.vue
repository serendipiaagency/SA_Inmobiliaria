<template>
  <div>
    <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Comerciales</h1>
        <p class="mt-1 text-sm text-stone-500">{{ data?.total ?? 0 }} comercial{{ data?.total === 1 ? '' : 'es' }}</p>
      </div>
      <NuxtLink to="/admin/agents/new" class="btn-primary">+ Nuevo comercial</NuxtLink>
    </div>

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <div class="relative">
        <input v-model="q" class="input !w-64 !pl-8" placeholder="Nombre, puesto, email, teléfono…" @keyup.enter="applyAndReset" >
        <svg class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-350" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path stroke-linecap="round" d="m21 21-4.3-4.3" /></svg>
        <button v-if="q" type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-stone-350 hover:text-ink" title="Limpiar búsqueda" @click="q = ''; applyAndReset()">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="m18 6-12 12M6 6l12 12" /></svg>
        </button>
      </div>

      <select v-model="employmentStatus" class="input !w-40" @change="applyAndReset">
        <option value="">Todos los estados</option>
        <option value="active">Activo</option>
        <option value="inactive">Inactivo</option>
        <option value="on_leave">Baja</option>
      </select>
      <select v-model="sort" class="input !w-44">
        <option value="name_asc">Nombre A-Z</option>
        <option value="name_desc">Nombre Z-A</option>
        <option value="newest">Más recientes</option>
        <option value="oldest">Más antiguos</option>
      </select>

      <button type="button" class="btn-quiet" :class="filtersOpen ? '!border-ink !text-ink' : ''" @click="filtersOpen = !filtersOpen">
        Filtros <span v-if="advancedCount" class="ml-1 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">{{ advancedCount }}</span>
      </button>

      <div class="ml-auto flex rounded-lg border border-line bg-white p-0.5">
        <button type="button" class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="view === 'list' ? 'bg-ink text-white' : 'text-stone-500'" @click="setView('list')">Lista</button>
        <button type="button" class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="view === 'grid' ? 'bg-ink text-white' : 'text-stone-500'" @click="setView('grid')">Grid</button>
      </div>
    </div>

    <div v-if="filtersOpen" class="card mb-3 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label class="block">
        <span class="label">Oficina / sede</span>
        <input v-model="officeName" class="input" >
      </label>
      <label class="block">
        <span class="label">Departamento / equipo</span>
        <input v-model="department" class="input" >
      </label>
      <label class="block">
        <span class="label">Puesto</span>
        <input v-model="position" class="input" >
      </label>
      <label class="block">
        <span class="label">Zona comercial</span>
        <input v-model="zone" class="input" >
      </label>
      <label class="block">
        <span class="label">Especialización</span>
        <input v-model="specialty" class="input" >
      </label>
      <label class="block">
        <span class="label">Idioma</span>
        <input v-model="language" class="input" >
      </label>
      <label class="block">
        <span class="label">Propiedades asignadas</span>
        <select v-model="assignedProperties" class="input">
          <option value="">Cualquiera</option>
          <option value="with">Con propiedades asignadas</option>
          <option value="without">Sin propiedades asignadas</option>
        </select>
      </label>
      <div class="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
        <button type="button" class="btn-primary" @click="applyAndReset">Aplicar filtros</button>
        <button type="button" class="btn-quiet" @click="clearAll">Limpiar filtros</button>
      </div>
    </div>

    <div v-if="chips.length" class="mb-3 flex flex-wrap items-center gap-2">
      <button v-for="c in chips" :key="c.key" type="button" class="flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[12px] font-medium text-stone-600 hover:border-stone-300" @click="c.clear(); applyAndReset()">
        {{ c.label }}
        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" d="m18 6-12 12M6 6l12 12" /></svg>
      </button>
      <button type="button" class="text-[12px] font-medium text-stone-400 hover:text-ink hover:underline" @click="clearAll">Limpiar todo</button>
    </div>

    <div v-if="pending" class="py-20 text-center text-sm text-stone-400">Cargando…</div>
    <div v-else-if="!data?.rows?.length" class="card px-4 py-16 text-center">
      <p class="text-sm font-medium text-stone-500">No se han encontrado comerciales</p>
      <p class="mt-1 text-xs text-stone-400">{{ hasActiveFilters ? 'Prueba a ajustar la búsqueda o los filtros.' : 'Crea el primero con "+ Nuevo comercial".' }}</p>
    </div>

    <div v-else-if="view === 'grid'" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <AdminAgentCard v-for="a in data.rows" :key="a.id" :agent="a" @toggle-status="toggleStatus" @delete="remove" />
    </div>

    <div v-else class="card overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-stone-50 text-xs uppercase text-stone-500">
          <tr>
            <th class="px-4 py-3">Comercial</th>
            <th class="px-4 py-3">Oficina / equipo</th>
            <th class="px-4 py-3">Zona</th>
            <th class="px-4 py-3">Propiedades</th>
            <th class="px-4 py-3">Estado</th>
            <th class="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in data.rows" :key="a.id" class="border-t border-line hover:bg-stone-50">
            <td class="px-4 py-3">
              <NuxtLink :to="`/admin/agents/${a.id}`" class="flex items-center gap-2.5">
                <img v-if="a.image" :src="mediaUrl(a.image)" class="h-9 w-9 shrink-0 rounded-full object-cover" >
                <span v-else class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs">👤</span>
                <span class="min-w-0">
                  <span class="block truncate font-medium text-ink">{{ a.name }}</span>
                  <span class="block text-[11px] text-stone-400">{{ a.position }}</span>
                </span>
              </NuxtLink>
            </td>
            <td class="px-4 py-3 text-stone-500">{{ [a.officeName, a.department].filter(Boolean).join(' · ') || '—' }}</td>
            <td class="px-4 py-3 text-stone-500">{{ firstZone(a.zones) || '—' }}</td>
            <td class="px-4 py-3 text-stone-500">{{ a.assignedPropertiesCount ?? 0 }}</td>
            <td class="px-4 py-3">
              <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="STATUS_CLASS[a.employmentStatus] || 'bg-stone-100 text-stone-500'">{{ STATUS_LABELS[a.employmentStatus] || a.employmentStatus }}</span>
            </td>
            <td class="whitespace-nowrap px-4 py-3 text-right text-xs">
              <NuxtLink :to="`/admin/agents/${a.id}`" class="mr-2 font-medium text-stone-600 hover:underline">Editar</NuxtLink>
              <button type="button" class="mr-2 font-medium text-stone-600 hover:underline" @click="toggleStatus(a.id)">{{ a.employmentStatus === 'active' ? 'Desactivar' : 'Activar' }}</button>
              <button type="button" class="font-medium text-red-600 hover:underline" @click="remove(a.id)">Eliminar</button>
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
definePageMeta({ layout: 'admin', middleware: 'admin' })

const { confirm } = useConfirm()
const toast = useToast()

const STATUS_LABELS: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', on_leave: 'Baja' }
const STATUS_CLASS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-stone-200 text-stone-600',
  on_leave: 'bg-amber-100 text-amber-700',
}

const q = ref('')
const employmentStatus = ref('')
const sort = ref('name_asc')
const page = ref(1)

const officeName = ref('')
const department = ref('')
const position = ref('')
const zone = ref('')
const specialty = ref('')
const language = ref('')
const assignedProperties = ref('')
const filtersOpen = ref(false)

const view = ref<'list' | 'grid'>('grid')
onMounted(() => {
  const saved = localStorage.getItem('sa-admin-agents-view')
  if (saved === 'grid' || saved === 'list') view.value = saved
})
function setView(v: 'list' | 'grid') {
  view.value = v
  try {
    localStorage.setItem('sa-admin-agents-view', v)
  } catch {
    // Private browsing / storage quota — the view preference just won't persist.
  }
}

const advancedCount = computed(() => [officeName.value, department.value, position.value, zone.value, specialty.value, language.value, assignedProperties.value].filter(Boolean).length)
const hasActiveFilters = computed(() => !!q.value || !!employmentStatus.value || advancedCount.value > 0)

function applyAndReset() {
  page.value = 1
}
function clearAll() {
  q.value = ''
  employmentStatus.value = ''
  officeName.value = ''
  department.value = ''
  position.value = ''
  zone.value = ''
  specialty.value = ''
  language.value = ''
  assignedProperties.value = ''
  page.value = 1
}

const chips = computed(() => {
  const list: { key: string; label: string; clear: () => void }[] = []
  if (q.value) list.push({ key: 'q', label: `"${q.value}"`, clear: () => (q.value = '') })
  if (employmentStatus.value) list.push({ key: 'status', label: STATUS_LABELS[employmentStatus.value] || employmentStatus.value, clear: () => (employmentStatus.value = '') })
  if (officeName.value) list.push({ key: 'office', label: officeName.value, clear: () => (officeName.value = '') })
  if (department.value) list.push({ key: 'department', label: department.value, clear: () => (department.value = '') })
  if (position.value) list.push({ key: 'position', label: position.value, clear: () => (position.value = '') })
  if (zone.value) list.push({ key: 'zone', label: zone.value, clear: () => (zone.value = '') })
  if (specialty.value) list.push({ key: 'specialty', label: specialty.value, clear: () => (specialty.value = '') })
  if (language.value) list.push({ key: 'language', label: language.value, clear: () => (language.value = '') })
  if (assignedProperties.value) list.push({ key: 'assigned', label: assignedProperties.value === 'with' ? 'Con propiedades' : 'Sin propiedades', clear: () => (assignedProperties.value = '') })
  return list
})

const { data, pending, refresh } = await useFetch<any>('/api/admin/team', {
  query: computed(() => ({
    page: page.value,
    q: q.value,
    employmentStatus: employmentStatus.value,
    sort: sort.value,
    officeName: officeName.value || undefined,
    department: department.value || undefined,
    position: position.value || undefined,
    zone: zone.value || undefined,
    specialty: specialty.value || undefined,
    language: language.value || undefined,
    assignedProperties: assignedProperties.value || undefined,
  })),
})
const totalPages = computed(() => Math.ceil((data.value?.total || 0) / (data.value?.perPage || 20)))
watch([employmentStatus, sort, officeName, department, position, zone, specialty, language, assignedProperties], () => (page.value = 1))

function firstZone(zonesJson: string | null) {
  try {
    const parsed = JSON.parse(zonesJson || '[]')
    return Array.isArray(parsed) ? parsed[0] : null
  } catch {
    return null
  }
}

async function toggleStatus(id: number) {
  const row = data.value?.rows?.find((r: any) => r.id === id)
  const next = row?.employmentStatus === 'active' ? 'inactive' : 'active'
  try {
    await $fetch<{ ok: true }>(`/api/admin/team/${id}`, { method: 'PUT', body: { employmentStatus: next } })
    toast.success(next === 'active' ? 'Comercial activado' : 'Comercial desactivado')
    await refresh()
  } catch {
    toast.error('No se pudo actualizar el estado')
  }
}

async function remove(id: number) {
  const ok = await confirm('Este comercial se eliminará permanentemente.', { title: '¿Eliminar comercial?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    await $fetch<{ ok: true }>(`/api/admin/team/${id}`, { method: 'DELETE' })
    toast.success('Comercial eliminado')
    await refresh()
  } catch {
    toast.error('No se pudo eliminar el comercial')
  }
}
</script>
