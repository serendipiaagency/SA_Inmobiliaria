<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
    </InspectorSection>
    <InspectorSection title="Datos">
      <label class="mb-3 block">
        <span class="label">Nº de artículos</span>
        <input v-model.number="content.limit" type="number" min="1" max="9" class="input" />
        <span class="mt-1 block text-[11px] text-stone-400">Siempre en vivo, tomados del Blog.</span>
      </label>
    </InspectorSection>
    <InspectorSection title="Comportamiento">
      <TextField label="Botón" :model-value="content.cta || ''" placeholder="Texto (vacío = sin botón)" @update:model-value="(v) => (content.cta = v)" />
      <TextField label="Enlace del botón" :model-value="content.ctaTo || ''" placeholder="/blog" @update:model-value="(v) => (content.ctaTo = v)" />
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'

defineProps<{ content: Record<string, any> }>()
</script>
