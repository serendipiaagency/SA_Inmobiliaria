<template>
  <div class="border-b border-line py-3 first:pt-0 last:border-b-0">
    <button type="button" class="flex w-full items-center justify-between text-left" @click="open = !open">
      <span class="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{{ title }}</span>
      <svg class="h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform" :class="open ? 'rotate-180' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <div v-show="open" class="mt-3">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ title: string; defaultOpen?: boolean }>(), { defaultOpen: true })
const open = ref(props.defaultOpen)
</script>
