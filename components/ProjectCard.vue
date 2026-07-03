<template>
  <NuxtLink :to="`/property-details/${project.slug || project.id}`" class="group block bg-white">
    <div class="relative aspect-[4/3] overflow-hidden bg-stone-100">
      <img
        :src="mediaUrl(project.coverImage)"
        :alt="project.name"
        class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        loading="lazy"
      />
      <span
        class="absolute left-4 top-4 bg-white/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest2 text-ink"
      >
        {{ statusLabel }}
      </span>
    </div>
    <div class="border border-t-0 border-line px-5 py-5">
      <p class="text-lg font-semibold tracking-tight">{{ formatPrice(project.price) }}</p>
      <h3 class="mt-1 truncate font-serif text-xl font-medium group-hover:underline group-hover:underline-offset-4">
        {{ project.name }}
      </h3>
      <p class="mt-1.5 truncate text-[13px] text-stone-500">
        <span v-if="project.community">{{ project.community }}</span>
        <span v-if="project.community && project.developerName" class="mx-1.5 text-stone-300">·</span>
        <span v-if="project.developerName">{{ project.developerName }}</span>
      </p>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
const props = defineProps<{
  project: {
    id: number
    slug?: string | null
    name: string
    community?: string | null
    coverImage?: string | null
    price?: number | null
    status?: string
    developerName?: string | null
  }
}>()

const statusLabel = computed(() => {
  const s = props.project.status || 'new'
  if (s === 'new') return 'New Launch'
  if (s === 'ready') return 'Ready'
  return s.replace(/_/g, ' ')
})
</script>
