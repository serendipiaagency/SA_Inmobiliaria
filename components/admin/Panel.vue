<template>
  <section class="rounded-xl border border-line bg-white">
    <header v-if="title || $slots.action" class="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <div>
        <h3 class="text-sm font-semibold text-ink">{{ title }}</h3>
        <p v-if="sub" class="mt-0.5 text-xs text-stone-500">{{ sub }}</p>
      </div>
      <slot name="action" />
    </header>
    <div :class="pad ? 'p-5' : ''">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title?: string; sub?: string; pad?: boolean }>(), { pad: true })
</script>
