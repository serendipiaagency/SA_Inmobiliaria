<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Descripción" multiline :model-value="content.description || ''" @update:model-value="(v) => (content.description = v)" />
      <div class="mt-4 border-t border-line pt-4">
        <p class="mb-2 text-[11px] font-semibold text-stone-500">CTA principal</p>
        <TextField label="Texto" :model-value="content.ctaPrimary || ''" @update:model-value="(v) => (content.ctaPrimary = v)" />
        <TextField label="Enlace" :model-value="content.ctaPrimaryTo || ''" @update:model-value="(v) => (content.ctaPrimaryTo = v)" />
      </div>
      <div class="mt-4 border-t border-line pt-4">
        <p class="mb-2 text-[11px] font-semibold text-stone-500">CTA secundario</p>
        <TextField label="Texto" :model-value="content.ctaSecondary || ''" @update:model-value="(v) => (content.ctaSecondary = v)" />
        <TextField label="Enlace" :model-value="content.ctaSecondaryTo || ''" @update:model-value="(v) => (content.ctaSecondaryTo = v)" />
      </div>
    </InspectorSection>

    <InspectorSection title="Multimedia">
      <ImageField label="Imagen de fondo" folder="site-builder" aspect="wide" :model-value="content.image || ''" @update:model-value="(v) => (content.image = v)" />
    </InspectorSection>

    <InspectorSection title="Diseño">
      <SegmentedField label="Alineación" :model-value="content.align || 'center'" :options="[{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centrado' }]" @update:model-value="(v) => (content.align = v)" />
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import ImageField from '../inspector/fields/ImageField.vue'
import SegmentedField from '../inspector/fields/SegmentedField.vue'

defineProps<{ content: Record<string, any> }>()
</script>
