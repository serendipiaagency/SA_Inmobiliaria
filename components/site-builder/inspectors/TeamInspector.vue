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
        :options="[{ value: 'dynamic', label: 'Todos' }, { value: 'manual', label: 'Selección manual' }]"
        @update:model-value="(v) => (content.source = v)"
      />

      <template v-if="(content.source || 'dynamic') === 'dynamic'">
        <StepperField
          label="Número de comerciales"
          hint="Siempre en vivo: se muestran los que tengan activado «Mostrar este comercial en la web», en el orden que fijes en su ficha."
          :model-value="content.limit || 4"
          :min="1"
          :max="12"
          @update:model-value="(v) => (content.limit = v)"
        />
      </template>

      <template v-else>
        <p class="mb-2 text-[11px] text-stone-400">Elige comerciales concretos. Se resuelven en vivo: si cambias su foto o su puesto, el bloque se actualiza solo.</p>
        <div class="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
          <label v-for="m in team" :key="m.id" class="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-stone-50">
            <input type="checkbox" :checked="manualIds.includes(m.id)" @change="toggleManual(m.id, ($event.target as HTMLInputElement).checked)" >
            <span class="truncate">{{ m.name }}</span>
            <span class="ml-auto shrink-0 truncate text-stone-400">{{ m.position }}</span>
          </label>
          <p v-if="!team.length" class="px-1.5 py-2 text-stone-400">
            Ningún comercial está publicado en la web. Actívalo en Comerciales → ficha → «Perfil y presentación».
          </p>
        </div>
        <p class="mt-1.5 text-[11px] text-stone-400">{{ manualIds.length }} seleccionado(s)</p>
      </template>
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <LayoutPickerField
        label="Diseño"
        type="team"
        :model-value="content.layout || 'cards'"
        :options="[{ value: 'cards', label: 'Tarjetas' }, { value: 'compact', label: 'Compacto' }]"
        @update:model-value="(v) => (content.layout = v)"
      />

      <p class="label mb-1">Campos visibles en la tarjeta</p>
      <ToggleField label="Puesto" :model-value="cardField('position', true)" @update:model-value="(v) => setCardField('position', v)" />
      <ToggleField label="Especialidades" :model-value="cardField('specialties', false)" @update:model-value="(v) => setCardField('specialties', v)" />
      <ToggleField
        label="Teléfono y email"
        :model-value="cardField('contact', false)"
        @update:model-value="(v) => setCardField('contact', v)"
      />
      <p class="mt-1 text-[11px] text-stone-400">
        El teléfono y el email que se muestran son los de contacto profesional de su ficha, los mismos que ya aparecen en su página pública.
      </p>
    </InspectorSection>

    <InspectorSection title="Responsive" tab="design">
      <div class="grid grid-cols-3 gap-2">
        <SelectField label="Móvil" :model-value="String(content.columnsMobile || 1)" :options="numOpts(1, 2)" @update:model-value="(v) => (content.columnsMobile = Number(v))" />
        <SelectField label="Tablet" :model-value="String(content.columnsTablet || 2)" :options="numOpts(1, 3)" @update:model-value="(v) => (content.columnsTablet = Number(v))" />
        <SelectField label="Escritorio" :model-value="String(content.columnsDesktop || defaultDesktopCols)" :options="numOpts(2, 4)" @update:model-value="(v) => (content.columnsDesktop = Number(v))" />
      </div>
    </InspectorSection>

    <InspectorSection title="Comportamiento">
      <TextField label="Botón" :model-value="content.cta || ''" placeholder="Texto (vacío = sin botón)" @update:model-value="(v) => (content.cta = v)" />
      <TextField label="Enlace del botón" :model-value="content.ctaTo || ''" placeholder="/equipo" @update:model-value="(v) => (content.ctaTo = v)" />
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

const props = defineProps<{ content: Record<string, any>; team: any[] }>()

const manualIds = computed<number[]>(() => (Array.isArray(props.content.manualIds) ? props.content.manualIds : []))
function toggleManual(id: number, checked: boolean) {
  const set = new Set(manualIds.value)
  if (checked) set.add(id)
  else set.delete(id)
  props.content.manualIds = Array.from(set)
}

/**
 * Cada campo lleva su propio valor por defecto porque no coinciden: el
 * puesto se enseña salvo que se apague, y las especialidades y el contacto
 * sólo si se encienden. Es el mismo criterio que aplica TeamBlock, y tiene
 * que ser el mismo o el interruptor mentiría sobre lo que se ve en el lienzo.
 */
function cardField(key: string, fallback: boolean): boolean {
  const v = props.content.cardFields?.[key]
  return v === undefined ? fallback : v !== false
}
function setCardField(key: string, value: boolean) {
  props.content.cardFields = { ...(props.content.cardFields || {}), [key]: value }
}

const defaultDesktopCols = computed(() => (props.content.layout === 'compact' ? 3 : 4))

function numOpts(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, i) => ({ value: String(min + i), label: String(min + i) }))
}
</script>
