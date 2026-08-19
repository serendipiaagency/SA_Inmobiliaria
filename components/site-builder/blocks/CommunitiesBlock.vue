<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10">
    <div class="flex items-end justify-between">
      <div>
        <p class="eyebrow">{{ content.eyebrow }}</p>
        <h2 class="heading-serif mt-3 text-3xl md:text-4xl">{{ content.title }}</h2>
      </div>
      <NuxtLink v-if="content.cta && content.ctaTo" :to="content.ctaTo" class="btn-quiet hidden shrink-0 md:inline-flex">{{ content.cta }}</NuxtLink>
    </div>
    <div class="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="c in items" :key="c.id" :to="`/demo/community/${c.id}`" class="group relative block aspect-[3/2] overflow-hidden rounded-2xl bg-stone-100">
        <img :src="mediaUrl(c.image)" :alt="c.name" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" />
        <div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/10 to-transparent p-6">
          <div>
            <h3 class="font-serif text-2xl font-medium text-white">{{ c.name }}</h3>
            <p v-if="c.location" class="mt-1 text-[11px] font-semibold uppercase tracking-widest2 text-white/70">{{ c.location }}</p>
          </div>
        </div>
      </NuxtLink>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{ content: Record<string, any>; communities: any[] }>()
const items = computed(() => {
  const all = props.communities || []
  const limit = Number(props.content.limit) || 6
  if (props.content.source === 'manual') {
    const ids: number[] = Array.isArray(props.content.manualIds) ? props.content.manualIds : []
    const byId = new Map(all.map((c) => [c.id, c]))
    return ids.map((id) => byId.get(id)).filter(Boolean).slice(0, limit)
  }
  return all.slice(0, limit)
})
</script>
