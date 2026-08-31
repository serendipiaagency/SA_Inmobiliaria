<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
    </InspectorSection>

    <InspectorSection title="Datos">
      <SegmentedField
        label="Fuente"
        :model-value="content.source || 'dynamic'"
        :options="[{ value: 'dynamic', label: 'Todas' }, { value: 'manual', label: 'Selección manual' }]"
        @update:model-value="(v) => (content.source = v)"
      />
      <template v-if="(content.source || 'dynamic') === 'dynamic'">
        <StepperField label="Número de comunidades" hint="Siempre en vivo." :model-value="content.limit || 6" :min="1" :max="12" @update:model-value="(v) => (content.limit = v)" />
      </template>
      <template v-else>
        <div class="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
          <label v-for="c in communities" :key="c.id" class="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-stone-50">
            <input type="checkbox" :checked="manualIds.includes(c.id)" @change="toggleManual(c.id, ($event.target as HTMLInputElement).checked)" >
            <span class="truncate">{{ c.name }}</span>
          </label>
          <p v-if="!communities.length" class="px-1.5 py-2 text-stone-400">No hay comunidades todavía.</p>
        </div>
        <p class="mt-1.5 text-[11px] text-stone-400">{{ manualIds.length }} seleccionada(s)</p>
      </template>
    </InspectorSection>

    <InspectorSection title="Comportamiento">
      <TextField label="Botón" :model-value="content.cta || ''" placeholder="Texto (vacío = sin botón)" @update:model-value="(v) => (content.cta = v)" />
      <TextField label="Enlace del botón" :model-value="content.ctaTo || ''" placeholder="/zonas" @update:model-value="(v) => (content.ctaTo = v)" />
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <p class="text-sm text-stone-400">Este bloque no tiene opciones de diseño propias.</p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import SegmentedField from '../inspector/fields/SegmentedField.vue'
import StepperField from '../inspector/fields/StepperField.vue'

const props = defineProps<{ content: Record<string, any>; communities: any[] }>()

const manualIds = computed<number[]>(() => (Array.isArray(props.content.manualIds) ? props.content.manualIds : []))
function toggleManual(id: number, checked: boolean) {
  const set = new Set(manualIds.value)
  if (checked) set.add(id)
  else set.delete(id)
  props.content.manualIds = Array.from(set)
}
</script>
