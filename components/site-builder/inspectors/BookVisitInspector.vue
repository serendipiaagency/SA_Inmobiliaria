<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Descripción" :model-value="content.description || ''" @update:model-value="(v) => (content.description = v)" />
      <TextField label="Texto del botón" :model-value="content.ctaLabel || ''" placeholder="Reservar una visita" @update:model-value="(v) => (content.ctaLabel = v)" />
    </InspectorSection>

    <InspectorSection title="Con quién">
      <SelectField
        label="Comercial"
        hint="Se ofrecen sus huecos reales, según el horario de su ficha."
        :model-value="String(content.agentId || '')"
        :options="agentOptions"
        @update:model-value="(v) => (content.agentId = v ? Number(v) : null)"
      />
      <p v-if="brokenReference" class="mt-1 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
        El comercial que tenías elegido ya no está publicado. La web usa mientras tanto el primero disponible.
      </p>
      <p v-else-if="!team.length" class="mt-1 text-[11px] text-stone-400">
        No hay comerciales publicados. Actívalo en Comerciales → ficha → «Perfil y presentación».
      </p>
      <p v-else-if="!content.agentId" class="mt-1 text-[11px] text-stone-400">
        Sin elegir, se usa el primero de tu lista de comerciales publicados.
      </p>

      <SelectField
        label="Tipo de cita"
        :model-value="content.channel || 'in_person'"
        :options="[
          { value: 'in_person', label: 'Presencial' },
          { value: 'video', label: 'Videollamada' },
          { value: 'phone', label: 'Llamada' },
        ]"
        @update:model-value="(v) => (content.channel = v)"
      />
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <LayoutPickerField
        label="Diseño"
        type="book-visit"
        :model-value="content.layout || 'split'"
        :options="[{ value: 'split', label: 'Texto y botón' }, { value: 'centered', label: 'Centrado' }]"
        @update:model-value="(v) => (content.layout = v)"
      />
    </InspectorSection>

    <InspectorSection title="Comportamiento">
      <p class="text-[12px] text-stone-500">
        El botón abre la misma agenda que la ficha pública del comercial: ofrece solo los huecos libres de su
        horario, respeta sus días bloqueados y su tope diario, y la reserva aparece en CRM → Visitas.
      </p>
      <p class="mt-2 text-[11px] text-stone-400">
        Mientras editas o usas Vista previa el botón está desactivado, para no crear citas de prueba en la agenda real.
      </p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import SelectField from '../inspector/fields/SelectField.vue'
import LayoutPickerField from '../inspector/fields/LayoutPickerField.vue'

const props = defineProps<{ content: Record<string, any>; team: any[] }>()

const agentOptions = computed(() => [
  { value: '', label: 'El primero de la lista' },
  ...(props.team || []).map((m) => ({ value: String(m.id), label: `${m.name}${m.position ? ` — ${m.position}` : ''}` })),
])

// Misma comprobación que hace el bloque: elegido pero ya no publicado.
const brokenReference = computed(() => {
  const id = Number(props.content.agentId)
  return !!id && !(props.team || []).some((m) => m.id === id)
})
</script>
