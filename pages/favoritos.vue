<template>
  <div>
    <header class="border-b border-line bg-white">
      <div class="mx-auto max-w-screen-2xl px-6 pb-10 pt-12 lg:px-10">
        <p class="eyebrow">Tu selección</p>
        <h1 class="heading-serif mt-3 text-4xl md:text-5xl">Favoritos</h1>
      </div>
    </header>
    <div class="mx-auto max-w-screen-2xl px-6 py-14 lg:px-10">
      <div v-if="saved.length" class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <ProjectCard v-for="p in saved" :key="p.id" :project="p" />
      </div>
      <div v-else class="py-24 text-center">
        <p class="font-serif text-2xl text-stone-500">Aún no has guardado ninguna propiedad.</p>
        <NuxtLink to="/properties" class="btn-primary mt-6">Explorar propiedades</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Favoritos — SA Inmobiliaria' })
const { ids, load } = useFavorites()
const { data } = await useFetch('/api/public/properties', { query: { perPage: 48 } })
onMounted(load)
const saved = computed(() => (data.value?.rows || []).filter((p: any) => ids.value.includes(p.id)))
</script>
