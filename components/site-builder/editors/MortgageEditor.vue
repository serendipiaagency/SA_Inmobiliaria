<template>
  <div>
    <EditorField label="Eyebrow"><input v-model="content.eyebrow" :class="inputCls" /></EditorField>
    <EditorField label="Título"><input v-model="content.title" :class="inputCls" /></EditorField>
    <EditorField label="Texto"><textarea v-model="content.text" :class="inputCls" rows="3" /></EditorField>
    <p class="text-[12px] text-stone-400">La calculadora usa el precio medio y la rentabilidad media de tus propiedades activas.</p>
  </div>
</template>

<script setup lang="ts">
import EditorField from './EditorField.vue'

const content = defineModel<Record<string, any>>('content', { required: true })
const inputCls = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none'
</script>
