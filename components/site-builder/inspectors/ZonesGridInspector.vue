<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Subtítulo" :model-value="content.text || ''" @update:model-value="(v) => (content.text = v)" />
    </InspectorSection>

    <InspectorSection title="Datos">
      <StepperField label="Número de zonas" hint="Las zonas publicadas con prioridad en la portada, de mayor a menor (Portal Web → Zonas)." :model-value="content.limit || 6" :min="1" :max="12" @update:model-value="(v) => (content.limit = v)" />
    </InspectorSection>

    <InspectorSection title="Comportamiento">
      <TextField label="Botón" :model-value="content.cta || ''" placeholder="Texto (vacío = sin botón)" @update:model-value="(v) => (content.cta = v)" />
      <TextField label="Enlace del botón" :model-value="content.ctaTo || ''" placeholder="/zonas/asturias" @update:model-value="(v) => (content.ctaTo = v)" />
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <p class="text-sm text-stone-400">Este bloque no tiene opciones de diseño propias.</p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import StepperField from '../inspector/fields/StepperField.vue'

defineProps<{ content: Record<string, any> }>()
</script>
