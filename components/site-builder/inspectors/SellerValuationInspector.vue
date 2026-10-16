<template>
  <div data-testid="seller-valuation-inspector">
    <InspectorSection title="Contenido">
      <TextField label="Etiqueta" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título" :model-value="content.title || ''" @update:model-value="(v) => (content.title = v)" />
      <TextField label="Descripción" :model-value="content.description || ''" placeholder="Una línea que explique qué pasa al enviar" @update:model-value="(v) => (content.description = v)" />
      <TextField label="Texto del botón de envío" :model-value="content.submitLabel || ''" placeholder="Enviar mi propiedad" @update:model-value="(v) => (content.submitLabel = v)" />
    </InspectorSection>

    <InspectorSection title="Preguntas">
      <p class="mb-2 text-[11px] text-stone-500">
        Los tipos y subtipos son los del catálogo de tus propiedades; no se puede añadir ninguno que no exista allí. Cada tipo pregunta por los campos reales de su ficha.
      </p>
      <p class="label">Tipos que se ofrecen</p>
      <div v-for="g in groups" :key="g.key" class="mb-2">
        <p class="text-[10px] font-semibold uppercase tracking-widest text-stone-400">{{ g.label }}</p>
        <ToggleField v-for="t in g.types" :key="t" :label="typeLabel(t)" :model-value="!hiddenTypes.includes(t)" :data-testid="`seller-type-${t}`" @update:model-value="(v) => toggleType(t, v)" />
      </div>
      <p class="label mt-3">Preguntas opcionales</p>
      <div v-for="q in optionalQuestions" :key="q.key" class="mb-2 rounded-lg border border-line p-2">
        <ToggleField :label="q.label" :model-value="!hiddenQuestions.includes(q.key)" :data-testid="`seller-question-${q.key}`" @update:model-value="(v) => toggleQuestion(q.key, v)" />
        <TextField v-if="!hiddenQuestions.includes(q.key)" label="Rótulo" :model-value="labels[q.key] || ''" :placeholder="q.label" @update:model-value="(v) => setLabel(q.key, v)" />
      </div>
      <p class="mt-1 text-[11px] text-stone-400">
        La superficie, el nombre, el email y la aceptación de la política de privacidad son obligatorios y no se pueden quitar: sin ellos no hay lead ni consentimiento.
      </p>
      <ToggleField label="Permitir adjuntar fotos" :model-value="content.allowPhotos !== false" @update:model-value="(v) => (content.allowPhotos = v)" />
    </InspectorSection>

    <InspectorSection title="Tras enviar">
      <TextField label="Mensaje de confirmación" :model-value="content.successMessage || ''" placeholder="Hemos recibido los datos de tu propiedad" @update:model-value="(v) => (content.successMessage = v)" />
      <TextField label="Texto bajo la confirmación" :model-value="content.successDetail || ''" @update:model-value="(v) => (content.successDetail = v)" />
      <TextField label="Referencia interna" hint="Viaja con cada envío y aparece en el lead. No la ve el visitante." :model-value="content.subject || ''" placeholder="Vender propiedad" @update:model-value="(v) => (content.subject = v)" />
      <TextField label="Aviso legal bajo el botón" :model-value="content.privacyNote || ''" @update:model-value="(v) => (content.privacyNote = v)" />
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <p class="text-[12px] text-stone-500">Pulsa el título, la descripción, el formulario o el botón en el lienzo para cambiar su tipografía, color, fondo, bordes y espaciado.</p>
    </InspectorSection>

    <InspectorSection title="Comportamiento">
      <p class="text-[12px] text-stone-500">
        Cada envío crea un <strong>lead real de captación</strong> («Vender propiedad») con lo que la persona ha contado, su contacto queda con el rol «Vendedor» y el hilo entra en Bandeja → Mensajes. No se crea ninguna propiedad ni se enseña ninguna valoración: la confirmación no lleva cifras.
      </p>
      <p class="mt-2 text-[11px] text-stone-400">Mientras editas el formulario no envía nada; en Vista previa puedes recorrer los pasos, pero tampoco envía.</p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import ToggleField from '../inspector/fields/ToggleField.vue'
import { PROPERTY_TYPE_LABELS } from '~/utils/propertySheet'
import { normalizeSellerOptions, sellerQuestionCatalog, sellerTypeGroups } from '~/utils/sellerValuation'

const props = defineProps<{ content: Record<string, any> }>()

const groups = sellerTypeGroups()
const optionalQuestions = sellerQuestionCatalog().filter((q) => !q.required)
const options = computed(() => normalizeSellerOptions(props.content))
const hiddenTypes = computed(() => options.value.hiddenTypes)
const hiddenQuestions = computed(() => options.value.hiddenQuestions)
const labels = computed(() => options.value.questionLabels)
const typeLabel = (t: string) => PROPERTY_TYPE_LABELS[t] || t

function toggleType(t: string, on: boolean) {
  const next = new Set(hiddenTypes.value)
  if (on) next.delete(t)
  else next.add(t)
  // Siempre queda al menos un tipo: un formulario sin tipos no se podría enviar.
  const all = groups.flatMap((g) => g.types)
  if (all.every((x) => next.has(x))) return
  props.content.hiddenTypes = [...next]
}
function toggleQuestion(key: string, on: boolean) {
  const next = new Set(hiddenQuestions.value)
  if (on) next.delete(key)
  else next.add(key)
  props.content.hiddenQuestions = [...next]
}
function setLabel(key: string, v: string) {
  const next = { ...labels.value }
  if (v.trim()) next[key] = v
  else delete next[key]
  props.content.questionLabels = next
}
</script>
