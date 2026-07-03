<template>
  <div>
    <header class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 pb-8 pt-12 lg:px-10">
        <p class="eyebrow">Portfolio</p>
        <h1 class="heading-serif mt-3 text-4xl md:text-5xl">Off-plan projects</h1>
        <p v-if="data" class="mt-3 text-sm text-stone-500">{{ data.total }} project(s) available</p>
      </div>
      <div class="mx-auto max-w-screen-2xl px-6 pb-6 lg:px-10">
        <form class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" @submit.prevent="apply">
          <input v-model="filters.q" class="input lg:col-span-2" placeholder="Project name…" />
          <input v-model="filters.community" class="input" placeholder="Community" />
          <select v-model="filters.status" class="input">
            <option value="">Any status</option>
            <option value="new">New launch</option>
            <option value="under_construction">Under construction</option>
            <option value="ready">Ready</option>
          </select>
          <input v-model="filters.minPrice" type="number" class="input" placeholder="Min price (AED)" />
          <div class="flex gap-2">
            <input v-model="filters.maxPrice" type="number" class="input" placeholder="Max price" />
            <button type="submit" class="btn-primary shrink-0 !px-6">Filter</button>
          </div>
        </form>
      </div>
    </header>

    <div class="mx-auto max-w-screen-2xl px-6 py-14 lg:px-10">
      <div v-if="data?.rows?.length" class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <ProjectCard v-for="p in data.rows" :key="p.id" :project="p" />
      </div>
      <div v-else class="py-24 text-center">
        <p class="font-serif text-2xl text-stone-500">No projects match your filters.</p>
        <button class="btn-quiet mt-6" @click="reset">Clear filters</button>
      </div>

      <div v-if="totalPages > 1" class="mt-14 flex items-center justify-center gap-4">
        <button class="btn-quiet" :disabled="page <= 1" @click="go(page - 1)">← Previous</button>
        <span class="text-[11px] font-semibold uppercase tracking-widest text-stone-450">
          Page {{ page }} of {{ totalPages }}
        </span>
        <button class="btn-quiet" :disabled="page >= totalPages" @click="go(page + 1)">Next →</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Off-plan projects — SA Inmobiliaria' })
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
function reset() {
  Object.keys(filters).forEach((k) => ((filters as any)[k] = ''))
  router.push({ query: {} })
}
function go(p: number) {
  router.push({ query: { ...route.query, page: String(p) } })
}
</script>
