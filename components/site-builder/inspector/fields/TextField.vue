<template>
  <label class="mb-3 block">
    <span class="label">{{ label }}</span>
    <textarea v-if="multiline" :value="modelValue" class="input" :rows="rows" :placeholder="placeholder" @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" />
    <input v-else :value="modelValue" class="input" :placeholder="placeholder" @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
    <span v-if="hint" class="mt-1 block text-[11px] text-stone-400">{{ hint }}</span>
  </label>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{ label: string; modelValue: string; hint?: string; placeholder?: string; multiline?: boolean; rows?: number }>(),
  { rows: 3 },
)
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
