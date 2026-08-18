<template>
  <!-- layout: row -->
  <SectionRow
    v-if="content.layout === 'row'"
    :eyebrow="content.eyebrow || ''"
    :title="content.title || ''"
    :items="items"
    :to="content.ctaTo || undefined"
    :cta="content.cta || undefined"
  />

  <!-- layout: dark-grid (Propiedades Premium) -->
  <section v-else-if="content.layout === 'dark-grid'" v-reveal class="bg-ink py-16 text-white">
    <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
      <div class="mb-8 flex items-end justify-between">
        <div>
          <p class="eyebrow !text-white/50">{{ content.eyebrow }}</p>
          <h2 class="mt-3 font-serif text-3xl font-medium md:text-4xl">{{ content.title }}</h2>
        </div>
        <NuxtLink
          v-if="content.cta && content.ctaTo"
          :to="content.ctaTo"
          class="hidden shrink-0 border border-white/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest2 transition hover:bg-white hover:text-ink md:inline-flex"
        >
          {{ content.cta }}
        </NuxtLink>
      </div>
      <div class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink v-for="p in items" :key="p.id" :to="`/demo/property-details/${p.slug || p.id}`" class="group block">
          <div class="aspect-[4/3] overflow-hidden rounded-2xl bg-black/30">
            <img :src="mediaUrl(p.coverImage)" :alt="p.name" class="h-full w-full object-cover opacity-90 transition duration-700 group-hover:scale-105 group-hover:opacity-100" loading="lazy" />
          </div>
          <p class="mt-4 text-lg font-semibold">{{ formatPrice(p.price) }}</p>
          <h3 class="font-serif text-xl font-medium">{{ p.name }}</h3>
          <p class="text-[13px] text-white/60">{{ p.community }}</p>
        </NuxtLink>
      </div>
    </div>
  </section>

  <!-- layout: ai-grid (IA recomienda) -->
  <section v-else-if="content.layout === 'ai-grid'" v-reveal class="border-t border-line bg-paper py-16">
    <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
      <div class="flex items-center gap-2">
        <span v-if="content.badge" class="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest2 text-white">{{ content.badge }}</span>
        <p class="eyebrow !text-stone-450">{{ content.eyebrow }}</p>
      </div>
      <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ content.title }}</h2>
      <div class="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        <ProjectCard v-for="p in items" :key="p.id" :project="p" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  content: Record<string, any>
  projects: any[]
}>()

const items = computed(() => {
  const all = props.projects || []
  const limit = Number(props.content.limit) || 4
  switch (props.content.dynamicFilter) {
    case 'featured': {
      const exclusive = all.filter((p) => p.isExclusive)
      return (exclusive.length ? exclusive : all).slice(0, limit)
    }
    case 'premium':
      return [...all].sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, limit)
    case 'recommended':
      return [...all].sort((a, b) => (b.rentalYield || 0) - (a.rentalYield || 0)).slice(0, limit)
    case 'latest':
    default:
      return all.slice(0, limit)
  }
})

const { format: formatPrice } = useCurrency()
</script>
