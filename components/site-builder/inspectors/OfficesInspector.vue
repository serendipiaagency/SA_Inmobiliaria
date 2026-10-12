<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Descripción" multiline :model-value="content.text || ''" @update:model-value="(v) => (content.text = v)" />
    </InspectorSection>

    <InspectorSection title="Datos">
      <SegmentedField label="Fuente" :model-value="content.source || 'dynamic'" :options="[{ value: 'dynamic', label: 'Todas' }, { value: 'manual', label: 'Selección manual' }]" @update:model-value="(v) => (content.source = v)" />
      <template v-if="(content.source || 'dynamic') === 'dynamic'">
        <StepperField label="Número de oficinas" hint="Siempre en vivo: las oficinas activas con «Mostrar en la web» (CRM → Oficinas), la principal primero y después por su orden." :model-value="content.limit || 6" :min="1" :max="12" @update:model-value="(v) => (content.limit = v)" />
      </template>
      <template v-else>
        <p class="mb-2 text-[11px] text-stone-400">Elige oficinas concretas. Se resuelven en vivo: si cambias su foto, su horario o su teléfono, el bloque se actualiza solo.</p>
        <div class="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
          <label v-for="o in offices" :key="o.id" class="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-stone-50">
            <input type="checkbox" :checked="manualIds.includes(o.id)" @change="toggleManual(o.id, ($event.target as HTMLInputElement).checked)" >
            <span class="truncate">{{ o.name }}</span>
            <span class="ml-auto shrink-0 truncate text-stone-400">{{ o.city }}</span>
          </label>
          <p v-if="!offices.length" class="px-1.5 py-2 text-stone-400">Ninguna oficina está publicada en la web. Actívalo en CRM → Oficinas → «Mostrar en la web».</p>
        </div>
        <p class="mt-1.5 text-[11px] text-stone-400">{{ manualIds.length }} seleccionada(s)</p>
      </template>
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <LayoutPickerField label="Diseño" type="offices" :model-value="content.layout || 'auto'" :options="[{ value: 'auto', label: 'Automático' }, { value: 'editorial', label: 'Editorial' }, { value: 'grid', label: 'Cuadrícula' }]" @update:model-value="(v) => (content.layout = v)" />
      <p class="mb-3 text-[11px] text-stone-400">Automático: composición editorial (foto, ficha y mapa) con una oficina; cuadrícula con varias. Editorial destaca la principal y lista el resto.</p>
      <p class="label mb-1">Campos visibles</p>
      <ToggleField label="Presentación" :model-value="cardField('description', true)" @update:model-value="(v) => setCardField('description', v)" />
      <ToggleField label="Horario" :model-value="cardField('hours', true)" @update:model-value="(v) => setCardField('hours', v)" />
      <ToggleField label="Teléfono" :model-value="cardField('phone', true)" @update:model-value="(v) => setCardField('phone', v)" />
      <ToggleField label="Email" :model-value="cardField('email', false)" @update:model-value="(v) => setCardField('email', v)" />
      <ToggleField label="Mapa (editorial)" :model-value="cardField('map', true)" @update:model-value="(v) => setCardField('map', v)" />
      <ToggleField label="Enlace «Cómo llegar»" :model-value="cardField('directions', true)" @update:model-value="(v) => setCardField('directions', v)" />
      <p class="mt-1 text-[11px] text-stone-400">Lo que una oficina no tiene (horario, coordenadas, foto) no se enseña: rellénalo en su ficha.</p>
    </InspectorSection>

    <InspectorSection title="Comportamiento">
      <TextField label="Botón" :model-value="content.cta || ''" placeholder="Texto (vacío = sin botón)" @update:model-value="(v) => (content.cta = v)" />
      <TextField label="Enlace del botón" :model-value="content.ctaTo || ''" placeholder="/oficinas" @update:model-value="(v) => (content.ctaTo = v)" />
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import SegmentedField from '../inspector/fields/SegmentedField.vue'
import ToggleField from '../inspector/fields/ToggleField.vue'
import StepperField from '../inspector/fields/StepperField.vue'
import LayoutPickerField from '../inspector/fields/LayoutPickerField.vue'

const props = withDefaults(defineProps<{ content: Record<string, any>; offices?: any[] }>(), { offices: () => [] })

const manualIds = computed<number[]>(() => (Array.isArray(props.content.manualIds) ? props.content.manualIds : []))
function toggleManual(id: number, checked: boolean) {
  const set = new Set(manualIds.value)
  if (checked) set.add(id)
  else set.delete(id)
  props.content.manualIds = Array.from(set)
}
function cardField(key: string, fallback: boolean): boolean {
  const v = props.content.cardFields?.[key]
  return v === undefined ? fallback : v !== false
}
function setCardField(key: string, value: boolean) {
  props.content.cardFields = { ...(props.content.cardFields || {}), [key]: value }
}
</script>
