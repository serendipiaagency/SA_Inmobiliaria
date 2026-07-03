<template>
  <div class="mx-auto max-w-7xl px-4 py-10">
    <h1 class="mb-6 text-3xl font-bold">Off-plan projects</h1>

    <form class="card mb-8 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6" @submit.prevent="apply">
      <input v-model="filters.q" class="input lg:col-span-2" placeholder="Project name…" />
      <input v-model="filters.community" class="input" placeholder="Community" />
      <select v-model="filters.status" class="input">
        <option value="">Any status</option>
        <option value="new">New launch</option>
        <option value="under_construction">Under construction</option>
        <option value="ready">Ready</option>
      </select>
      <input v-model="filters.minPrice" type="number" class="input" placeholder="Min price" />
      <div class="flex gap-2">
        <input v-model="filters.maxPrice" type="number" class="input" placeholder="Max price" />
        <button type="submit" class="btn-primary shrink-0">Filter</button>
      </div>
    </form>

    <div v-if="data?.rows?.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <ProjectCard v-for="p in data.rows" :key="p.id" :project="p" />
    </div>
    <p v-else class="py-16 text-center text-slate-500">No projects match your filters.</p>

    <div v-if="totalPages > 1" class="mt-10 flex items-center justify-center gap-3">
      <button class="btn-secondary" :disabled="page <= 1" @click="go(page - 1)">← Prev</button>
      <span class="text-sm text-slate-600">Page {{ page }} / {{ totalPages }}</span>
      <button class="btn-secondary" :disabled="page >= totalPages" @click="go(page + 1)">Next →</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const router = useRouter()

const filters = reactive({
  q: String(route.query.q || ''),
  community: String(route.query.community || ''),
  status: String(route.query.status || ''),
  minPrice: String(route.query.minPrice || ''),
  maxPrice: String(route.query.maxPrice || ''),
})
const page = computed(() => Math.max(1, parseInt(String(route.query.page || '1'), 10) || 1))

const { data } = await useFetch('/api/public/properties', {
  query: computed(() => ({ ...route.query, page: page.value })),
})
const totalPages = computed(() => Math.ceil((data.value?.total || 0) / (data.value?.perPage || 12)))

function apply() {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(filters)) if (v) query[k] = v
  router.push({ query })
}
function go(p: number) {
  router.push({ query: { ...route.query, page: String(p) } })
}
</script>
