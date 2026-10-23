<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Etiqueta" hint="Pequeño rótulo sobre el título (color de marca). Vacío = sin etiqueta." :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Texto" multiline hint="Separa los párrafos con una línea en blanco." :model-value="content.text || ''" @update:model-value="(v) => (content.text = v)" />
    </InspectorSection>

    <InspectorSection title="Fotografía">
      <ImageField v-if="content.layout !== 'textOnly'" label="Imagen" :model-value="content.image || ''" @update:model-value="(v) => (content.image = v)" />
      <TextField v-if="content.layout !== 'textOnly'" label="Texto alternativo" hint="Describe la foto (accesibilidad y SEO)." :model-value="content.imageAlt || ''" @update:model-value="(v) => (content.imageAlt = v)" />
      <TextField v-if="content.layout !== 'textOnly'" label="Pie de foto" hint="Texto en cursiva bajo la imagen. Vacío = sin pie." :model-value="content.caption || ''" @update:model-value="(v) => (content.caption = v)" />
      <p v-else class="text-[11px] text-stone-400">El diseño «Sólo texto» no muestra fotografía.</p>
    </InspectorSection>

    <InspectorSection title="Cita destacada">
      <TextField label="Cita" multiline hint="Opcional: una frase destacada, con un filete a la izquierda." :model-value="content.quote || ''" @update:model-value="(v) => (content.quote = v)" />
      <TextField v-if="content.quote" label="Autor de la cita" :model-value="content.quoteAuthor || ''" @update:model-value="(v) => (content.quoteAuthor = v)" />
    </InspectorSection>

    <InspectorSection title="Comportamiento">
      <TextField label="Botón" placeholder="Texto (vacío = sin botón)" :model-value="content.ctaLabel || ''" @update:model-value="(v) => (content.ctaLabel = v)" />
      <TextField v-if="content.ctaLabel" label="Enlace del botón" placeholder="/nosotros" :model-value="content.ctaTo || ''" @update:model-value="(v) => (content.ctaTo = v)" />
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <SegmentedField
        label="Composición"
        :model-value="content.layout || 'imageRight'"
        :options="[{ value: 'imageRight', label: 'Imagen der.' }, { value: 'imageLeft', label: 'Imagen izq.' }, { value: 'stacked', label: 'Apilado' }, { value: 'textOnly', label: 'Sólo texto' }]"
        @update:model-value="(v) => (content.layout = v)"
      />
      <SelectField
        v-if="content.layout !== 'textOnly'"
        label="Proporción de la imagen"
        class="mt-3"
        :model-value="content.imageRatio || (content.layout === 'stacked' ? 'wide' : 'portrait')"
        :options="[{ value: 'portrait', label: 'Vertical (4:5)' }, { value: 'landscape', label: 'Horizontal (16:10)' }, { value: 'wide', label: 'Panorámica (3:2)' }, { value: 'square', label: 'Cuadrada (1:1)' }]"
        @update:model-value="(v) => (content.imageRatio = v)"
      />
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import SelectField from '../inspector/fields/SelectField.vue'
import SegmentedField from '../inspector/fields/SegmentedField.vue'
import ImageField from '../inspector/fields/ImageField.vue'

defineProps<{ content: Record<string, any> }>()
</script>
