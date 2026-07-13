<template>
  <div>
    <header class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 pb-10 pt-12 lg:px-10">
        <p class="eyebrow">{{ t('favoritos.eyebrow', 'Tu selección') }}</p>
        <h1 class="heading-serif mt-3 text-4xl md:text-5xl">{{ t('nav.favorites', 'Favoritos') }}</h1>
      </div>
    </header>
    <div class="mx-auto max-w-screen-2xl px-6 py-14 lg:px-10">
      <div v-if="loading" class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div v-for="i in 4" :key="i" class="skeleton aspect-[4/3] rounded-2xl" />
      </div>
      <div v-else-if="saved.length" class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <ProjectCard v-for="p in saved" :key="p.id" :project="p" />
      </div>
      <div v-else class="py-24 text-center">
        <p class="font-serif text-2xl text-stone-500">{{ t('favoritos.empty', 'Aún no has guardado ninguna propiedad.') }}</p>
        <NuxtLink to="/properties" class="btn-primary mt-6">{{ t('properties.exploreCta', 'Explorar propiedades') }}</NuxtLink>
      </div>

      <div class="hairline mt-16 pt-14">
        <h2 class="heading-serif text-2xl">{{ t('search.savedSearches') }}</h2>
        <div v-if="searches.length" class="mt-6 space-y-3">
          <div v-for="s in searches" :key="s.id" class="flex items-center justify-between gap-4 rounded-xl border border-line bg-white px-5 py-4">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium capitalize">{{ s.label }}</p>
              <p class="text-[12px] text-stone-400">{{ dt.relative(new Date(s.createdAt).toISOString()) }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-4">
              <NuxtLink :to="{ path: '/properties', query: s.query }" class="text-[11px] font-semibold uppercase tracking-widest text-ink hover:underline">
                {{ t('search.viewResults') }}
              </NuxtLink>
              <button type="button" class="text-[11px] font-semibold uppercase tracking-widest text-stone-400 hover:text-rose-600" @click="removeSearch(s.id)">
                {{ t('search.remove') }}
              </button>
            </div>
          </div>
        </div>
        <p v-else class="mt-4 text-sm text-stone-500">{{ t('search.savedEmpty') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead(
  seoHead({
    title: t('favoritos.head.title', 'Favoritos — M&M Real Estate'),
    description: 'Tus propiedades guardadas en M&M Real Estate.',
  }),
)
const dt = useDash()
const { ids, load } = useFavorites()
const { items: searches, load: loadSearches, remove: removeSearch } = useSavedSearches()
const saved = ref<any[]>([])
const loading = ref(true)
onMounted(async () => {
  load()
  loadSearches()
  try {
    if (ids.value.length) {
      const res = await $fetch<any>('/api/public/properties', { query: { ids: ids.value.join(',') } })
      saved.value = res.rows || []
    }
  } finally {
    loading.value = false
  }
})
</script>
