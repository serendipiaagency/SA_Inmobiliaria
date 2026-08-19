<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Subtítulo" :model-value="content.subtitle || ''" @update:model-value="(v) => (content.subtitle = v)" />
      <TextField label="Cuerpo" multiline :rows="6" :model-value="content.body || ''" @update:model-value="(v) => (content.body = v)" />
    </InspectorSection>

    <InspectorSection title="Diseño">
      <SegmentedField label="Alineación" :model-value="content.align || 'left'" :options="[{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centrado' }]" @update:model-value="(v) => (content.align = v)" />
      <SelectField label="Ancho máximo" :model-value="content.maxWidth || 'md'" :options="[{ value: 'sm', label: 'Estrecho' }, { value: 'md', label: 'Normal' }, { value: 'lg', label: 'Ancho' }, { value: 'full', label: 'Completo' }]" @update:model-value="(v) => (content.maxWidth = v)" />
      <SegmentedField label="Columnas del cuerpo" :model-value="String(content.columns || 1)" :options="[{ value: '1', label: '1 columna' }, { value: '2', label: '2 columnas' }]" @update:model-value="(v) => (content.columns = Number(v))" />
    </InspectorSection>

    <InspectorSection title="Comportamiento">
      <TextField label="Botón" :model-value="content.cta || ''" placeholder="Texto (vacío = sin botón)" @update:model-value="(v) => (content.cta = v)" />
      <TextField label="Enlace del botón" :model-value="content.ctaTo || ''" @update:model-value="(v) => (content.ctaTo = v)" />
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import SegmentedField from '../inspector/fields/SegmentedField.vue'
import SelectField from '../inspector/fields/SelectField.vue'

defineProps<{ content: Record<string, any> }>()
</script>
