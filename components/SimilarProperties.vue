<template>
  <div>
    <div v-if="loading" class="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 3" :key="i" class="overflow-hidden rounded-2xl">
        <div class="skeleton aspect-[4/3] rounded-2xl" />
        <div class="skeleton mt-4 h-4 w-2/3 rounded" />
        <div class="skeleton mt-2 h-5 w-1/2 rounded" />
      </div>
    </div>
    <div v-else-if="results.length" class="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="similar-properties">
      <div v-for="r in results" :key="r.id">
        <ProjectCard :project="r" />
        <p v-if="r.similarityReason" class="mt-3 rounded-xl bg-paper px-3.5 py-2.5 text-[12px] leading-relaxed text-stone-600">{{ r.similarityReason }}</p>
      </div>
    </div>
    <p v-else class="text-sm text-stone-500">{{ t('similarProperties.empty', 'No hay propiedades suficientemente parecidas en el catálogo ahora mismo.') }}</p>

    <!-- Propiedades destacadas: las que la inmobiliaria destaca (marca «Exclusiva»),
         sin la que se está viendo ni las similares. Sin ninguna, no hay sección. -->
    <section v-if="showFeatured && featured.length" id="destacadas" class="hairline mt-14 pt-14" data-testid="featured-properties">
      <p class="eyebrow">{{ t('featuredProperties.eyebrow', 'Selección de la agencia') }}</p>
      <h2 class="heading-serif mt-3 text-3xl">{{ featuredTitle || t('featuredProperties.heading', 'Propiedades destacadas') }}</h2>
      <div class="mt-8 grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        <ProjectCard v-for="r in featured" :key="r.id" :project="r" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ slug: string; showFeatured?: boolean; featuredTitle?: string }>(), { showFeatured: true, featuredTitle: '' })
const { t } = useI18n()

const loading = ref(true)
const results = ref<any[]>([])
const featured = ref<any[]>([])

onMounted(async () => {
  try {
    const res = await $fetch<any>(`/api/public/properties/${props.slug}/similar`)
    results.value = res.results || []
    featured.value = res.featured || []
  } catch {
    results.value = []
    featured.value = []
  } finally {
    loading.value = false
  }
})
</script>
