<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Introducción" multiline :model-value="content.text || ''" @update:model-value="(v) => (content.text = v)" />
      <ImageField label="Fotografía (opcional)" aspect="square" show-alt :model-value="content.image || ''" :alt="content.imageAlt || ''" @update:model-value="(v) => (content.image = v)" @update:alt="(v) => (content.imageAlt = v)" />
    </InspectorSection>

    <InspectorSection title="Servicios">
      <p class="mb-2 text-[11px] text-stone-400">Hasta seis servicios. Deja el título en blanco para no mostrar uno: sólo salen los que ofreces, sin huecos vacíos.</p>
      <div v-for="i in 6" :key="i" class="mb-3 rounded-lg border border-line p-2">
        <p class="mb-1 text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">Servicio {{ i }}</p>
        <IconPickerField label="Icono" :model-value="content[`service${i}Icon`] || ''" @update:model-value="(v) => (content[`service${i}Icon`] = v)" />
        <TextField label="Título" :model-value="content[`service${i}Title`] || ''" @update:model-value="(v) => (content[`service${i}Title`] = v)" />
        <TextField label="Explicación" multiline :rows="2" :model-value="content[`service${i}Text`] || ''" @update:model-value="(v) => (content[`service${i}Text`] = v)" />
      </div>
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <p class="text-sm text-stone-400">Los servicios van a la derecha en dos columnas; a la izquierda, el titular y una fotografía con recorte orgánico. Los iconos toman el color de tu Brand Kit.</p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import ImageField from '../inspector/fields/ImageField.vue'
import IconPickerField from '../inspector/fields/IconPickerField.vue'

defineProps<{ content: Record<string, any> }>()
</script>
