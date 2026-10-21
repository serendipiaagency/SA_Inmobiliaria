<template>
  <label class="mb-3 block">
    <span class="label">{{ label }}</span>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-full border-2 transition"
        :class="modelValue === opt.value ? 'border-ink' : 'border-transparent hover:border-line'"
        :title="opt.label"
        @click="$emit('update:modelValue', opt.value)"
      >
        <span class="h-6 w-6 rounded-full ring-1 ring-inset ring-black/10" :class="opt.swatchClass" :style="opt.swatchStyle" />
      </button>
    </div>
  </label>
</template>

<script setup lang="ts">
// `swatchStyle` permite un color en línea (p. ej. el color de marca del Brand
// Kit, que no es una clase fija): el «Color corporativo» del fondo (Cola 27).
defineProps<{ label: string; modelValue: string; options: { value: string; label: string; swatchClass?: string; swatchStyle?: Record<string, string> }[] }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
