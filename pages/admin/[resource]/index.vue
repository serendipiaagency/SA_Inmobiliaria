<template>
  <div v-if="meta">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">{{ meta.label }}</h1>
      <div class="flex gap-2">
        <input v-model="q" class="input !w-56" placeholder="Buscar…" @keyup.enter="page = 1" >
        <NuxtLink v-if="!meta.readonly && canEdit" :to="`/admin/${resource}/new`" class="btn-primary">+ Nuevo</NuxtLink>
      </div>
    </div>

    <div class="card overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <!-- Nombre declarado por el recurso si lo tiene; si no, uno
                 legible. Nunca el nombre crudo de la columna. -->
            <th v-for="f in meta.listFields" :key="f" class="px-4 py-3">{{ fieldLabel(meta, f) }}</th>
            <th class="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data?.rows || []" :key="row.id" class="border-t border-slate-100 hover:bg-slate-50">
            <td v-for="f in meta.listFields" :key="f" class="max-w-xs truncate px-4 py-3">
              {{ row[f] }}
            </td>
            <td class="whitespace-nowrap px-4 py-3 text-right">
              <NuxtLink :to="`/admin/${resource}/${row.id}`" class="mr-3 font-medium text-emerald-700 hover:underline">
                {{ meta.readonly || !canEdit ? 'Ver' : 'Editar' }}
              </NuxtLink>
              <button v-if="canEdit" class="font-medium text-red-600 transition hover:underline active:scale-95" @click="remove(row.id)">Eliminar</button>
            </td>
          </tr>
          <tr v-if="!data?.rows?.length">
            <td :colspan="meta.listFields.length + 1" class="px-4 py-14 text-center">
              <p class="text-sm font-medium text-slate-500">Sin resultados en {{ meta.label }}</p>
              <p class="mt-1 text-xs text-slate-400">{{ q ? 'Prueba con otro término de búsqueda.' : 'Todavía no hay registros aquí.' }}</p>
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

const route = useRoute()
const resource = computed(() => String(route.params.resource))
const q = ref('')
const page = ref(1)

const { data: resources } = await useFetch<Record<string, any>>('/api/admin/resources')
const meta = computed(() => resources.value?.[resource.value])
if (!meta.value) {
  throw createError({ statusCode: 404, statusMessage: 'Recurso desconocido', fatal: true })
}
useHead({ title: computed(() => `${meta.value?.label || 'Admin'} — M&M Real Estate`) })

// Write actions are hidden for an admin who only has read access to this
// resource's area — the API rejects them either way
// (server/middleware/01.admin-rbac.ts); this just stops the panel offering
// buttons that can only fail.
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => (meta.value?.area ? canWrite(meta.value.area) : true))

const { data, refresh } = await useFetch<any>(() => `/api/admin/${resource.value}`, {
  query: computed(() => ({ page: page.value, q: q.value })),
})
const totalPages = computed(() => Math.ceil((data.value?.total || 0) / (data.value?.perPage || 20)))

watch(resource, () => {
  page.value = 1
  q.value = ''
})

const { confirm } = useConfirm()
const toast = useToast()

async function remove(id: number) {
  const ok = await confirm('Esta acción no se puede deshacer.', { title: '¿Eliminar este registro?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    // Explicit generic: a dynamic `resource` segment makes Nitro's typed-route
    // inference match the wrong route's (GET/PUT-only) method union otherwise.
    await $fetch<{ ok: true }>(`/api/admin/${resource.value}/${id}`, { method: 'DELETE' })
    await refresh()
    toast.success('Registro eliminado')
  } catch (e: any) {
    toast.error(e?.statusMessage || 'No se ha podido eliminar el registro')
  }
}
</script>
