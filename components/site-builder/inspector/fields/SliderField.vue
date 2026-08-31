<template>
  <label class="mb-3 block">
    <span class="label flex items-center justify-between">
      {{ label }}
      <span class="text-stone-400">{{ display }}</span>
    </span>
    <input
      type="range"
      class="w-full accent-ink"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @input="$emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    >
  </label>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{ label: string; modelValue: number; min?: number; max?: number; step?: number; unit?: string }>(),
  { min: 0, max: 100, step: 1, unit: '%' },
)
defineEmits<{ 'update:modelValue': [value: number] }>()
const display = computed(() => `${props.modelValue}${props.unit}`)
</script>
