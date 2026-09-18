<template>
  <div class="flex items-start justify-between gap-4">
    <dt class="shrink-0 text-stone-500">{{ label }}</dt>
    <dd class="min-w-0 text-right" :class="value ? 'text-stone-700' : 'text-stone-300'">{{ value || '—' }}</dd>
  </div>
</template>

<script setup lang="ts">
// Un campo vacío se marca con un guion y en gris claro, no se esconde: que
// falte el teléfono de un cliente es información, y ocultarlo hace que la
// ficha parezca completa cuando no lo está.
defineProps<{ label: string; value: string | null | undefined }>()
</script>
