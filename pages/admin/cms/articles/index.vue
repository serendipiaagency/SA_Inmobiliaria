<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Artículos</h1>
        <p class="mt-1 text-sm text-stone-500">{{ data?.total ?? 0 }} artículo(s)</p>
      </div>
      <div class="flex gap-2">
        <input v-model="q" class="input !w-56" placeholder="Buscar…" @keyup.enter="page = 1" />
        <select v-model="status" class="input !w-40">
          <option value="all">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="scheduled">Programado</option>
          <option value="published">Publicado</option>
        </select>
        <NuxtLink to="/admin/cms/articles/new" class="btn-primary">+ Nuevo</NuxtLink>
      </div>
    </div>

    <div class="card overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="px-4 py-3">Título</th>
            <th class="px-4 py-3">Estado</th>
            <th class="px-4 py-3">Autor</th>
            <th class="px-4 py-3">Categoría</th>
            <th class="px-4 py-3">Lectura</th>
            <th class="px-4 py-3">Vistas</th>
            <th class="px-4 py-3">SEO</th>
            <th class="px-4 py-3">Fecha</th>
            <th class="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in data?.rows || []" :key="a.id" class="border-t border-slate-100 hover:bg-slate-50">
            <td class="max-w-xs truncate px-4 py-3">
              <div class="flex items-center gap-2.5">
                <img v-if="a.coverImage" :src="mediaUrl(a.coverImage)" class="h-8 w-8 shrink-0 rounded object-cover" />
                <span class="truncate font-medium text-ink">{{ a.title }}</span>
              </div>
            </td>
            <td class="px-4 py-3">
              <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="statusCls(a.status)">{{ statusLabel(a.status) }}</span>
            </td>
            <td class="px-4 py-3 text-stone-500">{{ a.authorName || '—' }}</td>
            <td class="px-4 py-3 text-stone-500">{{ a.categoryName || '—' }}</td>
            <td class="px-4 py-3 text-stone-500">{{ a.readingTimeMinutes }} min</td>
            <td class="px-4 py-3 text-stone-500">{{ a.viewCount }}</td>
            <td class="px-4 py-3">
              <span class="font-semibold" :class="a.seoScore >= 70 ? 'text-emerald-600' : a.seoScore >= 40 ? 'text-amber-600' : 'text-rose-500'">{{ a.seoScore }}</span>
            </td>
            <td class="px-4 py-3 text-stone-450">{{ new Date(a.updatedAt).toLocaleDateString('es-ES') }}</td>
            <td class="whitespace-nowrap px-4 py-3 text-right">
              <NuxtLink :to="`/admin/cms/articles/${a.id}`" class="mr-3 font-medium text-emerald-700 hover:underline">Editar</NuxtLink>
              <button class="font-medium text-red-600 transition hover:underline active:scale-95" @click="remove(a.id)">Eliminar</button>
            </td>
          </tr>
          <tr v-if="!data?.rows?.length">
            <td colspan="9" class="px-4 py-14 text-center">
              <p class="text-sm font-medium text-slate-500">Aún no hay artículos</p>
              <p class="mt-1 text-xs text-slate-400">Crea el primero con "+ Nuevo".</p>
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
useHead({ title: 'Artículos — Blog & CMS' })

const q = ref('')
const status = ref('all')
const page = ref(1)

const { data, refresh } = await useFetch<any>('/api/admin/cms/articles', {
  query: computed(() => ({ page: page.value, q: q.value, status: status.value })),
})
const totalPages = computed(() => Math.ceil((data.value?.total || 0) / (data.value?.perPage || 20)))
watch(status, () => (page.value = 1))

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

async function remove(id: number) {
  const ok = await confirm('Se moverá a la Papelera (puedes restaurarlo).', { title: '¿Eliminar este artículo?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    await $fetch(`/api/admin/cms/articles/${id}`, { method: 'DELETE' })
    toast.success('Artículo movido a la papelera')
    await refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo eliminar')
  }
}
</script>
