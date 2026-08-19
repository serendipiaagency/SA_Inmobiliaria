<template>
  <label class="mb-3 block">
    <span class="label">{{ label }}</span>
    <select :value="modelValue" class="input" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
      <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
    </select>
    <span v-if="hint" class="mt-1 block text-[11px] text-stone-400">{{ hint }}</span>
  </label>
</template>

<script setup lang="ts">
defineProps<{ label: string; modelValue: string; options: { value: string; label: string }[]; hint?: string }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
