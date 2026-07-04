<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-14 lg:px-10">
    <div class="mb-8 flex items-end justify-between gap-4">
      <div>
        <p class="eyebrow">{{ eyebrow }}</p>
        <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ title }}</h2>
      </div>
      <NuxtLink v-if="to" :to="to" class="btn-quiet hidden shrink-0 md:inline-flex">{{ cta || 'Ver todas' }}</NuxtLink>
    </div>
    <div v-if="items.length" class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <ProjectCard v-for="p in items" :key="p.id" :project="p" />
    </div>
    <p v-else class="text-stone-500">Próximamente.</p>
    <div v-if="to" class="mt-8 text-center md:hidden">
      <NuxtLink :to="to" class="btn-quiet">{{ cta || 'Ver todas' }}</NuxtLink>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ eyebrow: string; title: string; items: any[]; to?: string; cta?: string }>()
</script>
