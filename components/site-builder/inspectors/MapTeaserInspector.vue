<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Texto" multiline :model-value="content.text || ''" @update:model-value="(v) => (content.text = v)" />
    </InspectorSection>

    <InspectorSection title="Datos">
      <SegmentedField
        label="Fuente"
        :model-value="content.source || 'dynamic'"
        :options="[{ value: 'dynamic', label: 'Dinámica' }, { value: 'manual', label: 'Selección manual' }]"
        @update:model-value="(v) => (content.source = v)"
      />

      <template v-if="(content.source || 'dynamic') === 'dynamic'">
        <SelectField label="Qué propiedades mostrar" hint="Siempre en vivo: se refleja al instante lo que edites en Propiedades (web)." :model-value="content.dynamicFilter || 'latest'" :options="DYNAMIC_FILTERS" @update:model-value="(v) => (content.dynamicFilter = v)" />
        <SelectField v-if="content.dynamicFilter === 'community'" label="Comunidad" :model-value="content.dynamicCommunity || ''" :options="communityOptions" @update:model-value="(v) => (content.dynamicCommunity = v)" />
        <SelectField v-if="content.dynamicFilter === 'type'" label="Tipo de propiedad" :model-value="content.dynamicType || ''" :options="typeOptions" @update:model-value="(v) => (content.dynamicType = v)" />
        <StepperField label="Número de propiedades" :model-value="content.limit || 6" :min="1" :max="20" @update:model-value="(v) => (content.limit = v)" />
      </template>

      <template v-else>
        <p class="mb-2 text-[11px] text-stone-400">Elige propiedades concretas de tu catálogo. Se resuelven en vivo — si editas una, el mapa se actualiza solo.</p>
        <div class="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
          <label v-for="p in projects" :key="p.id" class="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-stone-50">
            <input type="checkbox" :checked="manualIds.includes(p.id)" @change="toggleManual(p.id, ($event.target as HTMLInputElement).checked)" >
            <span class="truncate">{{ p.name }}</span>
            <span class="ml-auto shrink-0 text-stone-400">{{ hasCoords(p) ? formatPrice(p.price) : 'Sin ubicación' }}</span>
          </label>
          <p v-if="!projects.length" class="px-1.5 py-2 text-stone-400">No hay propiedades todavía en Propiedades (web).</p>
        </div>
        <p class="mt-1.5 text-[11px] text-stone-400">{{ manualIds.length }} seleccionada(s)</p>
      </template>

      <p v-if="withoutCoords > 0" class="mt-2 text-[11px] text-amber-600">
        {{ withoutCoords }} de las propiedades disponibles no tienen ubicación configurada y nunca aparecerán en este mapa.
      </p>
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <p class="text-sm text-stone-400">Este bloque no tiene opciones de diseño propias.</p>
    </InspectorSection>

    <InspectorSection title="Comportamiento">
      <TextField label="Botón" :model-value="content.cta || ''" placeholder="Texto (vacío = sin botón)" @update:model-value="(v) => (content.cta = v)" />
      <TextField label="Enlace del botón" :model-value="content.ctaTo || ''" placeholder="/propiedades" @update:model-value="(v) => (content.ctaTo = v)" />
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import SelectField from '../inspector/fields/SelectField.vue'
import SegmentedField from '../inspector/fields/SegmentedField.vue'
import StepperField from '../inspector/fields/StepperField.vue'
import { hasValidCoords } from '~/utils/maps/coords'

const props = defineProps<{ content: Record<string, any>; projects: any[] }>()
const { format: formatPrice } = useCurrency()

const DYNAMIC_FILTERS = [
  { value: 'latest', label: 'Más recientes' },
  { value: 'featured', label: 'Destacadas (exclusivas)' },
  { value: 'premium', label: 'Precio más alto' },
  { value: 'affordable', label: 'Precio más bajo' },
  { value: 'recommended', label: 'Mejor rentabilidad' },
  { value: 'community', label: 'Comunidad concreta' },
  { value: 'type', label: 'Tipo de propiedad' },
]

const communityOptions = computed(() => {
  const set = new Set((props.projects || []).map((p) => p.community).filter(Boolean))
  return Array.from(set).map((c) => ({ value: c as string, label: c as string }))
})
const typeOptions = computed(() => {
  const set = new Set((props.projects || []).map((p) => p.propertyType).filter(Boolean))
  return Array.from(set).map((t) => ({ value: t as string, label: t as string }))
})

const manualIds = computed<number[]>(() => (Array.isArray(props.content.manualIds) ? props.content.manualIds : []))
function toggleManual(id: number, checked: boolean) {
  const set = new Set(manualIds.value)
  if (checked) set.add(id)
  else set.delete(id)
  props.content.manualIds = Array.from(set)
}

function hasCoords(p: any) {
  return hasValidCoords(p)
}
/** Cuántas de las propiedades del catálogo no pueden aparecer nunca en este mapa por no tener ubicación — para que quien edita no se pregunte por qué faltan. */
const withoutCoords = computed(() => (props.projects || []).filter((p) => !hasValidCoords(p)).length)
</script>
