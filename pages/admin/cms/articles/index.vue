<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Artículos</h1>
        <p class="mt-1 text-sm text-stone-500">{{ data?.total ?? 0 }} artículo(s){{ selected.length ? ` · ${selected.length} seleccionado(s)` : '' }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <input v-model="q" class="input !w-52" placeholder="Buscar…" @keyup.enter="page = 1" />
        <select v-model="status" class="input !w-40">
          <option value="all">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="scheduled">Programado</option>
          <option value="published">Publicado</option>
        </select>
        <select v-model="categoryId" class="input !w-44">
          <option value="">Todas las categorías</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <select v-model="authorId" class="input !w-40">
          <option value="">Todos los autores</option>
          <option v-for="a in authors" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
        <div class="flex rounded-lg border border-line bg-white p-0.5">
          <button class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="view === 'list' ? 'bg-ink text-white' : 'text-stone-500'" @click="view = 'list'">Lista</button>
          <button class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="view === 'grid' ? 'bg-ink text-white' : 'text-stone-500'" @click="view = 'grid'">Grid</button>
        </div>
        <NuxtLink to="/admin/cms/articles/new" class="btn-primary">+ Nuevo</NuxtLink>
      </div>
    </div>

    <!-- Bulk actions bar -->
    <div v-if="selected.length" class="mb-3 flex items-center gap-3 rounded-lg border border-line bg-stone-50 px-4 py-2.5 text-sm">
      <span class="font-medium">{{ selected.length }} seleccionado(s)</span>
      <button class="text-emerald-700 hover:underline" @click="bulk('published')">Publicar</button>
      <button class="text-blue-700 hover:underline" @click="bulk('draft')">Pasar a borrador</button>
      <button class="text-red-600 hover:underline" @click="bulkDelete">Eliminar</button>
      <button class="ml-auto text-stone-450 hover:underline" @click="selected = []">Cancelar</button>
    </div>

    <!-- List view -->
    <div v-if="view === 'list'" class="card overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="w-10 px-4 py-3"><input type="checkbox" :checked="allSelected" @change="toggleAll" /></th>
            <th class="cursor-pointer px-4 py-3" @click="toggleSort('title')">Título {{ sortArrow('title') }}</th>
            <th class="cursor-pointer px-4 py-3" @click="toggleSort('status')">Estado {{ sortArrow('status') }}</th>
            <th class="px-4 py-3">Autor</th>
            <th class="px-4 py-3">Categoría</th>
            <th class="px-4 py-3">Lectura</th>
            <th class="cursor-pointer px-4 py-3" @click="toggleSort('viewCount')">Vistas {{ sortArrow('viewCount') }}</th>
            <th class="cursor-pointer px-4 py-3" @click="toggleSort('seoScore')">SEO {{ sortArrow('seoScore') }}</th>
            <th class="cursor-pointer px-4 py-3" @click="toggleSort('updatedAt')">Fecha {{ sortArrow('updatedAt') }}</th>
            <th class="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in data?.rows || []" :key="a.id" class="border-t border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-3"><input type="checkbox" :checked="selected.includes(a.id)" @change="toggleOne(a.id)" /></td>
            <td class="max-w-xs truncate px-4 py-3">
              <div class="flex items-center gap-2.5">
                <img v-if="a.coverImage" :src="mediaUrl(a.coverImage)" class="h-8 w-8 shrink-0 rounded object-cover" />
                <span class="truncate font-medium text-ink">{{ a.title }}</span>
              </div>
            </td>
            <td class="px-4 py-3"><span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="statusCls(a.status)">{{ statusLabel(a.status) }}</span></td>
            <td class="px-4 py-3 text-stone-500">{{ a.authorName || '—' }}</td>
            <td class="px-4 py-3 text-stone-500">{{ a.categoryName || '—' }}</td>
            <td class="px-4 py-3 text-stone-500">{{ a.readingTimeMinutes }} min</td>
            <td class="px-4 py-3 text-stone-500">{{ a.viewCount }}</td>
            <td class="px-4 py-3"><span class="font-semibold" :class="seoCls(a.seoScore)">{{ a.seoScore }}</span></td>
            <td class="px-4 py-3 text-stone-450">{{ new Date(a.updatedAt).toLocaleDateString('es-ES') }}</td>
            <td class="whitespace-nowrap px-4 py-3 text-right text-xs">
              <NuxtLink :to="`/admin/cms/articles/${a.id}`" class="mr-2 font-medium text-emerald-700 hover:underline">Editar</NuxtLink>
              <button class="mr-2 font-medium text-stone-500 hover:underline" @click="duplicate(a.id)">Duplicar</button>
              <button class="font-medium text-red-600 hover:underline" @click="remove(a.id)">Eliminar</button>
            </td>
          </tr>
          <tr v-if="!data?.rows?.length">
            <td colspan="10" class="px-4 py-14 text-center">
              <p class="text-sm font-medium text-slate-500">Aún no hay artículos</p>
              <p class="mt-1 text-xs text-slate-400">Crea el primero con "+ Nuevo".</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Grid view -->
    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="a in data?.rows || []" :key="a.id" class="group relative overflow-hidden rounded-xl border border-line bg-white transition hover:shadow-md">
        <input type="checkbox" class="absolute left-3 top-3 z-10 h-4 w-4" :checked="selected.includes(a.id)" @change="toggleOne(a.id)" />
        <div class="flex h-36 items-center justify-center bg-stone-50">
          <img v-if="a.coverImage" :src="mediaUrl(a.coverImage)" class="h-full w-full object-cover" />
          <span v-else class="text-3xl">📝</span>
        </div>
        <div class="p-4">
          <div class="mb-1.5 flex items-center justify-between">
            <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="statusCls(a.status)">{{ statusLabel(a.status) }}</span>
            <span class="text-[11px] font-semibold" :class="seoCls(a.seoScore)">SEO {{ a.seoScore }}</span>
          </div>
          <NuxtLink :to="`/admin/cms/articles/${a.id}`" class="line-clamp-2 font-medium text-ink hover:underline">{{ a.title }}</NuxtLink>
          <p class="mt-1.5 text-[12px] text-stone-450">{{ a.authorName || 'Sin autor' }} · {{ a.readingTimeMinutes }} min · {{ a.viewCount }} vistas</p>
          <div class="mt-3 flex gap-3 text-xs">
            <button class="text-stone-500 hover:underline" @click="duplicate(a.id)">Duplicar</button>
            <button class="text-red-600 hover:underline" @click="remove(a.id)">Eliminar</button>
          </div>
        </div>
      </div>
      <p v-if="!data?.rows?.length" class="col-span-full py-14 text-center text-sm text-slate-500">Aún no hay artículos.</p>
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
useHead({ title: 'Artículos — Blog & CMS' })

const q = ref('')
const status = ref('all')
const categoryId = ref('')
const authorId = ref('')
const page = ref(1)
const view = ref<'list' | 'grid'>('list')
const sortKey = ref('updatedAt')
const sortDir = ref<'asc' | 'desc'>('desc')
const selected = ref<number[]>([])

const { data: categories } = await useFetch<any>('/api/admin/cms-categories', { query: { perPage: 100 }, transform: (r: any) => r.rows })
const { data: authors } = await useFetch<any>('/api/admin/cms-authors', { query: { perPage: 100 }, transform: (r: any) => r.rows })

const { data, refresh } = await useFetch<any>('/api/admin/cms/articles', {
  query: computed(() => ({ page: page.value, q: q.value, status: status.value, categoryId: categoryId.value, authorId: authorId.value, sort: sortKey.value, dir: sortDir.value })),
})
const totalPages = computed(() => Math.ceil((data.value?.total || 0) / (data.value?.perPage || 20)))
const allSelected = computed(() => !!data.value?.rows?.length && data.value.rows.every((r: any) => selected.value.includes(r.id)))
watch([status, categoryId, authorId], () => (page.value = 1))
watch(data, () => (selected.value = []))

function toggleSort(key: string) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}
function sortArrow(key: string) {
  if (sortKey.value !== key) return ''
  return sortDir.value === 'asc' ? '↑' : '↓'
}
function toggleAll() {
  selected.value = allSelected.value ? [] : (data.value?.rows || []).map((r: any) => r.id)
}
function toggleOne(id: number) {
  selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id]
}

const { confirm } = useConfirm()
const toast = useToast()

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'bg-stone-100 text-stone-500' },
  scheduled: { label: 'Programado', cls: 'bg-blue-50 text-blue-700' },
  published: { label: 'Publicado', cls: 'bg-emerald-50 text-emerald-700' },
}
function statusLabel(s: string) {
  return STATUS_MAP[s]?.label || s
}
function statusCls(s: string) {
  return STATUS_MAP[s]?.cls || 'bg-stone-100 text-stone-500'
}
function seoCls(score: number) {
  return score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-rose-500'
}

async function remove(id: number) {
  const ok = await confirm('Se moverá a la Papelera (puedes restaurarlo).', { title: '¿Eliminar este artículo?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  await $fetch(`/api/admin/cms/articles/${id}`, { method: 'DELETE' })
  toast.success('Artículo movido a la papelera')
  await refresh()
}

async function duplicate(id: number) {
  const res = await $fetch<{ id: number }>(`/api/admin/cms/articles/${id}/duplicate`, { method: 'POST' })
  toast.success('Artículo duplicado como borrador')
  await refresh()
  return res
}

async function bulk(newStatus: string) {
  await Promise.all(selected.value.map((id) => $fetch(`/api/admin/cms/articles/${id}`, { method: 'PUT', body: { status: newStatus } })))
  toast.success(`${selected.value.length} artículo(s) actualizado(s)`)
  selected.value = []
  await refresh()
}

async function bulkDelete() {
  const ok = await confirm(`Se moverán ${selected.value.length} artículo(s) a la Papelera.`, { title: '¿Eliminar selección?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  await Promise.all(selected.value.map((id) => $fetch(`/api/admin/cms/articles/${id}`, { method: 'DELETE' })))
  toast.success('Eliminados')
  selected.value = []
  await refresh()
}
</script>
