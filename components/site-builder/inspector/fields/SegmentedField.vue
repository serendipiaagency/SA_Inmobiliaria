<template>
  <!-- Un grupo con nombre, no un <label>: un <label> que envuelve botones le
       da su texto como nombre al primero («Fondo Imagen fija» para el botón
       «Bucle de imágenes»), y así lo anunciaba un lector de pantalla. -->
  <div class="mb-3 block" role="group" :aria-labelledby="labelId">
    <span :id="labelId" class="label">{{ label }}</span>
    <div class="flex flex-wrap gap-1 rounded-lg bg-stone-100 p-1">
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition"
        :class="modelValue === opt.value ? 'bg-white text-ink shadow-sm' : 'text-stone-500 hover:text-ink'"
        :aria-pressed="modelValue === opt.value"
        @click="$emit('update:modelValue', opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; modelValue: string; options: { value: string; label: string }[] }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
const labelId = useId()
</script>
