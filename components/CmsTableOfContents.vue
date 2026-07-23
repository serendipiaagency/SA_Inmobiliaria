<template>
  <nav v-if="headings.length >= 2" class="rounded-xl border border-line bg-stone-50 p-5">
    <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-450">Índice</p>
    <ul class="mt-2 space-y-1.5 text-sm">
      <li v-for="h in headings" :key="h.id" :class="h.level === 3 ? 'pl-4' : ''">
        <a :href="`#${h.id}`" class="text-stone-600 hover:text-ink hover:underline">{{ h.text }}</a>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
const props = defineProps<{ blocks: any[] }>()
const headings = computed(() =>
  props.blocks
    .filter((b) => b.type === 'heading' && b.text)
    .map((b) => ({ id: cmsHeadingId(b), text: b.text, level: b.level })),
)
</script>
