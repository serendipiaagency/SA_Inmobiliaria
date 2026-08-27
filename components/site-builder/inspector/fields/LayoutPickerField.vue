<template>
  <div class="mb-3">
    <span class="label">{{ label }}</span>
    <div class="grid grid-cols-2 gap-2">
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="overflow-hidden rounded-lg border p-1.5 text-left transition"
        :class="modelValue === opt.value ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-stone-400'"
        @click="emit('update:modelValue', opt.value)"
      >
        <SectionPreview :type="type" :layout="opt.value" />
        <p class="mt-1.5 truncate text-[11px] font-medium text-ink">{{ opt.label }}</p>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Spec: "No quiero: layout = grid_dark / Quiero cards visuales: Fila |
// Cuadrícula | Carrusel | Editorial" — a labeled <select> is already
// comprehensible, but a real layout mockup (reusing the same
// SectionPreview.vue the section library uses) is what actually lets an
// admin recognize the option instead of reading it.
import SectionPreview from '~/components/site-builder/shell/SectionPreview.vue'

defineProps<{ label: string; modelValue: string; type: string; options: { value: string; label: string }[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
