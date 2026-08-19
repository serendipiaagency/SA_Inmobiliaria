<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título (línea 1)" :model-value="content.title1 || ''" @update:model-value="(v) => (content.title1 = v)" />
      <TextField label="Título (línea 2, cursiva)" :model-value="content.title2 || ''" @update:model-value="(v) => (content.title2 = v)" />
      <TextField label="Subtítulo" multiline :model-value="content.subtitle || ''" @update:model-value="(v) => (content.subtitle = v)" />

      <div class="mt-4 border-t border-line pt-4">
        <p class="mb-2 text-[11px] font-semibold text-stone-500">CTA principal</p>
        <TextField label="Texto" :model-value="content.exploreCta || ''" @update:model-value="(v) => (content.exploreCta = v)" />
        <TextField label="Enlace" :model-value="content.exploreCtaTo || ''" placeholder="/demo/properties" @update:model-value="(v) => (content.exploreCtaTo = v)" />
      </div>
      <div class="mt-4 border-t border-line pt-4">
        <p class="mb-2 text-[11px] font-semibold text-stone-500">CTA secundario</p>
        <TextField label="Texto" :model-value="content.advisorCta || ''" @update:model-value="(v) => (content.advisorCta = v)" />
        <TextField label="Enlace" :model-value="content.advisorCtaTo || ''" placeholder="/demo/contact-us" @update:model-value="(v) => (content.advisorCtaTo = v)" />
      </div>
    </InspectorSection>

    <InspectorSection title="Multimedia">
      <GalleryField
        label="Imágenes de fondo"
        hint="Se rotan en bucle. La primera es la portada inicial."
        folder="site-builder"
        :model-value="slides"
        @update:model-value="(v) => (content.slides = v)"
      />
    </InspectorSection>

    <InspectorSection title="Diseño">
      <SliderField label="Opacidad del overlay" :model-value="content.overlayOpacity || 0" @update:model-value="(v) => (content.overlayOpacity = v)" />
      <SelectField label="Posición del fondo (focal point)" :model-value="content.backgroundPosition || '50% 50%'" :options="FOCAL_POINTS" @update:model-value="(v) => (content.backgroundPosition = v)" />
      <SegmentedField
        label="Alineación del contenido"
        :model-value="content.contentAlign || 'left'"
        :options="[{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centrado' }]"
        @update:model-value="(v) => (content.contentAlign = v)"
      />
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import GalleryField from '../inspector/fields/GalleryField.vue'
import SliderField from '../inspector/fields/SliderField.vue'
import SelectField from '../inspector/fields/SelectField.vue'
import SegmentedField from '../inspector/fields/SegmentedField.vue'

const props = defineProps<{ content: Record<string, any> }>()
const slides = computed<string[]>(() => (Array.isArray(props.content.slides) ? props.content.slides : []))

const FOCAL_POINTS = [
  { value: '50% 0%', label: 'Arriba' },
  { value: '50% 50%', label: 'Centro' },
  { value: '50% 100%', label: 'Abajo' },
  { value: '0% 50%', label: 'Izquierda' },
  { value: '100% 50%', label: 'Derecha' },
]
</script>
