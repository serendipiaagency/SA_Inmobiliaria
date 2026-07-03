<template>
  <NuxtLink :to="`/property-details/${project.slug || project.id}`" class="card group block">
    <div class="relative h-48 overflow-hidden bg-slate-200">
      <img
        :src="mediaUrl(project.coverImage)"
        :alt="project.name"
        class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        loading="lazy"
      />
      <span
        class="absolute left-3 top-3 rounded-full bg-emerald-700/90 px-3 py-1 text-xs font-semibold uppercase text-white"
      >
        {{ statusLabel }}
      </span>
    </div>
    <div class="p-4">
      <h3 class="truncate text-lg font-semibold group-hover:text-emerald-700">{{ project.name }}</h3>
      <p v-if="project.community" class="mt-0.5 truncate text-sm text-slate-500">{{ project.community }}</p>
      <p v-if="project.developerName" class="truncate text-xs text-slate-400">by {{ project.developerName }}</p>
      <p class="mt-2 font-semibold text-emerald-800">{{ formatPrice(project.price) }}</p>
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

const statusLabel = computed(() => (props.project.status || 'new').replace(/_/g, ' '))
</script>
