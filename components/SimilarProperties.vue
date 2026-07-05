<template>
  <div v-if="loading" class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
    <div v-for="i in 3" :key="i" class="overflow-hidden rounded-2xl">
      <div class="skeleton aspect-[4/3] rounded-2xl" />
      <div class="skeleton mt-4 h-4 w-2/3 rounded" />
      <div class="skeleton mt-2 h-5 w-1/2 rounded" />
    </div>
  </div>
  <div v-else-if="results.length" class="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
    <div v-for="r in results" :key="r.id">
      <ProjectCard :project="r" />
      <div class="mt-3 flex items-start gap-2 rounded-xl bg-paper px-3.5 py-2.5">
        <span class="mt-0.5 shrink-0 rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">IA</span>
        <p class="text-[12px] leading-relaxed text-stone-600">{{ r.similarityReason }}</p>
      </div>
    </div>
  </div>
  <p v-else class="text-sm text-stone-500">No hay propiedades suficientemente parecidas en el catálogo ahora mismo.</p>
</template>

<script setup lang="ts">
const props = defineProps<{ slug: string }>()

const loading = ref(true)
const results = ref<any[]>([])

onMounted(async () => {
  try {
    const res = await $fetch<any>(`/api/public/properties/${props.slug}/similar`)
    results.value = res.results || []
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
})
</script>
