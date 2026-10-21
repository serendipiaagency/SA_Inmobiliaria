<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Introducción" multiline :model-value="content.text || ''" @update:model-value="(v) => (content.text = v)" />
      <ImageField label="Fotografía (opcional)" aspect="video" show-alt :model-value="content.image || ''" :alt="content.imageAlt || ''" @update:model-value="(v) => (content.image = v)" @update:alt="(v) => (content.imageAlt = v)" />
    </InspectorSection>

    <InspectorSection title="Ventajas">
      <SegmentedField label="Cuántas" :model-value="String(count)" :options="[{ value: '3', label: 'Tres' }, { value: '4', label: 'Cuatro' }]" @update:model-value="(v) => (content.count = Number(v))" />
      <p class="mb-2 text-[11px] text-stone-400">Escribe las ventajas propias de tu agencia: lo que de verdad te distingue. Nada de estadísticas que no puedas acreditar.</p>
      <div v-for="i in count" :key="i" class="mb-3 rounded-lg border border-line p-2">
        <p class="mb-1 text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">Ventaja {{ i }}</p>
        <IconPickerField label="Icono" :model-value="content[`point${i}Icon`] || ''" @update:model-value="(v) => (content[`point${i}Icon`] = v)" />
        <TextField label="Título" :model-value="content[`point${i}Title`] || ''" @update:model-value="(v) => (content[`point${i}Title`] = v)" />
        <TextField label="Explicación" multiline :rows="2" :model-value="content[`point${i}Text`] || ''" @update:model-value="(v) => (content[`point${i}Text`] = v)" />
      </div>
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <p class="text-sm text-stone-400">Las ventajas van a la derecha en una rejilla 2×2 con su icono y su número; a la izquierda, el titular y, si la subes, una fotografía con recorte orgánico. Los iconos toman el color de tu Brand Kit.</p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import ImageField from '../inspector/fields/ImageField.vue'
import SegmentedField from '../inspector/fields/SegmentedField.vue'
import IconPickerField from '../inspector/fields/IconPickerField.vue'

const props = defineProps<{ content: Record<string, any> }>()
const count = computed(() => (Number(props.content.count) === 3 ? 3 : 4))
</script>
