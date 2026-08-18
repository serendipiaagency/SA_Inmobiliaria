<template>
  <div>
    <EditorField label="Eyebrow"><input v-model="content.eyebrow" :class="inputCls" /></EditorField>
    <EditorField label="Título"><input v-model="content.title" :class="inputCls" /></EditorField>
    <EditorField label="Nº de comunidades" hint="Siempre en vivo, tomadas de Comunidades.">
      <input v-model.number="content.limit" type="number" min="1" max="12" :class="inputCls" />
    </EditorField>
  </div>
</template>

<script setup lang="ts">
import EditorField from './EditorField.vue'

const content = defineModel<Record<string, any>>('content', { required: true })
const inputCls = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none'
</script>
