<template>
  <label class="mb-3 flex items-center justify-between gap-3 py-1">
    <span class="text-sm text-stone-700">{{ label }}</span>
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      class="relative h-5 w-9 shrink-0 rounded-full transition"
      :class="modelValue ? 'bg-ink' : 'bg-stone-200'"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <span class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" :class="modelValue ? 'left-[1.15rem]' : 'left-0.5'" />
    </button>
  </label>
</template>

<script setup lang="ts">
defineProps<{ label: string; modelValue: boolean }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>
