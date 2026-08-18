<template>
  <label class="mb-3 block">
    <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">{{ label }}</span>
    <slot />
    <span v-if="hint" class="mt-1 block text-[11px] text-stone-400">{{ hint }}</span>
  </label>
</template>

<script setup lang="ts">
defineProps<{ label: string; hint?: string }>()
</script>
