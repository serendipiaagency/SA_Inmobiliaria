<template>
  <div>
    <EditorField label="Eyebrow"><input v-model="content.eyebrow" :class="inputCls" /></EditorField>
    <EditorField label="Título"><input v-model="content.title" :class="inputCls" /></EditorField>
    <p class="text-[12px] text-stone-400">
      Los tipos se generan automáticamente a partir de tus propiedades — este bloque no lleva más ajustes.
    </p>
  </div>
</template>

<script setup lang="ts">
import EditorField from './EditorField.vue'

const content = defineModel<Record<string, any>>('content', { required: true })
const inputCls = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none'
</script>
