<template>
  <div class="mt-8">
    <div v-if="pending" class="grid grid-cols-1 gap-5 sm:grid-cols-3">
      <div v-for="i in limit" :key="i" class="skeleton aspect-[4/3] rounded-2xl" />
    </div>
    <div v-else-if="rows.length" class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="p in rows" :key="p.id" :to="`/property-details/${p.slug}`" class="block">
        <div class="aspect-[4/3] overflow-hidden rounded-2xl bg-stone-100">
          <img :src="mediaUrl(p.coverImage)" :alt="p.name" class="h-full w-full object-cover" loading="lazy" />
        </div>
        <p class="mt-3 font-serif text-lg font-medium">{{ p.name }}</p>
        <p class="text-sm text-stone-450">{{ p.community }} · {{ p.bedrooms }} hab · {{ formatPrice(p.price) }}</p>
      </NuxtLink>
    </div>
    <p v-else class="text-sm text-stone-450">No hay propiedades disponibles ahora mismo.</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ mode?: string; limit?: number }>()
const { format: formatPrice } = useCurrency()

const { data, pending } = await useFetch<any>('/api/widget/properties', {
  query: { filter: props.mode || 'latest', limit: props.limit || 3 },
})
const rows = computed(() => data.value?.rows || [])
</script>
