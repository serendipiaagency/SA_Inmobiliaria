<template>
  <section v-if="types.length" v-reveal class="border-y border-line bg-white py-16">
    <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
      <p class="eyebrow">{{ content.eyebrow }}</p>
      <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ content.title }}</h2>
      <div class="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <NuxtLink v-for="pt in types" :key="pt" :to="{ path: '/demo/properties', query: { type: pt } }" class="flex items-center justify-between rounded-xl border border-line px-5 py-4 text-sm transition hover:border-ink hover:bg-paper">
          <span class="font-medium">{{ pt }}</span>
          <span class="text-stone-400 transition group-hover:text-ink">→</span>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{ content: Record<string, any>; projects: any[] }>()
const types = computed(() => [...new Set((props.projects || []).map((p) => p.propertyType).filter(Boolean))])
</script>
