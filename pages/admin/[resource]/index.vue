<template>
  <div v-if="meta">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">{{ meta.label }}</h1>
      <div class="flex gap-2">
        <input v-model="q" class="input !w-56" placeholder="Search…" @keyup.enter="page = 1" />
        <NuxtLink v-if="!meta.readonly" :to="`/admin/${resource}/new`" class="btn-primary">+ New</NuxtLink>
      </div>
    </div>

    <div class="card overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th v-for="f in meta.listFields" :key="f" class="px-4 py-3">{{ f }}</th>
            <th class="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data?.rows || []" :key="row.id" class="border-t border-slate-100 hover:bg-slate-50">
            <td v-for="f in meta.listFields" :key="f" class="max-w-xs truncate px-4 py-3">
              {{ row[f] }}
            </td>
            <td class="whitespace-nowrap px-4 py-3 text-right">
              <NuxtLink :to="`/admin/${resource}/${row.id}`" class="mr-3 font-medium text-emerald-700 hover:underline">
                {{ meta.readonly ? 'View' : 'Edit' }}
              </NuxtLink>
              <button class="font-medium text-red-600 hover:underline" @click="remove(row.id)">Delete</button>
            </td>
          </tr>
          <tr v-if="!data?.rows?.length">
            <td :colspan="meta.listFields.length + 1" class="px-4 py-10 text-center text-slate-400">No records.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="mt-4 flex items-center justify-end gap-3 text-sm">
      <button class="btn-secondary !py-1.5" :disabled="page <= 1" @click="page--">← Prev</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button class="btn-secondary !py-1.5" :disabled="page >= totalPages" @click="page++">Next →</button>
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
  throw createError({ statusCode: 404, statusMessage: 'Unknown resource', fatal: true })
}
useHead({ title: computed(() => `${meta.value?.label || 'Admin'} — SA Inmobiliaria`) })

const { data, refresh } = await useFetch<any>(() => `/api/admin/${resource.value}`, {
  query: computed(() => ({ page: page.value, q: q.value })),
})
const totalPages = computed(() => Math.ceil((data.value?.total || 0) / (data.value?.perPage || 20)))

watch(resource, () => {
  page.value = 1
  q.value = ''
})

async function remove(id: number) {
  if (!confirm('Delete this record? This cannot be undone.')) return
  await $fetch(`/api/admin/${resource.value}/${id}`, { method: 'DELETE' })
  await refresh()
}
</script>
