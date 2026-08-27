<template>
  <div class="flex h-20 w-full items-center justify-center overflow-hidden rounded-lg" :class="frameBg">
    <!-- Hero: dark panel, two title bars + a search-pill mock -->
    <div v-if="type === 'hero'" class="flex w-[86%] flex-col gap-1.5">
      <div class="h-2 w-2/3 rounded-full bg-white/80" />
      <div class="h-2 w-1/2 rounded-full bg-white/50" />
      <div class="mt-1.5 h-3.5 w-3/4 rounded-full bg-white/90" />
    </div>

    <!-- Properties: a row/grid of small cards, dark variant, or an "IA" chip -->
    <div v-else-if="type === 'properties'" class="flex w-[88%] items-end gap-1.5">
      <div v-for="i in 3" :key="i" class="flex-1 overflow-hidden rounded" :class="layout === 'dark-grid' ? 'bg-white/15' : 'bg-white'">
        <div class="h-6 w-full" :class="layout === 'dark-grid' ? 'bg-white/25' : 'bg-stone-200'" />
        <div class="space-y-0.5 p-1">
          <div class="h-1 w-3/4 rounded-full" :class="layout === 'dark-grid' ? 'bg-white/40' : 'bg-stone-300'" />
          <div class="h-1 w-1/2 rounded-full" :class="layout === 'dark-grid' ? 'bg-white/30' : 'bg-stone-200'" />
        </div>
      </div>
      <span v-if="layout === 'ai-grid'" class="absolute right-3 top-3 rounded-full bg-accent-100 px-1.5 py-0.5 text-[8px] font-bold uppercase text-accent-700">IA</span>
    </div>

    <!-- Map teaser: text lines + a dotted "map" grid -->
    <div v-else-if="type === 'map-teaser'" class="flex w-[88%] items-center gap-2">
      <div class="flex-1 space-y-1">
        <div class="h-1.5 w-full rounded-full bg-stone-300" />
        <div class="h-1.5 w-2/3 rounded-full bg-stone-200" />
        <div class="mt-1 h-2.5 w-1/2 rounded-full bg-ink" />
      </div>
      <div class="grid h-12 flex-1 grid-cols-4 gap-0.5 rounded bg-stone-100 p-1">
        <div v-for="i in 8" :key="i" class="rounded-sm bg-stone-300" :class="i === 3 || i === 6 ? '!bg-ink' : ''" />
      </div>
    </div>

    <!-- Communities / property-types: a small grid of tiles -->
    <div v-else-if="type === 'communities' || type === 'property-types'" class="grid w-[80%] grid-cols-3 gap-1.5">
      <div v-for="i in 6" :key="i" class="aspect-square rounded bg-stone-200" />
    </div>

    <!-- Mortgage calculator: a slider + big number -->
    <div v-else-if="type === 'mortgage-calculator'" class="w-[80%] space-y-1.5">
      <div class="h-1.5 w-2/3 rounded-full bg-stone-300" />
      <div class="h-1.5 rounded-full bg-stone-200" />
      <div class="relative h-1 rounded-full bg-stone-200">
        <div class="absolute inset-y-0 left-0 w-2/3 rounded-full bg-ink" />
        <div class="absolute -top-1 left-[62%] h-3 w-3 rounded-full border-2 border-ink bg-white" />
      </div>
    </div>

    <!-- Blog list: article cards -->
    <div v-else-if="type === 'blog-list'" class="flex w-[88%] gap-1.5">
      <div v-for="i in 3" :key="i" class="flex-1 overflow-hidden rounded bg-white">
        <div class="h-6 w-full bg-stone-200" />
        <div class="space-y-0.5 p-1">
          <div class="h-1 w-full rounded-full bg-stone-300" />
          <div class="h-1 w-2/3 rounded-full bg-stone-200" />
        </div>
      </div>
    </div>

    <!-- Text: title + paragraph lines -->
    <div v-else-if="type === 'text'" class="w-[80%] space-y-1">
      <div class="h-2 w-1/2 rounded-full bg-stone-400" />
      <div class="h-1 w-full rounded-full bg-stone-200" />
      <div class="h-1 w-full rounded-full bg-stone-200" />
      <div class="h-1 w-2/3 rounded-full bg-stone-200" />
    </div>

    <!-- CTA: centered title + button pill -->
    <div v-else-if="type === 'cta'" class="flex w-[80%] flex-col items-center gap-1.5 text-center">
      <div class="h-1.5 w-2/3 rounded-full bg-stone-400" />
      <div class="h-2.5 w-1/3 rounded-full bg-ink" />
    </div>

    <div v-else class="h-2 w-1/3 rounded-full bg-stone-300" />
  </div>
</template>

<script setup lang="ts">
/**
 * A small, honest layout mockup for the block library — abstract rectangles
 * standing in for the block's real shape (see docs/site-builder.md), not a
 * photo or fabricated screenshot. Keyed by the same `type`/`layout` fields
 * SiteBlockRenderer.vue switches on, so it can't drift from what a preset
 * actually renders.
 */
const props = defineProps<{ type: string; layout?: string }>()

const DARK_TYPES = new Set(['hero'])
const frameBg = computed(() => {
  if (DARK_TYPES.has(props.type) || (props.type === 'properties' && props.layout === 'dark-grid')) return 'bg-ink relative'
  return 'bg-paper relative'
})
</script>
