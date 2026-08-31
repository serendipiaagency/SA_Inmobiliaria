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
        :options="[{ value: 'dynamic', label: 'Dinámica' }, { value: 'manual', label: 'Selección manual' }]"
        @update:model-value="(v) => (content.source = v)"
      />

      <template v-if="(content.source || 'dynamic') === 'dynamic'">
        <SelectField label="Qué propiedades mostrar" hint="Siempre en vivo: se refleja al instante lo que edites en Propiedades (web)." :model-value="content.dynamicFilter || 'latest'" :options="DYNAMIC_FILTERS" @update:model-value="(v) => (content.dynamicFilter = v)" />
        <SelectField v-if="content.dynamicFilter === 'community'" label="Comunidad" :model-value="content.dynamicCommunity || ''" :options="communityOptions" @update:model-value="(v) => (content.dynamicCommunity = v)" />
        <SelectField v-if="content.dynamicFilter === 'type'" label="Tipo de propiedad" :model-value="content.dynamicType || ''" :options="typeOptions" @update:model-value="(v) => (content.dynamicType = v)" />
        <StepperField label="Número de propiedades" :model-value="content.limit || 4" :min="1" :max="12" @update:model-value="(v) => (content.limit = v)" />
      </template>

      <template v-else>
        <p class="mb-2 text-[11px] text-stone-400">Elige propiedades concretas de tu catálogo. Se resuelven en vivo — si editas una, el bloque se actualiza solo.</p>
        <div class="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
          <label v-for="p in projects" :key="p.id" class="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-stone-50">
            <input type="checkbox" :checked="manualIds.includes(p.id)" @change="toggleManual(p.id, ($event.target as HTMLInputElement).checked)" >
            <span class="truncate">{{ p.name }}</span>
            <span class="ml-auto shrink-0 text-stone-400">{{ formatPrice(p.price) }}</span>
          </label>
          <p v-if="!projects.length" class="px-1.5 py-2 text-stone-400">No hay propiedades todavía en Propiedades (web).</p>
        </div>
        <p class="mt-1.5 text-[11px] text-stone-400">{{ manualIds.length }} seleccionada(s)</p>
      </template>
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <LayoutPickerField
        label="Diseño"
        type="properties"
        :model-value="content.layout || 'row'"
        :options="[{ value: 'row', label: 'Fila' }, { value: 'dark-grid', label: 'Oscuro' }, { value: 'ai-grid', label: 'IA' }]"
        @update:model-value="(v) => (content.layout = v)"
      />
      <TextField v-if="content.layout === 'ai-grid'" label="Insignia" :model-value="content.badge || ''" placeholder="IA" @update:model-value="(v) => (content.badge = v)" />

      <template v-if="content.layout === 'dark-grid'">
        <p class="label mb-1">Campos visibles en la tarjeta</p>
        <ToggleField label="Precio" :model-value="cardField('price')" @update:model-value="(v) => setCardField('price', v)" />
        <ToggleField label="Nombre" :model-value="cardField('name')" @update:model-value="(v) => setCardField('name', v)" />
        <ToggleField label="Comunidad" :model-value="cardField('community')" @update:model-value="(v) => setCardField('community', v)" />
      </template>
      <p v-else-if="content.layout === 'ai-grid'" class="text-[11px] text-stone-400">La tarjeta estándar de propiedades ya muestra precio, habitaciones, baños y superficie — se mantiene igual que en el resto del sitio.</p>
    </InspectorSection>

    <InspectorSection v-if="content.layout && content.layout !== 'row'" title="Responsive" tab="design">
      <div class="grid grid-cols-3 gap-2">
        <SelectField label="Móvil" :model-value="String(content.columnsMobile || 1)" :options="numOpts(1, 2)" @update:model-value="(v) => (content.columnsMobile = Number(v))" />
        <SelectField label="Tablet" :model-value="String(content.columnsTablet || 2)" :options="numOpts(1, 3)" @update:model-value="(v) => (content.columnsTablet = Number(v))" />
        <SelectField label="Escritorio" :model-value="String(content.columnsDesktop || (content.layout === 'ai-grid' ? 4 : 3))" :options="numOpts(2, 4)" @update:model-value="(v) => (content.columnsDesktop = Number(v))" />
      </div>
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
import ToggleField from '../inspector/fields/ToggleField.vue'
import StepperField from '../inspector/fields/StepperField.vue'
import LayoutPickerField from '../inspector/fields/LayoutPickerField.vue'

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

function cardField(key: string): boolean {
  return props.content.cardFields?.[key] !== false
}
function setCardField(key: string, value: boolean) {
  props.content.cardFields = { ...props.content.cardFields, [key]: value }
}

function numOpts(min: number, max: number) {
  const out = []
  for (let n = min; n <= max; n++) out.push({ value: String(n), label: String(n) })
  return out
}
</script>
