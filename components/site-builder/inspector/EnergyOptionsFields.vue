<template>
  <div>
    <!-- Contenido: qué enseña la tabla. Los valores no se escriben aquí: salen de la propiedad. -->
    <InspectorSection :title="contentTitle">
      <TextField label="Título visible" :model-value="opts.title" placeholder="Eficiencia energética" data-testid="energy-opt-title" @update:model-value="(v) => set('title', v)" />
      <ToggleField label="Clasificación (A–G)" :model-value="opts.showRating" data-testid="energy-opt-rating" @update:model-value="(v) => set('showRating', v)" />
      <ToggleField label="Consumo de energía" :model-value="opts.showConsumption" data-testid="energy-opt-consumption" @update:model-value="(v) => set('showConsumption', v)" />
      <ToggleField label="Emisiones" :model-value="opts.showEmissions" data-testid="energy-opt-emissions" @update:model-value="(v) => set('showEmissions', v)" />
      <ToggleField label="Vigencia del certificado, si consta" :model-value="opts.showCertificate" data-testid="energy-opt-certificate" @update:model-value="(v) => set('showCertificate', v)" />
      <TextField label="Texto informativo (opcional)" :model-value="opts.note" multiline :rows="2" placeholder="Por ejemplo: «Certificado emitido por un técnico acreditado.»" data-testid="energy-opt-note" @update:model-value="(v) => set('note', v)" />
      <p class="mt-1 text-[11px] leading-relaxed text-stone-400">
        La clasificación, el consumo, las emisiones y la caducidad del certificado son los de cada propiedad: se editan en
        <NuxtLink to="/admin/developer-properties" target="_blank" class="underline">Propiedades (web)</NuxtLink>, en «Ficha ampliada». Sin ningún dato, la tabla no sale.
      </p>
    </InspectorSection>
    <!-- Diseño: cómo se ve. Los colores A–G no cambian con el tema: son los de la etiqueta oficial. -->
    <InspectorSection :title="designTitle" :tab="designTab ? 'design' : 'content'">
      <SegmentedField
        label="Presentación"
        :model-value="opts.layout"
        :options="[{ value: 'full', label: 'Tabla completa' }, { value: 'compact', label: 'Compacta' }]"
        data-testid="energy-opt-layout"
        @update:model-value="(v) => set('layout', v)"
      />
      <SegmentedField
        label="Fondo"
        :model-value="opts.background"
        :options="[{ value: 'white', label: 'Blanco' }, { value: 'paper', label: 'Papel' }, { value: 'tint', label: 'Verde suave' }]"
        data-testid="energy-opt-background"
        @update:model-value="(v) => set('background', v)"
      />
      <ToggleField label="Borde" :model-value="opts.border" data-testid="energy-opt-border" @update:model-value="(v) => set('border', v)" />
      <SegmentedField label="Esquinas" :model-value="opts.radius" :options="[{ value: 'none', label: 'Rectas' }, { value: 'md', label: 'Suaves' }, { value: 'lg', label: 'Redondas' }]" @update:model-value="(v) => set('radius', v)" />
      <SegmentedField label="Espaciado interior" :model-value="opts.padding" :options="[{ value: 'sm', label: 'S' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'L' }]" @update:model-value="(v) => set('padding', v)" />
      <SegmentedField label="Tamaño del título" :model-value="opts.titleSize" :options="[{ value: 'sm', label: 'S' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'L' }]" @update:model-value="(v) => set('titleSize', v)" />
      <SegmentedField label="Anchura" :model-value="opts.width" :options="[{ value: 'full', label: 'Toda la columna' }, { value: 'narrow', label: 'Estrecha' }]" data-testid="energy-opt-width" @update:model-value="(v) => set('width', v)" />
      <p class="mt-1 text-[11px] leading-relaxed text-stone-400">En el móvil la tabla se adapta sola al ancho de la pantalla. Los colores de la A a la G son siempre los de la etiqueta energética.</p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from './InspectorSection.vue'
import ToggleField from './fields/ToggleField.vue'
import TextField from './fields/TextField.vue'
import SegmentedField from './fields/SegmentedField.vue'
import { normalizeEnergyOptions, type EnergyDisplayOptions } from '~/utils/energyCertificate'

/**
 * Las opciones de la tabla «Eficiencia energética» (utils/energyCertificate.ts):
 * las mismas en la sección de la zona dinámica de la ficha y en el bloque de
 * la biblioteca. Sólo presentación; quien lo usa decide dónde se guardan.
 */
/**
 * `designTab`: el diseño va en la pestaña «Diseño» del inspector (bloque de
 * la biblioteca). La zona dinámica no tiene pestañas: ahí va todo seguido.
 */
const props = withDefaults(defineProps<{ value: unknown; contentTitle?: string; designTitle?: string; designTab?: boolean }>(), {
  contentTitle: 'Eficiencia energética',
  designTitle: 'Eficiencia energética — diseño',
  designTab: true,
})
const emit = defineEmits<{ set: [key: keyof EnergyDisplayOptions, value: unknown] }>()
const opts = computed(() => normalizeEnergyOptions(props.value))
function set(key: keyof EnergyDisplayOptions, value: unknown) {
  emit('set', key, value)
}
</script>
