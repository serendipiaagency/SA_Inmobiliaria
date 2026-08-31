<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Texto" multiline :model-value="content.text || ''" @update:model-value="(v) => (content.text = v)" />
    </InspectorSection>
    <InspectorSection title="Comportamiento">
      <TextField label="Botón" :model-value="content.cta || ''" placeholder="Texto (vacío = sin botón)" @update:model-value="(v) => (content.cta = v)" />
      <TextField label="Enlace del botón" :model-value="content.ctaTo || ''" placeholder="/propiedades" @update:model-value="(v) => (content.ctaTo = v)" />
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <p class="text-sm text-stone-400">Este bloque no tiene opciones de diseño propias.</p>
    </InspectorSection>

    <InspectorSection title="Datos">
      <span class="label">Marcadores del mapa ilustrativo</span>
      <p class="mb-2 text-[11px] text-stone-400">Posición en % desde la esquina superior izquierda.</p>
      <div v-for="(pin, i) in pins" :key="i" class="mb-1.5 grid grid-cols-[1fr_3.5rem_3.5rem_auto] items-center gap-1.5">
        <input v-model="pin.label" class="input" placeholder="Nombre" >
        <input v-model.number="pin.x" type="number" min="0" max="100" class="input" placeholder="X%" >
        <input v-model.number="pin.y" type="number" min="0" max="100" class="input" placeholder="Y%" >
        <button type="button" class="shrink-0 text-stone-300 hover:text-red-500" @click="removePin(i)">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <button type="button" class="mt-1 text-[12px] font-semibold text-ink underline" @click="addPin">+ Añadir marcador</button>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'

const props = defineProps<{ content: Record<string, any> }>()

interface Pin {
  label: string
  x: number
  y: number
}
const pins = computed<Pin[]>(() => (Array.isArray(props.content.pins) ? props.content.pins : []))

function addPin() {
  if (!Array.isArray(props.content.pins)) props.content.pins = []
  props.content.pins.push({ label: '', x: 50, y: 50 })
}
function removePin(i: number) {
  props.content.pins.splice(i, 1)
}
</script>
