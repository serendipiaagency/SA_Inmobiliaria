<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10">
    <p class="eyebrow">{{ content.eyebrow }}</p>
    <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ content.title }}</h2>
    <p class="mt-4 max-w-md text-[15px] text-stone-500">{{ content.text }}</p>
    <div class="mt-8"><MortgageCalculator :price="medianPrice" :rental-yield="avgYield" /></div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{ content: Record<string, any>; projects: any[] }>()

const medianPrice = computed(() => {
  const ps = (props.projects || []).map((p) => p.price || 0).filter(Boolean).sort((a, b) => a - b)
  return ps.length ? ps[Math.floor(ps.length / 2)] : 1200000
})
const avgYield = computed(() => {
  const ys = (props.projects || []).map((p) => p.rentalYield).filter((y: any): y is number => !!y)
  return ys.length ? Math.round((ys.reduce((a: number, y: number) => a + y, 0) / ys.length) * 10) / 10 : null
})
</script>
