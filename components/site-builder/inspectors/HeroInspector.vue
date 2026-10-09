<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título (línea 1)" :model-value="content.title1 || ''" @update:model-value="(v) => (content.title1 = v)" />
      <TextField label="Título (línea 2, cursiva)" :model-value="content.title2 || ''" @update:model-value="(v) => (content.title2 = v)" />
      <TextField label="Subtítulo" multiline :model-value="content.subtitle || ''" @update:model-value="(v) => (content.subtitle = v)" />

    </InspectorSection>

    <InspectorSection title="Multimedia">
      <SegmentedField
        label="Fondo"
        :model-value="backgroundMode"
        :options="[{ value: 'slideshow', label: 'Bucle de imágenes' }, { value: 'static', label: 'Imagen fija' }]"
        data-testid="hero-background-mode"
        @update:model-value="(v) => (content.backgroundMode = v)"
      />
      <GalleryField
        v-if="backgroundMode === 'slideshow'"
        label="Imágenes de fondo"
        :hint="`Se alternan en bucle, una cada ${HERO_SLIDE_SECONDS} segundos. La primera es la portada inicial. Con una sola imagen, el fondo queda fijo.`"
        folder="site-builder"
        :model-value="slides"
        @update:model-value="(v) => (content.slides = v)"
      />
      <template v-else>
        <ImageField label="Imagen de fondo" folder="site-builder" aspect="wide" :model-value="content.backgroundImage || ''" @update:model-value="(v) => (content.backgroundImage = v)" />
        <p class="-mt-1 mb-3 text-[11px] text-stone-400" data-testid="hero-static-hint">
          {{ content.backgroundImage ? 'Se queda quieta, sin bucle ni zoom.' : 'Sin imagen elegida se usa la primera del bucle.' }} Las imágenes del bucle se conservan por si vuelves a él.
        </p>
      </template>
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
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
import ImageField from '../inspector/fields/ImageField.vue'
import { HERO_SLIDE_SECONDS, heroBackgroundMode } from '~/utils/siteBuilder/heroMedia'
import SliderField from '../inspector/fields/SliderField.vue'
import SelectField from '../inspector/fields/SelectField.vue'
import SegmentedField from '../inspector/fields/SegmentedField.vue'

const props = defineProps<{ content: Record<string, any> }>()
const slides = computed<string[]>(() => (Array.isArray(props.content.slides) ? props.content.slides : []))
const backgroundMode = computed(() => heroBackgroundMode(props.content.backgroundMode))

const FOCAL_POINTS = [
  { value: '50% 0%', label: 'Arriba' },
  { value: '50% 50%', label: 'Centro' },
  { value: '50% 100%', label: 'Abajo' },
  { value: '0% 50%', label: 'Izquierda' },
  { value: '100% 50%', label: 'Derecha' },
]
</script>
