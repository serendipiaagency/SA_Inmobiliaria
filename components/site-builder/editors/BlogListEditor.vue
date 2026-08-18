<template>
  <div>
    <EditorField label="Eyebrow"><input v-model="content.eyebrow" :class="inputCls" /></EditorField>
    <EditorField label="Título"><input v-model="content.title" :class="inputCls" /></EditorField>
    <EditorField label="Nº de artículos" hint="Siempre en vivo, tomados del Blog.">
      <input v-model.number="content.limit" type="number" min="1" max="9" :class="inputCls" />
    </EditorField>
    <EditorField label="Botón"><input v-model="content.cta" :class="inputCls" placeholder="Texto (vacío = sin botón)" /></EditorField>
    <EditorField label="Enlace del botón"><input v-model="content.ctaTo" :class="inputCls" placeholder="/demo/blog" /></EditorField>
  </div>
</template>

<script setup lang="ts">
import EditorField from './EditorField.vue'

const content = defineModel<Record<string, any>>('content', { required: true })
const inputCls = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none'
</script>
