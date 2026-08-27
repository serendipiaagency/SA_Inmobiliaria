<template>
  <label class="mb-3 block">
    <span class="label">{{ label }}</span>
    <div class="flex items-center gap-2">
      <button type="button" class="stepper-btn" :disabled="modelValue <= min" @click="set(modelValue - 1)">−</button>
      <span class="w-8 text-center text-sm font-semibold tabular-nums text-ink">{{ modelValue }}</span>
      <button type="button" class="stepper-btn" :disabled="modelValue >= max" @click="set(modelValue + 1)">+</button>
      <span v-if="hint" class="ml-1 text-[11px] text-stone-400">{{ hint }}</span>
    </div>
  </label>
</template>

<script setup lang="ts">
// Spec: "No quiero: maxItems: 6 / Quiero: Número de propiedades − 6 +" — a
// stepper instead of a raw <input type="number">, for the small bounded
// counts (item limits) the site-builder actually has (never a free-typed
// arbitrary number).
const props = withDefaults(defineProps<{ label: string; modelValue: number; min?: number; max?: number; hint?: string }>(), { min: 1, max: 12 })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

function set(v: number) {
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, v)))
}
</script>

<style scoped>
.stepper-btn {
  @apply flex h-7 w-7 items-center justify-center rounded-lg border border-line text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-30;
}
</style>
