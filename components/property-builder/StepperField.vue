<template>
  <div class="block" :class="span === 2 ? 'sm:col-span-2' : ''">
    <span class="label">{{ label }}</span>
    <div class="flex items-center gap-2">
      <button type="button" class="stepper-btn" :disabled="value <= min" @click="set(value - 1)">−</button>
      <span class="w-8 text-center text-sm font-semibold tabular-nums text-ink">{{ value }}</span>
      <button type="button" class="stepper-btn" :disabled="value >= max" @click="set(value + 1)">+</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// A stepper instead of a raw <input type="number"> for small bounded counts
// (habitaciones, baños) — matches the reference builder's UI for these
// fields. Unlike site-builder's StepperField, modelValue can be null (no
// count set yet), so it's treated as `min` until the user interacts.
const props = withDefaults(defineProps<{ label: string; modelValue: number | null; span?: 1 | 2; min?: number; max?: number }>(), { min: 0, max: 20 })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const value = computed(() => props.modelValue ?? props.min)

function set(v: number) {
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, v)))
}
</script>

<style scoped>
.stepper-btn {
  @apply flex h-7 w-7 items-center justify-center rounded-lg border border-line text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-30;
}
</style>
