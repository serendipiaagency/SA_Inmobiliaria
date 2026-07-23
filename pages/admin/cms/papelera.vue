<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Papelera</h1>
      <p class="mt-1 text-sm text-stone-500">Artículos eliminados — restáuralos o bórralos definitivamente.</p>
    </div>

    <div class="card overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="px-4 py-3">Título</th>
            <th class="px-4 py-3">Última edición</th>
            <th class="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in data?.rows || []" :key="a.id" class="border-t border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-3 font-medium">{{ a.title }}</td>
            <td class="px-4 py-3 text-stone-450">{{ new Date(a.updatedAt).toLocaleDateString('es-ES') }}</td>
            <td class="whitespace-nowrap px-4 py-3 text-right">
              <button class="mr-3 font-medium text-emerald-700 hover:underline" @click="restore(a.id)">Restaurar</button>
              <button class="font-medium text-red-600 hover:underline" @click="destroy(a.id)">Eliminar definitivamente</button>
            </td>
          </tr>
          <tr v-if="!data?.rows?.length">
            <td colspan="3" class="px-4 py-14 text-center">
              <p class="text-sm font-medium text-slate-500">La papelera está vacía</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Papelera — Blog & CMS' })

const toast = useToast()
const { confirm } = useConfirm()
const { data, refresh } = await useFetch<any>('/api/admin/cms/articles', { query: { trashed: 1, perPage: 100 } })

async function restore(id: number) {
  await $fetch(`/api/admin/cms/articles/${id}/restore`, { method: 'POST' })
  toast.success('Artículo restaurado como borrador')
  await refresh()
}

async function destroy(id: number) {
  const ok = await confirm('Esta acción es permanente y no se puede deshacer.', { title: '¿Eliminar definitivamente?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  await $fetch(`/api/admin/cms/articles/${id}?hard=1`, { method: 'DELETE' })
  toast.success('Artículo eliminado definitivamente')
  await refresh()
}
</script>
