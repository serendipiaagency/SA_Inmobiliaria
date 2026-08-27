<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Texto" multiline :model-value="content.text || ''" @update:model-value="(v) => (content.text = v)" />
      <p class="text-[11px] text-stone-400">La calculadora usa el precio medio y la rentabilidad media de tus propiedades activas.</p>
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <p class="text-sm text-stone-400">Este bloque no tiene opciones de diseño propias.</p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'

defineProps<{ content: Record<string, any> }>()
</script>
