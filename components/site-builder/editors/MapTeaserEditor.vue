<template>
  <div>
    <EditorField label="Eyebrow"><input v-model="content.eyebrow" :class="inputCls" /></EditorField>
    <EditorField label="Título"><input v-model="content.title" :class="inputCls" /></EditorField>
    <EditorField label="Texto"><textarea v-model="content.text" :class="inputCls" rows="3" /></EditorField>
    <EditorField label="Botón"><input v-model="content.cta" :class="inputCls" placeholder="Texto (vacío = sin botón)" /></EditorField>
    <EditorField label="Enlace del botón"><input v-model="content.ctaTo" :class="inputCls" placeholder="/demo/properties" /></EditorField>

    <EditorField label="Marcadores del mapa ilustrativo" hint="Posición en % desde la esquina superior izquierda.">
      <div v-for="(pin, i) in pins" :key="i" class="mb-1.5 grid grid-cols-[1fr_4rem_4rem_auto] items-center gap-1.5">
        <input v-model="pin.label" :class="inputCls" placeholder="Nombre" />
        <input v-model.number="pin.x" type="number" min="0" max="100" :class="inputCls" placeholder="X%" />
        <input v-model.number="pin.y" type="number" min="0" max="100" :class="inputCls" placeholder="Y%" />
        <button type="button" class="shrink-0 text-stone-300 hover:text-red-500" @click="removePin(i)">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <button type="button" class="mt-1 text-[12px] font-semibold text-ink underline" @click="addPin">+ Añadir marcador</button>
    </EditorField>
  </div>
</template>

<script setup lang="ts">
import EditorField from './EditorField.vue'

const content = defineModel<Record<string, any>>('content', { required: true })
const inputCls = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none'

interface Pin {
  label: string
  x: number
  y: number
}
const pins = computed<Pin[]>(() => (Array.isArray(content.value.pins) ? content.value.pins : []))

function addPin() {
  if (!Array.isArray(content.value.pins)) content.value.pins = []
  content.value.pins.push({ label: '', x: 50, y: 50 })
}
function removePin(i: number) {
  content.value.pins.splice(i, 1)
}
</script>
